"""
AI Courtroom v2.0 — Dataset Review (Data-Minimisation) Service.

Phase 0: analyse a dataset *before* model training to check whether the
columns collected are adequate, relevant, and limited to what is necessary
for the stated purpose.

Pipeline:
  1. Infer column types (numeric, categorical, datetime, text, identifier).
  2. Auto-tag sensitive attributes and identifiers via regex heuristics.
  3. Apply purpose-based rules (loan, hiring, insurance, custom).
  4. Optionally score feature relevance against a target column.
  5. Call LLM for a structured natural-language review.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import numpy as np
import pandas as pd

from backend.services.llm import get_llm_client

logger = logging.getLogger("courtroom.dataset_review")


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 1: Column Type Inference
# ═══════════════════════════════════════════════════════════════════════════════

def infer_column_types(df: pd.DataFrame) -> list[dict]:
    """Return a list of {name, inferred_type, n_unique, sample_values}."""
    results = []
    for col in df.columns:
        s = df[col]
        n_unique = int(s.nunique())
        n_total = len(s)
        sample = [str(v) for v in s.dropna().head(3).tolist()]

        # Datetime
        if pd.api.types.is_datetime64_any_dtype(s):
            ctype = "datetime"
        elif s.dtype == "object":
            # Try parsing as dates
            try:
                pd.to_datetime(s.dropna().head(20), infer_datetime_format=True)
                ctype = "datetime"
            except (ValueError, TypeError):
                pass
            # Free text vs categorical
            if n_unique > min(50, n_total * 0.5):
                avg_len = s.dropna().astype(str).str.len().mean()
                ctype = "free_text" if avg_len > 50 else "categorical"
            else:
                ctype = "categorical"
        elif pd.api.types.is_bool_dtype(s):
            ctype = "boolean"
        elif pd.api.types.is_integer_dtype(s) or pd.api.types.is_float_dtype(s):
            ctype = "numeric"
        else:
            ctype = "other"

        results.append({
            "name": col,
            "inferred_type": ctype,
            "n_unique": n_unique,
            "sample_values": sample,
        })
    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 2: Auto-Tagging (Sensitive / Identifier)
# ═══════════════════════════════════════════════════════════════════════════════

_SENSITIVE_PATTERNS = re.compile(
    r"\b("
    r"age|dob|date_of_birth|birth|gender|sex|male|female|"
    r"race|ethnicity|ethnic|religion|religious|"
    r"marital|married|divorced|single|widow|"
    r"disability|disabled|health|medical|"
    r"nationality|national_origin|immigration|"
    r"pregnancy|pregnant|"
    r"sexual_orientation|lgbtq|"
    r"veteran|military"
    r")\b",
    re.IGNORECASE,
)

_IDENTIFIER_PATTERNS = re.compile(
    r"\b("
    r"id|uuid|_id|row_id|user_id|customer_id|"
    r"email|e_mail|phone|telephone|"
    r"ssn|social_security|national_id|passport|"
    r"name|first_name|last_name|surname|"
    r"address|street|zip|zipcode|postal_code"
    r")\b",
    re.IGNORECASE,
)


def auto_tag_columns(col_metadata: list[dict]) -> list[dict]:
    """Add is_sensitive and is_identifier flags based on column names."""
    for col in col_metadata:
        name = col["name"]
        col["is_sensitive"] = bool(_SENSITIVE_PATTERNS.search(name))
        col["is_identifier"] = bool(_IDENTIFIER_PATTERNS.search(name))
    return col_metadata


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 3: Purpose-Based Rules Engine
# ═══════════════════════════════════════════════════════════════════════════════

PURPOSE_RULES: dict[str, dict[str, list[str]]] = {
    "loan_credit": {
        "likely_necessary": [
            "income", "salary", "employment", "emp_length", "job",
            "debt", "loan_amount", "loan_purpose", "credit",
            "payment", "installment", "interest", "balance",
            "annual_inc", "dti", "delinq", "fico", "revol",
        ],
        "sensitive_but_justifiable": [
            "age", "dob", "zip", "zipcode", "postcode", "state",
            "home_ownership", "addr_state",
        ],
        "usually_unnecessary": [
            "name", "first_name", "last_name", "email", "phone",
            "ssn", "national_id", "social_media", "twitter",
            "facebook", "instagram", "religion", "ethnicity",
            "race", "gender", "sex", "marital", "pregnancy",
            "health", "medical", "disability", "genetic",
        ],
    },
    "hiring_screening": {
        "likely_necessary": [
            "skill", "experience", "education", "degree",
            "test_score", "gpa", "certification", "qualification",
            "years", "role", "position", "department",
        ],
        "sensitive_but_justifiable": [
            "age", "veteran", "disability",
        ],
        "usually_unnecessary": [
            "race", "gender", "sex", "religion", "ethnicity",
            "marital", "pregnancy", "health", "genetic",
            "sexual_orientation", "nationality", "photo",
            "social_media", "weight", "height",
        ],
    },
    "insurance_pricing": {
        "likely_necessary": [
            "claim", "premium", "coverage", "policy",
            "asset_value", "usage", "mileage", "driving",
            "accident", "risk", "deductible",
        ],
        "sensitive_but_justifiable": [
            "age", "dob", "health", "medical", "smoker",
            "bmi", "zip", "postcode",
        ],
        "usually_unnecessary": [
            "race", "gender", "sex", "religion", "ethnicity",
            "genetic", "pregnancy", "sexual_orientation",
            "social_media", "name", "email", "phone",
        ],
    },
}


def _matches_any(col_name: str, keywords: list[str]) -> bool:
    """Check if column name contains any of the keywords."""
    lower = col_name.lower()
    return any(kw in lower for kw in keywords)


def classify_columns(
    col_metadata: list[dict],
    purpose: str,
) -> list[dict]:
    """Assign a static_category to each column based on purpose rules."""
    rules = PURPOSE_RULES.get(purpose, {})
    necessary = rules.get("likely_necessary", [])
    justifiable = rules.get("sensitive_but_justifiable", [])
    unnecessary = rules.get("usually_unnecessary", [])

    for col in col_metadata:
        name = col["name"]

        if col.get("is_identifier"):
            col["static_category"] = "identifier_only"
        elif _matches_any(name, unnecessary) or (col.get("is_sensitive") and not _matches_any(name, justifiable)):
            col["static_category"] = "high_risk_unnecessary"
        elif _matches_any(name, justifiable) or col.get("is_sensitive"):
            col["static_category"] = "sensitive_but_justifiable"
        elif _matches_any(name, necessary):
            col["static_category"] = "required_for_purpose"
        else:
            col["static_category"] = "possibly_required"

    return col_metadata


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 4: Candidate Target Detection
# ═══════════════════════════════════════════════════════════════════════════════

def detect_candidate_targets(df: pd.DataFrame) -> list[dict]:
    """Identify columns that could be prediction targets (binary/multiclass)."""
    candidates = []
    for col in df.columns:
        n_unique = df[col].nunique()
        if 2 <= n_unique <= 20:
            candidates.append({
                "name": col,
                "n_classes": n_unique,
                "values": [str(v) for v in df[col].unique()[:10]],
            })
    return candidates


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 5: Feature Relevance Scoring (optional, requires target)
# ═══════════════════════════════════════════════════════════════════════════════

def compute_feature_relevance(
    df: pd.DataFrame,
    target_column: str,
    col_metadata: list[dict],
) -> list[dict]:
    """Compute mutual information relevance scores for numeric/encoded features."""
    try:
        from sklearn.feature_selection import mutual_info_classif
    except ImportError:
        logger.warning("sklearn not available for feature relevance.")
        return col_metadata

    if target_column not in df.columns:
        return col_metadata

    y = df[target_column]
    feature_cols = [c["name"] for c in col_metadata if c["name"] != target_column]

    # Encode categoricals
    X = pd.DataFrame()
    for col_name in feature_cols:
        s = df[col_name]
        if pd.api.types.is_numeric_dtype(s):
            X[col_name] = s.fillna(0)
        else:
            X[col_name] = s.astype("category").cat.codes

    if X.empty or len(X) < 10:
        return col_metadata

    try:
        mi_scores = mutual_info_classif(X, y, random_state=42)
        max_mi = mi_scores.max() if mi_scores.max() > 0 else 1.0
        normalized = mi_scores / max_mi

        score_map = dict(zip(feature_cols, normalized))
        for col in col_metadata:
            col["feature_relevance_score"] = round(float(score_map.get(col["name"], 0.0)), 4)
    except Exception as exc:
        logger.warning("Feature relevance computation failed: %s", exc)

    return col_metadata


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 6: LLM Review
# ═══════════════════════════════════════════════════════════════════════════════

DATASET_REVIEW_SYSTEM_PROMPT = """You are a data protection and ML fairness analyst inside an AI governance platform called "AI Courtroom".

