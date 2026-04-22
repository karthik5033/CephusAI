"""
AI Courtroom v2.0 — Courtroom Trial Router.

POST /api/courtroom/trial/{session_id}
    Run the adversarial courtroom simulation (Prosecutor → Defense → Judge).
    Requires a completed analysis session with BiasResult rows.
    Persists the CourtRoomVerdict to DB.

GET  /api/courtroom/{session_id}
    Retrieve the persisted verdict for a session.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import (
    AnalysisSession,
    BiasResult,
    CourtRoomVerdict,
    JudgeVerdict,
    SessionStatus,
)
from backend.services.bias_engine import load_model, run_full_analysis
from backend.services.courtroom import run_trial

logger = logging.getLogger("courtroom.trial_router")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))

router = APIRouter(prefix="/courtroom", tags=["courtroom"])


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /api/courtroom/trial/{session_id}
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/trial/{session_id}")
async def run_courtroom_trial(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Run the full adversarial courtroom simulation.

    Prerequisites:
    - Session must exist and have status='complete' (analysis done).
    - BiasResult rows must be present.

    This endpoint makes 3 real calls to the Anthropic Claude API.
    """
    # ── 1. Validate session ─────────────────────────────────────────────────
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    stmt = (
        select(AnalysisSession)
        .where(AnalysisSession.id == sid)
        .options(selectinload(AnalysisSession.bias_results))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    if session.status != SessionStatus.complete:
        raise HTTPException(
            status_code=422,
            detail=f"Session status is '{session.status.value}'. "
                   "Run bias analysis first via POST /api/analysis/run/{session_id}.",
        )

    if not session.bias_results:
        raise HTTPException(
            status_code=422,
            detail="No bias metrics found for this session. Run analysis first.",
        )

    # ── 2. Build analysis context from DB + files ───────────────────────────
    session_dir = UPLOAD_DIR / session_id
    dataset_path = session_dir / "dataset.csv"
    model_path = session_dir / "model.pkl"

    # Re-run a lightweight analysis to get shap + proxies (not stored in DB)
    analysis_context: dict = {
        "model_type": "Unknown",
        "row_count": session.row_count,
        "feature_count": session.feature_count,
        "accuracy": 0.0,
        "target_column": "",
        "primary_protected_attribute": "",
    }
    shap_values: list[dict] = []
    proxy_features: list[dict] = []

    if dataset_path.exists() and model_path.exists():
        try:
            # Infer target + sensitive from the bias results
            protected_attr = session.bias_results[0].protected_attribute
            df = pd.read_csv(str(dataset_path))
            model = load_model(str(model_path))

            # Detect target column: column NOT in feature set
            all_cols = list(df.columns)
            # Use the first binary/integer column not matching protected attr
            possible_targets = [
                c for c in all_cols
                if c.lower() != protected_attr.lower()
                and df[c].nunique() <= 10
            ]
            target_col = possible_targets[0] if possible_targets else all_cols[-1]

            full_result = run_full_analysis(
                model=model,
                df=df,
                target_column=target_col,
                sensitive_attrs=[protected_attr],
            )
            analysis_context.update({
                "model_type": full_result["model_type"],
                "row_count": full_result["row_count"],
                "feature_count": full_result["feature_count"],
                "accuracy": full_result["accuracy"],
                "target_column": full_result["target_column"],
                "primary_protected_attribute": full_result["primary_protected_attribute"],
            })
            shap_values = full_result.get("shap_values", [])
            proxy_features = full_result.get("proxy_features", [])
        except Exception as exc:
            logger.warning("Could not re-compute SHAP/proxies for trial: %s", exc)

    # ── 3. Convert DB BiasResults to dicts ──────────────────────────────────
    bias_metrics: list[dict] = []
    for br in session.bias_results:
        sev = br.severity.value if hasattr(br.severity, "value") else str(br.severity)
        if sev == "pass_":
            sev = "pass"
        bias_metrics.append({
            "protected_attribute": br.protected_attribute,
            "metric_name": br.metric_name,
            "metric_value": br.metric_value,
            "threshold": br.threshold,
            "passed": br.passed,
            "severity": sev,
            "group_breakdown": br.group_breakdown or {},
        })

    # ── 4. Run the trial (3 Claude API calls) ──────────────────────────────
    try:
        trial_result = run_trial(
            analysis=analysis_context,
            bias_metrics=bias_metrics,
            shap_values=shap_values,
            proxy_features=proxy_features,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.exception("Courtroom trial failed for session %s", session_id)
        raise HTTPException(status_code=500, detail=f"Trial simulation failed: {exc}")

    # ── 5. Persist verdict to DB ────────────────────────────────────────────
    verdict_enum = (
        JudgeVerdict.guilty
        if trial_result["judge_verdict"] == "guilty"
        else JudgeVerdict.not_guilty
    )

    verdict_row = CourtRoomVerdict(
        session_id=sid,
        prosecution_argument=trial_result["prosecution_argument"],
        defense_argument=trial_result["defense_argument"],
        judge_verdict=verdict_enum,
        bias_risk_score=trial_result["bias_risk_score"],
        judge_reasoning=trial_result["judge_reasoning"],
        recommended_sentence=trial_result["recommended_sentence"],
    )
    db.add(verdict_row)
    await db.commit()
    await db.refresh(verdict_row)

    logger.info(
        "Trial complete: session=%s verdict=%s risk=%d",
        session_id,
        trial_result["judge_verdict"],
        trial_result["bias_risk_score"],
    )

    return {
        "session_id": session_id,
        "verdict_id": str(verdict_row.id),
        "prosecution_argument": trial_result["prosecution_argument"],
        "defense_argument": trial_result["defense_argument"],
        "judge_verdict": trial_result["judge_verdict"],
        "bias_risk_score": trial_result["bias_risk_score"],
        "judge_reasoning": trial_result["judge_reasoning"],
        "recommended_sentence": trial_result["recommended_sentence"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  GET /api/courtroom/{session_id}
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{session_id}")
async def get_verdict(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the persisted courtroom verdict for a session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    stmt = (
        select(CourtRoomVerdict)
        .where(CourtRoomVerdict.session_id == sid)
        .order_by(CourtRoomVerdict.created_at.desc())
    )
    result = await db.execute(stmt)
    verdict = result.scalar_one_or_none()

    if verdict is None:
        return {
            "session_id": session_id,
            "status": "no_verdict",
            "message": "No trial has been run for this session yet. "
                       "Call POST /api/courtroom/trial/{session_id} first.",
        }

    return {
        "session_id": session_id,
        "verdict_id": str(verdict.id),
        "prosecution_argument": verdict.prosecution_argument,
        "defense_argument": verdict.defense_argument,
        "judge_verdict": verdict.judge_verdict.value if hasattr(verdict.judge_verdict, "value") else str(verdict.judge_verdict),
        "bias_risk_score": verdict.bias_risk_score,
        "judge_reasoning": verdict.judge_reasoning,
        "recommended_sentence": verdict.recommended_sentence,
        "created_at": verdict.created_at.isoformat() if verdict.created_at else None,
    }
