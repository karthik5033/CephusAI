"""
AI Courtroom v2.0 — Report Download Router.

GET /api/reports/{session_id}/pdf   — Download PDF audit report
GET /api/reports/{session_id}/docx  — Download DOCX audit report

Both endpoints pull real data from the DB (session, bias metrics, verdict,
remediation) and generate the report on-the-fly.
"""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import (
    AnalysisSession,
    CourtRoomVerdict,
    RemediationRun,
)
from backend.services.report_generator import generate_pdf_report, generate_docx_report

logger = logging.getLogger("courtroom.reports")

router = APIRouter(prefix="/reports", tags=["reports"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _gather_report_data(session_id: str, db: AsyncSession) -> dict:
    """Pull all report data from the DB for a given session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    # Session + bias results
    stmt = (
        select(AnalysisSession)
        .where(AnalysisSession.id == sid)
        .options(selectinload(AnalysisSession.bias_results))
    )
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    session_dict = {
        "session_id": session_id,
        "dataset_filename": session.dataset_filename,
        "model_filename": session.model_filename,
        "row_count": session.row_count,
        "feature_count": session.feature_count,
        "status": session.status.value if hasattr(session.status, "value") else str(session.status),
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }

    # Bias metrics
    bias_metrics = []
    for br in session.bias_results:
        sev = br.severity.value if hasattr(br.severity, "value") else str(br.severity)
        bias_metrics.append({
            "protected_attribute": br.protected_attribute,
            "metric_name": br.metric_name,
            "metric_value": br.metric_value,
            "threshold": br.threshold,
            "passed": br.passed,
            "severity": sev,
            "group_breakdown": br.group_breakdown,
        })

    # Verdict (most recent)
    verdict_stmt = (
        select(CourtRoomVerdict)
        .where(CourtRoomVerdict.session_id == sid)
        .order_by(CourtRoomVerdict.created_at.desc())
    )
    vr = await db.execute(verdict_stmt)
    verdict_row = vr.scalar_one_or_none()
    verdict_dict = None
    if verdict_row:
        verdict_dict = {
            "judge_verdict": verdict_row.judge_verdict.value if hasattr(verdict_row.judge_verdict, "value") else str(verdict_row.judge_verdict),
            "bias_risk_score": verdict_row.bias_risk_score,
            "prosecution_argument": verdict_row.prosecution_argument,
            "defense_argument": verdict_row.defense_argument,
            "judge_reasoning": verdict_row.judge_reasoning,
            "recommended_sentence": verdict_row.recommended_sentence,
        }

    # Remediation (most recent)
    rem_stmt = (
        select(RemediationRun)
        .where(RemediationRun.session_id == sid)
        .order_by(RemediationRun.created_at.desc())
    )
    rr = await db.execute(rem_stmt)
    rem_row = rr.scalar_one_or_none()
    rem_dict = None
    if rem_row:
        rem_dict = {
            "strategy": rem_row.strategy_used,
            "original_accuracy": rem_row.original_accuracy,
            "mitigated_accuracy": rem_row.mitigated_accuracy,
            "original_dir": rem_row.original_dir,
            "mitigated_dir": rem_row.mitigated_dir,
        }

    return {
        "session": session_dict,
        "bias_metrics": bias_metrics,
        "verdict": verdict_dict,
        "remediation": rem_dict,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  GET /api/reports/{session_id}/pdf
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{session_id}/pdf")
async def download_pdf(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate and download a PDF audit report."""
    data = await _gather_report_data(session_id, db)

    try:
        pdf_bytes = generate_pdf_report(
            session=data["session"],
            bias_metrics=data["bias_metrics"],
            verdict=data["verdict"],
            remediation=data["remediation"],
        )
    except Exception as exc:
        logger.exception("PDF generation failed for session %s", session_id)
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    filename = f"audit_report_{session_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  GET /api/reports/{session_id}/docx
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{session_id}/docx")
async def download_docx(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate and download a DOCX audit report."""
    data = await _gather_report_data(session_id, db)

    try:
        docx_bytes = generate_docx_report(
            session=data["session"],
            bias_metrics=data["bias_metrics"],
            verdict=data["verdict"],
            remediation=data["remediation"],
        )
    except Exception as exc:
        logger.exception("DOCX generation failed for session %s", session_id)
        raise HTTPException(status_code=500, detail=f"DOCX generation failed: {exc}")

    filename = f"audit_report_{session_id[:8]}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
