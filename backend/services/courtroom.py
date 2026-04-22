"""
AI Courtroom v2.0 — Courtroom Simulation Service.

Uses the Anthropic Claude API (claude-sonnet-4-20250514) to run three adversarial
agents against the bias analysis results:

  1. PROSECUTOR — argues that the model is biased and harmful
  2. DEFENSE    — argues the model is fair or that bias is mitigable
  3. JUDGE      — delivers a reasoned verdict with a risk score and sentence

Every call is a real HTTP request to the Anthropic API.  Zero mocked data.
"""

from __future__ import annotations

import json
import logging
from backend.services.llm import get_llm_client

logger = logging.getLogger("courtroom.simulation")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_metrics_for_prompt(bias_metrics: list[dict]) -> str:
    """Render bias metrics as a human-readable block for prompts."""
    lines: list[str] = []
    for m in bias_metrics:
        status = "✅ PASSED" if m["passed"] else f"❌ FAILED ({m['severity'].upper()})"
        lines.append(
            f"  • {m['metric_name']}: {m['metric_value']:.4f}  "
            f"(threshold: {m['threshold']})  {status}"
        )
        gb = m.get("group_breakdown", {})
        if gb.get("selection_rates"):
            rates = ", ".join(f"{g}: {v:.4f}" for g, v in gb["selection_rates"].items())
            lines.append(f"    Selection rates: {rates}")
    return "\n".join(lines)


def _format_shap_for_prompt(shap_values: list[dict]) -> str:
    lines: list[str] = []
    for s in shap_values:
        proxy_tag = " ⚠️ PROXY/PROTECTED" if s.get("is_proxy") else ""
        lines.append(
            f"  • {s['feature']}: importance={s['importance']:.4f}{proxy_tag}"
        )
    return "\n".join(lines)