You receive:
- The schema of a tabular dataset (column names, inferred types, basic statistics).
- A stated PURPOSE describing what decision this dataset will support.
- A rule-based classification of each column: required_for_purpose, possibly_required, sensitive_but_justifiable, high_risk_unnecessary, identifier_only.
- Optionally, simple feature relevance scores to a proposed target column.

Your job is to:
1) Assess whether each column is adequate, relevant, and limited to what is necessary for the stated purpose (data minimisation).
2) Flag high-risk or unnecessary attributes, especially sensitive personal data not clearly needed.
3) Provide a short, structured recommendation for which columns should be:
   - kept as features,
   - kept only as identifiers (not used in training),
   - removed or masked before model training.

Base your reasoning strictly on the inputs and on data minimisation principles.
Do NOT make legal conclusions; instead, provide factual, risk-based observations.

Return ONLY a JSON object with this schema:
{
  "headline": "One-sentence summary of whether the dataset respects data minimisation for this purpose.",
  "columns": [
    {
      "name": "column_name",
      "decision": "keep_as_feature | keep_as_identifier_only | remove_or_mask",
      "reason": "1-2 sentence explanation tied to the stated purpose and static_category.",
      "risk_level": "low | medium | high"
    }
  ],
  "overall_recommendations": [
    "Short bullet-style recommendations for the data owner."
  ]
}"""


def run_llm_dataset_review(
    purpose_description: str,
    col_metadata: list[dict],
) -> dict:
    """Call LLM to produce a structured dataset review."""
    llm = get_llm_client()

    # Build slim metadata for prompt
    slim = []
    for c in col_metadata:
        entry: dict[str, Any] = {
            "name": c["name"],
            "inferred_type": c["inferred_type"],
            "static_category": c.get("static_category", "possibly_required"),
            "is_sensitive": c.get("is_sensitive", False),
            "is_identifier": c.get("is_identifier", False),
        }
        if "feature_relevance_score" in c:
            entry["feature_relevance_score"] = c["feature_relevance_score"]
        slim.append(entry)

    prompt = f"""Here is the dataset review context:

