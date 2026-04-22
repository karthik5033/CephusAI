"""
AI Courtroom v2.0 — Sessions Listing Router.

GET /api/sessions  — list all analysis sessions with summary data
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import (
    AnalysisSession,
    CourtRoomVerdict,
    RemediationRun,
)

logger = logging.getLogger("courtroom.sessions")

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
):
    """
    Return all analysis sessions ordered by most recent first.
    Includes summary flags: has_verdict, has_remediation, metric_count.
    """
    stmt = (
        select(AnalysisSession)
        .options(
            selectinload(AnalysisSession.bias_results),
            selectinload(AnalysisSession.verdicts),
            selectinload(AnalysisSession.remediation_runs),
        )
        .order_by(AnalysisSession.created_at.desc())
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        # Determine overall severity from bias results
        severities = [br.severity.value if hasattr(br.severity, "value") else str(br.severity) for br in s.bias_results]
        overall_severity = "none"
        if "critical" in severities:
            overall_severity = "critical"
        elif "warning" in severities:
            overall_severity = "warning"
        elif severities:
            overall_severity = "pass"

        # Verdict info
        latest_verdict = None
        if s.verdicts:
            v = sorted(s.verdicts, key=lambda x: x.created_at or "", reverse=True)[0]
            verd = v.judge_verdict.value if hasattr(v.judge_verdict, "value") else str(v.judge_verdict)
            latest_verdict = {
                "verdict": verd,
                "risk_score": v.bias_risk_score,
            }

        # Remediation info
        latest_remediation = None
        if s.remediation_runs:
            r = sorted(s.remediation_runs, key=lambda x: x.created_at or "", reverse=True)[0]
            latest_remediation = {
                "strategy": r.strategy_used,
                "status": r.status.value if hasattr(r.status, "value") else str(r.status),
                "mitigated_dir": r.mitigated_dir,
            }

        items.append({
            "session_id": str(s.id),
            "dataset_filename": s.dataset_filename,
            "model_filename": s.model_filename,
            "status": s.status.value if hasattr(s.status, "value") else str(s.status),
            "row_count": s.row_count,
            "feature_count": s.feature_count,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "metric_count": len(s.bias_results),
            "overall_severity": overall_severity,
            "verdict": latest_verdict,
            "remediation": latest_remediation,
        })

    return {"sessions": items, "total": len(items)}