def _format_proxies_for_prompt(proxies: list[dict]) -> str:
    if not proxies:
        return "  (none detected)"
    return "\n".join(
        f"  • {p['feature']} correlates with {p['corr_with']} (r={p['correlation']:.4f})"
        for p in proxies
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  Prosecution
# ═══════════════════════════════════════════════════════════════════════════════

def generate_prosecution(
    analysis: dict,
    bias_metrics: list[dict],
    shap_values: list[dict],
    proxy_features: list[dict],
) -> str:
    """Call Claude to generate the prosecution argument."""
    client = _get_client()

    metrics_text = _format_metrics_for_prompt(bias_metrics)
    shap_text = _format_shap_for_prompt(shap_values)
    proxy_text = _format_proxies_for_prompt(proxy_features)

    prompt = f"""You are an aggressive AI bias prosecutor in the AI Courtroom.  Your job
is to make the STRONGEST possible case that this AI model is GUILTY of
discriminatory bias and should NOT be deployed.

EVIDENCE — BIAS ANALYSIS RESULTS:
Model type: {analysis.get('model_type', 'Unknown')}
Dataset: {analysis.get('row_count', '?')} rows, {analysis.get('feature_count', '?')} features
Target column: {analysis.get('target_column', '?')}
Protected attribute: {analysis.get('primary_protected_attribute', '?')}
Model accuracy: {analysis.get('accuracy', '?')}

FAIRNESS METRICS:
{metrics_text}

SHAP FEATURE IMPORTANCE (top features driving predictions):
{shap_text}

PROXY FEATURES (correlated with protected attribute):
{proxy_text}

INSTRUCTIONS:
1. Open with a powerful statement about why this model is dangerous.
2. Reference SPECIFIC metric values and thresholds that were violated.
3. Highlight any proxy features or protected attributes with high SHAP importance.
4. Cite the disparate impact between specific demographic groups using the selection rates.
5. Argue for the real-world harm this model could cause if deployed.
6. Conclude with a demand for a GUILTY verdict.

Write 3-5 paragraphs.  Be specific with numbers.  Be persuasive.  No hedging."""

    logger.info("Calling LLM for prosecution argument…")
    llm = get_llm_client()
    text = llm.chat(
        system="",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.7
    )
    logger.info("Prosecution argument generated (%d chars)", len(text))
    return text


# ═══════════════════════════════════════════════════════════════════════════════
#  Defense
# ═══════════════════════════════════════════════════════════════════════════════

def generate_defense(
    analysis: dict,
    bias_metrics: list[dict],
    shap_values: list[dict],
    proxy_features: list[dict],
    prosecution_text: str,
) -> str:
    """Call Claude to generate the defense argument, rebutting the prosecution."""
    client = _get_client()

    metrics_text = _format_metrics_for_prompt(bias_metrics)
    shap_text = _format_shap_for_prompt(shap_values)

    prompt = f"""You are a skilled AI defense attorney in the AI Courtroom.  The prosecution
has just made their case.  Your job is to mount the STRONGEST possible defense
that this AI model is NOT GUILTY or that any bias is mitigable.

THE PROSECUTION ARGUED:
{prosecution_text}

EVIDENCE — BIAS ANALYSIS RESULTS:
Model type: {analysis.get('model_type', 'Unknown')}
Accuracy: {analysis.get('accuracy', '?')}
Protected attribute: {analysis.get('primary_protected_attribute', '?')}

FAIRNESS METRICS:
{metrics_text}

SHAP FEATURE IMPORTANCE:
{shap_text}

INSTRUCTIONS:
1. Acknowledge the metrics but reframe them — context matters.
2. Highlight any metrics that DID pass their thresholds.
3. Point out the model's accuracy and utility.
4. Argue that proxy features may be legitimately predictive, not just discriminatory.
5. Propose concrete remediation steps (reweighting, threshold adjustment, feature removal).
6. Argue the model deserves a chance at remediation rather than outright condemnation.
7. Conclude with a plea for NOT GUILTY or leniency.

Write 3-5 paragraphs.  Be specific with numbers.  Counter the prosecution's key points."""

    logger.info("Calling LLM for defense argument…")
    llm = get_llm_client()
    text = llm.chat(
        system="",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=1500,
        temperature=0.7
    )
    logger.info("Defense argument generated (%d chars)", len(text))
    return text


# ═══════════════════════════════════════════════════════════════════════════════
#  Judge
# ═══════════════════════════════════════════════════════════════════════════════

def generate_verdict(
    analysis: dict,
    bias_metrics: list[dict],
    prosecution_text: str,
    defense_text: str,
) -> dict:
    """
    Call Claude as the judge.  Returns a structured verdict dict:
    {
        verdict: "guilty" | "not_guilty",
        bias_risk_score: int (0-100),
        reasoning: str,
        recommended_sentence: str,
    }
    """
    client = _get_client()

    metrics_text = _format_metrics_for_prompt(bias_metrics)

    prompt = f"""You are the impartial AI Judge in the AI Courtroom.  You have heard both
sides.  You must now deliver a REASONED verdict.

PROSECUTION ARGUMENT:
{prosecution_text}

DEFENSE ARGUMENT:
{defense_text}

FACTUAL EVIDENCE — FAIRNESS METRICS:
{metrics_text}

Model accuracy: {analysis.get('accuracy', '?')}
Protected attribute: {analysis.get('primary_protected_attribute', '?')}

INSTRUCTIONS:
You must return ONLY a valid JSON object (no markdown, no extra text) with
exactly these fields:

{{
  "verdict": "guilty" or "not_guilty",
  "bias_risk_score": <integer 0-100 where 100 is most biased>,
  "reasoning": "<3-4 paragraphs explaining your decision, referencing specific metrics and arguments from both sides>",
  "recommended_sentence": "<specific remediation requirements if guilty, or deployment conditions if not guilty>"
}}

JUDGING CRITERIA:
- If ANY metric has severity "critical", lean toward guilty.
- If all metrics pass, lean toward not_guilty.
- Consider the strength of both arguments.
- The bias_risk_score should reflect the severity and breadth of bias found.
- The sentence should be actionable and specific.

Return ONLY the JSON object."""

    logger.info("Calling LLM for judge verdict…")
    llm = get_llm_client()
    raw = llm.chat(
        system="",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=2000,
        temperature=0.3
    )

    # Strip markdown fences if Claude wraps it
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        verdict_data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse judge verdict JSON: %s\nRaw: %s", exc, raw[:500])
        # Fallback: extract what we can
        verdict_data = {
            "verdict": "guilty" if any(m["severity"] == "critical" for m in bias_metrics) else "not_guilty",
            "bias_risk_score": 50,
            "reasoning": raw,
            "recommended_sentence": "Manual review required — judge output was not parseable as JSON.",
        }

    # Clamp risk score
    score = int(verdict_data.get("bias_risk_score", 50))
    verdict_data["bias_risk_score"] = max(0, min(100, score))

    # Normalise verdict string
    v = str(verdict_data.get("verdict", "guilty")).lower().replace(" ", "_")
    if v not in ("guilty", "not_guilty"):
        v = "guilty"
    verdict_data["verdict"] = v

    logger.info(
        "Judge verdict: %s (risk=%d)",
        verdict_data["verdict"],
        verdict_data["bias_risk_score"],
    )
    return verdict_data


# ═══════════════════════════════════════════════════════════════════════════════
#  Full trial orchestration
# ═══════════════════════════════════════════════════════════════════════════════

def run_trial(
    analysis: dict,
    bias_metrics: list[dict],
    shap_values: list[dict],
    proxy_features: list[dict],
) -> dict:
    """
    Run the full 3-phase courtroom trial.  Returns:
    {
        prosecution_argument: str,
        defense_argument: str,
        judge_verdict: str,
        bias_risk_score: int,
        judge_reasoning: str,
        recommended_sentence: str,
    }
    """
    prosecution = generate_prosecution(analysis, bias_metrics, shap_values, proxy_features)
    defense = generate_defense(analysis, bias_metrics, shap_values, proxy_features, prosecution)
    verdict = generate_verdict(analysis, bias_metrics, prosecution, defense)

    return {
        "prosecution_argument": prosecution,
        "defense_argument": defense,
        "judge_verdict": verdict["verdict"],
        "bias_risk_score": verdict["bias_risk_score"],
        "judge_reasoning": verdict["reasoning"],
        "recommended_sentence": verdict["recommended_sentence"],
    }
