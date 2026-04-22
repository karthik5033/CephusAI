"""
AI Courtroom v2.0 — Dataset Review Router.

Phase 0: Data-Minimisation Check (no model required).

POST /api/dataset-review/run/{session_id}
    Run column analysis + LLM review for a dataset.

GET  /api/dataset-review/{session_id}
    Retrieve the most recent dataset review.

PATCH /api/dataset-review/{session_id}/overrides
    Save user overrides for column decisions.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import AnalysisSession, DatasetReview
from backend.services.dataset_review import run_dataset_review

logger = logging.getLogger("courtroom.dataset_review_router")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))

router = APIRouter(prefix="/dataset-review", tags=["dataset-review"])


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class RunDatasetReviewRequest(BaseModel):
    intended_use: str = Field(
        ...,
        description="Purpose category: loan_credit | hiring_screening | insurance_pricing | custom",
    )
    purpose_description: str = Field(
        ...,
        description="Free-text description of the intended use and decision.",
    )
    target_column: str | None = Field(
        default=None,
        description="Optional target column for feature relevance scoring.",
    )


class OverrideEntry(BaseModel):
    column_name: str
    decision: str = Field(..., description="keep_as_feature | keep_as_identifier_only | remove_or_mask")
    justification: str = Field(default="", description="User's reason for the override.")


class SaveOverridesRequest(BaseModel):
    overrides: list[OverrideEntry]


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /api/dataset-review/run/{session_id}
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/run/{session_id}")
async def run_dataset_review_endpoint(
    session_id: str,
    body: RunDatasetReviewRequest,
    db: AsyncSession = Depends(get_db),
):
    """Run Phase 0 data-minimisation review on the uploaded dataset."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    session = await db.get(AnalysisSession, sid)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # Load dataset
    dataset_path = UPLOAD_DIR / session_id / "dataset.csv"
    if not dataset_path.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found on disk.")

    try:
        df = pd.read_csv(str(dataset_path))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {exc}")

    # Update session with purpose
    session.intended_use = body.intended_use
    session.purpose_description = body.purpose_description
    await db.commit()

    # Run the review pipeline
    try:
        result = run_dataset_review(
            df=df,
            intended_use=body.intended_use,
            purpose_description=body.purpose_description,
            target_column=body.target_column,
        )
    except Exception as exc:
        logger.exception("Dataset review failed for session %s", session_id)
        raise HTTPException(status_code=500, detail=f"Dataset review failed: {exc}")

    # Persist review
    review = DatasetReview(
        session_id=sid,
        intended_use=body.intended_use,
        purpose_description=body.purpose_description,
        column_metadata=result["column_metadata"],
        candidate_targets=result["candidate_targets"],
        llm_review=result["llm_review"],
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)

    logger.info("Dataset review complete: session=%s purpose=%s", session_id, body.intended_use)

    return {
        "session_id": session_id,
        "review_id": str(review.id),
        "intended_use": body.intended_use,
        "purpose_description": body.purpose_description,
        "column_metadata": result["column_metadata"],
        "candidate_targets": result["candidate_targets"],
        "llm_review": result["llm_review"],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  GET /api/dataset-review/{session_id}
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/{session_id}")
async def get_dataset_review(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the most recent dataset review for a session."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    stmt = (
        select(DatasetReview)
        .where(DatasetReview.session_id == sid)
        .order_by(DatasetReview.created_at.desc())
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()

    if review is None:
        return {
            "session_id": session_id,
            "status": "no_review",
            "message": "No dataset review has been run for this session.",
        }

    return {
        "session_id": session_id,
        "review_id": str(review.id),
        "intended_use": review.intended_use,
        "purpose_description": review.purpose_description,
        "column_metadata": review.column_metadata,
        "candidate_targets": review.candidate_targets,
        "llm_review": review.llm_review,
        "user_overrides": review.user_overrides,
        "created_at": review.created_at.isoformat() if review.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  PATCH /api/dataset-review/{session_id}/overrides
# ═══════════════════════════════════════════════════════════════════════════════

@router.patch("/{session_id}/overrides")
async def save_overrides(
    session_id: str,
    body: SaveOverridesRequest,
    db: AsyncSession = Depends(get_db),
):
    """Save user overrides for column decisions (human-in-the-loop)."""
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    stmt = (
        select(DatasetReview)
        .where(DatasetReview.session_id == sid)
        .order_by(DatasetReview.created_at.desc())
    )
    result = await db.execute(stmt)
    review = result.scalar_one_or_none()

    if review is None:
        raise HTTPException(status_code=404, detail="No dataset review found. Run review first.")

    overrides = [o.model_dump() for o in body.overrides]
    review.user_overrides = overrides
    await db.commit()
    await db.refresh(review)

    logger.info("User overrides saved: session=%s, %d overrides", session_id, len(overrides))

    return {
        "session_id": session_id,
        "review_id": str(review.id),
        "overrides_saved": len(overrides),
        "user_overrides": overrides,
    }
