"""
AI Courtroom v2.0 — SQLAlchemy ORM Models.

Defines four core tables:
  - AnalysisSession: tracks each uploaded dataset + model analysis run
  - BiasResult: per-metric bias findings for a session
  - CourtRoomVerdict: the LLM-driven prosecution/defense/judge outcome
  - RemediationRun: records before/after metrics when bias is mitigated
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, relationship


# ---------------------------------------------------------------------------
# Alembic-compatible declarative base
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# ---------------------------------------------------------------------------
# Python enums mapped to DB enum columns
# ---------------------------------------------------------------------------

class SessionStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    complete = "complete"
    failed = "failed"


class BiasSeverity(str, enum.Enum):
    critical = "critical"
    warning = "warning"
    pass_  = "pass"          # trailing underscore avoids Python keyword clash


class JudgeVerdict(str, enum.Enum):
    guilty = "guilty"
    not_guilty = "not_guilty"


class RemediationStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    complete = "complete"
    failed = "failed"


# ---------------------------------------------------------------------------
# Helper: portable UUID column
# ---------------------------------------------------------------------------

def _uuid_pk() -> Column:
    """UUID primary key that works on both PostgreSQL and SQLite."""
    return Column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )


def _uuid_fk(target: str) -> Column:
    """UUID foreign key with CASCADE delete."""
    return Column(
        PG_UUID(as_uuid=True),
        ForeignKey(target, ondelete="CASCADE"),
        nullable=False,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ═══════════════════════════════════════════════════════════════════════════════
#  AnalysisSession
# ═══════════════════════════════════════════════════════════════════════════════

class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id               = _uuid_pk()
    created_at       = Column(DateTime(timezone=True), default=_now, nullable=False)
    dataset_filename = Column(String(255), nullable=False)
    model_filename   = Column(String(255), nullable=True, default=None)
    script_filename  = Column(String(255), nullable=True, default=None)
    status           = Column(
        Enum(SessionStatus, name="session_status", create_constraint=True),
        nullable=False,
        default=SessionStatus.pending,
    )
    row_count        = Column(Integer, nullable=True)
    feature_count    = Column(Integer, nullable=True)

    # relationships
    bias_results      = relationship("BiasResult",       back_populates="session", cascade="all, delete-orphan")
    verdicts          = relationship("CourtRoomVerdict",  back_populates="session", cascade="all, delete-orphan")
    remediation_runs  = relationship("RemediationRun",   back_populates="session", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<AnalysisSession(id={self.id!s}, "
            f"dataset={self.dataset_filename!r}, "
            f"status={self.status!r}, "
            f"rows={self.row_count})>"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  BiasResult
# ═══════════════════════════════════════════════════════════════════════════════

class BiasResult(Base):
    __tablename__ = "bias_results"

    id                  = _uuid_pk()
    session_id          = _uuid_fk("analysis_sessions.id")
    protected_attribute = Column(String(100), nullable=False)
    metric_name         = Column(String(100), nullable=False)
    metric_value        = Column(Float, nullable=False)
    threshold           = Column(Float, nullable=False)
    passed              = Column(Boolean, nullable=False)
    severity            = Column(
        Enum(BiasSeverity, name="bias_severity", create_constraint=True),
        nullable=False,
    )
    group_breakdown     = Column(JSONB, nullable=True)
    created_at          = Column(DateTime(timezone=True), default=_now, nullable=False)

    # relationship
    session = relationship("AnalysisSession", back_populates="bias_results")

    def __repr__(self) -> str:
        return (
            f"<BiasResult(id={self.id!s}, "
            f"metric={self.metric_name!r}, "
            f"value={self.metric_value}, "
            f"severity={self.severity!r})>"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  CourtRoomVerdict
# ═══════════════════════════════════════════════════════════════════════════════

class CourtRoomVerdict(Base):
    __tablename__ = "courtroom_verdicts"

    id                    = _uuid_pk()
    session_id            = _uuid_fk("analysis_sessions.id")
    prosecution_argument  = Column(Text, nullable=False)
    defense_argument      = Column(Text, nullable=False)
    judge_verdict         = Column(
        Enum(JudgeVerdict, name="judge_verdict", create_constraint=True),
        nullable=False,
    )
    bias_risk_score       = Column(
        Integer,
        CheckConstraint("bias_risk_score >= 0 AND bias_risk_score <= 100", name="ck_risk_score_range"),
        nullable=False,
    )
    judge_reasoning       = Column(Text, nullable=False)
    recommended_sentence  = Column(Text, nullable=False)
    created_at            = Column(DateTime(timezone=True), default=_now, nullable=False)

    # relationship
    session = relationship("AnalysisSession", back_populates="verdicts")

    def __repr__(self) -> str:
        return (
            f"<CourtRoomVerdict(id={self.id!s}, "
            f"verdict={self.judge_verdict!r}, "
            f"risk={self.bias_risk_score})>"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  RemediationRun
# ═══════════════════════════════════════════════════════════════════════════════

class RemediationRun(Base):
    __tablename__ = "remediation_runs"

    id                  = _uuid_pk()
    session_id          = _uuid_fk("analysis_sessions.id")
    original_dir        = Column(Float, nullable=True)
    mitigated_dir       = Column(Float, nullable=True)
    original_accuracy   = Column(Float, nullable=True)
    mitigated_accuracy  = Column(Float, nullable=True)
    strategy_used       = Column(String(100), nullable=True)
    script_diff         = Column(Text, nullable=True)
    status              = Column(
        Enum(RemediationStatus, name="remediation_status", create_constraint=True),
        nullable=False,
        default=RemediationStatus.pending,
    )
    created_at          = Column(DateTime(timezone=True), default=_now, nullable=False)

    # relationship
    session = relationship("AnalysisSession", back_populates="remediation_runs")

    def __repr__(self) -> str:
        return (
            f"<RemediationRun(id={self.id!s}, "
            f"strategy={self.strategy_used!r}, "
            f"status={self.status!r})>"
        )