PURPOSE:
{purpose_description}

COLUMN_METADATA (JSON):
```json
{json.dumps(slim, indent=2)}
```

Generate the JSON object. Return ONLY the JSON, no extra prose."""

    logger.info("Calling LLM for dataset review (%d columns)…", len(slim))
    raw = llm.chat(
        system=DATASET_REVIEW_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=3000,
        temperature=0.15,
    )

    # Strip markdown fences
    if raw.strip().startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end])
            except json.JSONDecodeError:
                pass
        logger.warning("LLM dataset review JSON parse failed.")
        return {
            "headline": "Dataset review completed but structured output could not be parsed.",
            "columns": [],
            "overall_recommendations": [raw[:500]],
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  Full Pipeline
# ═══════════════════════════════════════════════════════════════════════════════

# Map UI dropdown values to internal purpose keys
PURPOSE_MAP: dict[str, str] = {
    "loan_credit": "loan_credit",
    "hiring_screening": "hiring_screening",
    "insurance_pricing": "insurance_pricing",
    "custom": "custom",
}


def run_dataset_review(
    df: pd.DataFrame,
    intended_use: str,
    purpose_description: str,
    target_column: str | None = None,
) -> dict:
    """
    Full Phase 0 pipeline:
      1. Infer types  →  2. Auto-tag  →  3. Classify by purpose
      →  4. Feature relevance (if target given)  →  5. LLM review
    """
    purpose_key = PURPOSE_MAP.get(intended_use, "custom")

    # Steps 1–2
    col_metadata = infer_column_types(df)
    col_metadata = auto_tag_columns(col_metadata)

    # Step 3
    col_metadata = classify_columns(col_metadata, purpose_key)

    # Step 4: Candidate targets
    candidate_targets = detect_candidate_targets(df)

    # Step 5: Feature relevance
    if target_column and target_column in df.columns:
        col_metadata = compute_feature_relevance(df, target_column, col_metadata)

    # Step 6: LLM review
    llm_review = run_llm_dataset_review(purpose_description, col_metadata)

    return {
        "column_metadata": col_metadata,
        "candidate_targets": candidate_targets,
        "llm_review": llm_review,
        "purpose": intended_use,
        "purpose_description": purpose_description,
    }
