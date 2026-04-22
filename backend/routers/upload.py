"""
AI Courtroom v2.0 — File Upload Endpoints.

POST /api/upload/dataset   — upload CSV, create AnalysisSession
POST /api/upload/model     — upload .pkl/.joblib sklearn estimator
POST /api/upload/script    — upload .py training script
"""

import ast
import logging
import os
import uuid
from pathlib import Path
from typing import Optional

import joblib
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models import AnalysisSession, SessionStatus

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

logger = logging.getLogger("courtroom.upload")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100")) * 1024 * 1024

router = APIRouter(prefix="/upload", tags=["upload"])

# Protected-attribute keywords we scan column names for
PROTECTED_KEYWORDS = {"gender", "sex", "race", "ethnicity", "age"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_dir(session_id: uuid.UUID) -> Path:
    """Return (and create) the per-session upload directory."""
    d = UPLOAD_DIR / str(session_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _detect_protected_attributes(columns: list[str]) -> list[str]:
    """Return column names that look like protected attributes."""
    found: list[str] = []
    for col in columns:
        normalised = col.strip().lower().replace("-", "").replace("_", "")
        for kw in PROTECTED_KEYWORDS:
            if kw in normalised:
                found.append(col)
                break
    return found


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /api/upload/dataset
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/dataset")
async def upload_dataset(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a CSV file, validate it, persist to disk, and create an AnalysisSession.
    Returns session_id, row_count, column_names, detected_protected_attributes.
    """
    # ── 1. Extension check ──────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=422,
            detail="Only CSV files are accepted. Received: "
                   f"{file.filename!r}",
        )

    # ── 2. Read bytes & size guard ──────────────────────────────────────────
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024*1024)} MB limit.",
        )

    # ── 3. Parse as CSV ─────────────────────────────────────────────────────
    try:
        import io
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse CSV: {exc}",
        )

    if len(df) < 500:
        raise HTTPException(
            status_code=422,
            detail=f"Dataset must have at least 500 rows. This file has {len(df)}.",
        )

    # ── 4. Detect protected attributes ──────────────────────────────────────
    column_names = list(df.columns)
    protected = _detect_protected_attributes(column_names)
    if not protected:
        raise HTTPException(
            status_code=422,
            detail="No protected-attribute column detected. "
                   "Expected at least one column containing: "
                   f"{', '.join(sorted(PROTECTED_KEYWORDS))}. "
                   f"Columns found: {column_names}",
        )

    # ── 5. Create DB record ─────────────────────────────────────────────────
    session_id = uuid.uuid4()
    session = AnalysisSession(
        id=session_id,
        dataset_filename=file.filename,
        status=SessionStatus.pending,
        row_count=len(df),
        feature_count=len(column_names),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    # ── 6. Persist file to disk ─────────────────────────────────────────────
    dest = _session_dir(session_id) / "dataset.csv"
    dest.write_bytes(raw)
    logger.info(
        "Dataset uploaded: session=%s file=%s rows=%d cols=%d",
        session_id, file.filename, len(df), len(column_names),
    )

    return {
        "session_id": str(session_id),
        "row_count": len(df),
        "column_names": column_names,
        "detected_protected_attributes": protected,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /api/upload/model
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/model")
async def upload_model(
    file: UploadFile = File(...),
    session_id: str = Query(..., description="Session ID from the dataset upload step"),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a .pkl or .joblib scikit-learn model, validate it, persist to disk.
    """
    # ── 1. Session lookup ───────────────────────────────────────────────────
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    session = await db.get(AnalysisSession, sid)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # ── 2. Extension check ──────────────────────────────────────────────────
    fname = file.filename or ""
    if not (fname.lower().endswith(".pkl") or fname.lower().endswith(".joblib")):
        raise HTTPException(
            status_code=422,
            detail="Only .pkl or .joblib model files are accepted. "
                   f"Received: {fname!r}",
        )

    # ── 3. Read & save temporarily so joblib can load from path ─────────────
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=422, detail="Model file too large.")

    dest = _session_dir(sid) / "model.pkl"
    dest.write_bytes(raw)

    # ── 4. Validate with joblib.load ────────────────────────────────────────
    try:
        model = joblib.load(str(dest))
    except Exception as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail=f"Failed to deserialise model file with joblib: {exc}",
        )

    if not hasattr(model, "predict"):
        dest.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="The uploaded object does not have a .predict() method. "
                   "It may not be a scikit-learn estimator.",
        )

    if not hasattr(model, "predict_proba"):
        logger.warning(
            "Model %s lacks .predict_proba — SHAP probability explanations "
            "will fall back to .predict.",
            type(model).__name__,
        )

    # ── 5. Update DB ───────────────────────────────────────────────────────
    session.model_filename = fname
    await db.commit()
    await db.refresh(session)

    n_features = getattr(model, "n_features_in_", None)
    logger.info(
        "Model uploaded: session=%s type=%s n_features=%s",
        session_id, type(model).__name__, n_features,
    )

    return {
        "session_id": session_id,
        "model_type": type(model).__name__,
        "n_features_in_": n_features,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  POST /api/upload/script
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/script")
async def upload_script(
    file: UploadFile = File(...),
    session_id: str = Query(..., description="Session ID from the dataset upload step"),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a .py training script, validate its syntax, persist to disk.
    """
    # ── 1. Session lookup ───────────────────────────────────────────────────
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id format.")

    session = await db.get(AnalysisSession, sid)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found.")

    # ── 2. Extension check ──────────────────────────────────────────────────
    fname = file.filename or ""
    if not fname.lower().endswith(".py"):
        raise HTTPException(
            status_code=422,
            detail=f"Only .py files are accepted. Received: {fname!r}",
        )

    # ── 3. Read content ─────────────────────────────────────────────────────
    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=422, detail="Script file too large.")

    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="Script file is not valid UTF-8.")

    # ── 4. Validate Python syntax ───────────────────────────────────────────
    try:
        tree = ast.parse(source, filename=fname)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Python syntax error in {fname}: {exc.msg} "
                   f"(line {exc.lineno}, col {exc.offset})",
        )

    # ── 5. Extract import names ─────────────────────────────────────────────
    detected_libraries: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                detected_libraries.append(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                detected_libraries.append(node.module.split(".")[0])
    detected_libraries = sorted(set(detected_libraries))

    # ── 6. Persist to disk ──────────────────────────────────────────────────
    dest = _session_dir(sid) / "script.py"
    dest.write_text(source, encoding="utf-8")

    # ── 7. Update DB ───────────────────────────────────────────────────────
    session.script_filename = fname
    await db.commit()
    await db.refresh(session)

    line_count = source.count("\n") + 1
    logger.info(
        "Script uploaded: session=%s file=%s lines=%d libs=%s",
        session_id, fname, line_count, detected_libraries,
    )

    return {
        "session_id": session_id,
        "line_count": line_count,
        "detected_libraries": detected_libraries,
    }
