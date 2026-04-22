"use client";

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield, Loader2, CheckCircle2, AlertTriangle, XCircle,
  ArrowRight, ChevronDown, Database, Eye, Lock, Trash2,
  FileSpreadsheet, Users, Scale, Zap, Info,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────

interface ColumnMeta {
  name: string;
  inferred_type: string;
  n_unique: number;
  sample_values: string[];
  is_sensitive: boolean;
  is_identifier: boolean;
  static_category: string;
  feature_relevance_score?: number;
}

interface LLMColumn {
  name: string;
  decision: string;
  reason: string;
  risk_level: string;
}

interface LLMReview {
  headline: string;
  columns: LLMColumn[];
  overall_recommendations: string[];
}

interface ReviewResult {
  session_id: string;
  review_id: string;
  intended_use: string;
  purpose_description: string;
  column_metadata: ColumnMeta[];
  candidate_targets: { name: string; n_classes: number; values: string[] }[];
  llm_review: LLMReview;
}

type Phase = "config" | "running" | "done" | "error";

const PURPOSES = [
  { id: "loan_credit", label: "Loan Approval / Credit Risk", icon: "💳" },
  { id: "hiring_screening", label: "Hiring / Screening", icon: "👔" },
  { id: "insurance_pricing", label: "Insurance Pricing", icon: "🛡️" },
  { id: "custom", label: "Custom Purpose", icon: "⚙️" },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  required_for_purpose: { label: "Required", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
  possibly_required: { label: "Possibly Required", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  sensitive_but_justifiable: { label: "Sensitive (Justifiable)", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  high_risk_unnecessary: { label: "High Risk / Unnecessary", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  identifier_only: { label: "Identifier Only", color: "text-gray-400", bg: "bg-gray-500/10", border: "border-gray-500/20" },
};

const DECISION_BADGES: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  keep_as_feature: { label: "Keep", color: "text-emerald-400", Icon: CheckCircle2 },
  keep_as_identifier_only: { label: "ID Only", color: "text-blue-400", Icon: Eye },
  remove_or_mask: { label: "Remove", color: "text-red-400", Icon: Trash2 },
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-500/20 text-emerald-400",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-red-500/20 text-red-400",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function DatasetReviewPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [phase, setPhase] = useState<Phase>("config");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const [purpose, setPurpose] = useState("loan_credit");
  const [purposeDesc, setPurposeDesc] = useState("");
  const [targetCol, setTargetCol] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  // User overrides: column_name -> decision
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const runReview = useCallback(async () => {
    if (!purposeDesc.trim()) {
      setError("Please describe the intended use of this dataset.");
      return;
    }
    setPhase("running");
    setError(null);

    try {
      const res = await fetch(`${API}/api/dataset-review/run/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intended_use: purpose,
          purpose_description: purposeDesc.trim(),
          target_column: targetCol.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail));
      }
      const data: ReviewResult = await res.json();
      setResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Review failed");
      setPhase("error");
    }
  }, [sessionId, purpose, purposeDesc, targetCol]);

  const saveOverrides = useCallback(async () => {
    const entries = Object.entries(overrides).map(([column_name, decision]) => ({
      column_name,
      decision,
      justification: "User override",
    }));
    if (entries.length === 0) return;

    try {
      await fetch(`${API}/api/dataset-review/${sessionId}/overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: entries }),
      });
    } catch {
      // silent
    }
  }, [sessionId, overrides]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  Config Phase
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === "config" || phase === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-violet-500/[0.03] via-transparent to-transparent rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/15 mb-4">
              <Database className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-400">
                Phase 0 · Data Minimisation
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Dataset Review</h1>
            <p className="text-sm text-gray-500">
              Check whether your dataset collects only what is necessary for your stated purpose.
            </p>
          </div>

          <div className="space-y-5 rounded-2xl border border-gray-700/40 bg-gray-900/50 p-6">
            {/* Purpose selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Intended Use <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PURPOSES.map((p) => (
                  <button key={p.id} onClick={() => setPurpose(p.id)}
                    className={`text-left flex items-center gap-2.5 p-3 rounded-xl border transition-all ${
                      purpose === p.id
                        ? "border-violet-500/40 bg-violet-500/10"
                        : "border-gray-700/40 bg-gray-800/30 hover:border-gray-600/50"
                    }`}>
                    <span className="text-lg">{p.icon}</span>
                    <span className={`text-xs font-semibold ${purpose === p.id ? "text-violet-300" : "text-gray-300"}`}>
                      {p.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Purpose description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Purpose Description <span className="text-red-400">*</span>
              </label>
              <textarea
                id="purpose-desc"
                value={purposeDesc}
                onChange={(e) => setPurposeDesc(e.target.value)}
                placeholder="Describe the decision you will make with this model, e.g. 'Determine whether to approve a personal loan application based on applicant financial history.'"
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500/60 text-sm resize-none"
              />
            </div>

            {/* Optional target column */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Target Column <span className="text-gray-500 text-xs font-normal">(optional)</span>
              </label>
              <input
                id="review-target-col"
                type="text"
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                placeholder="e.g. default, hired, approved"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500/60 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                If provided, we'll compute feature relevance scores against this target.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <button id="run-dataset-review-btn" onClick={runReview}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-violet-600 text-white font-semibold text-sm shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:scale-[1.01] transition-all">
              <Database className="w-4 h-4" /> Run Data Minimisation Check
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Running Phase
  // ═══════════════════════════════════════════════════════════════════════════

  if (phase === "running") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-violet-400 animate-spin mx-auto" />
          <h2 className="text-xl font-semibold text-white">Analysing Dataset…</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Inferring column types, checking sensitivity patterns, applying
            purpose-based rules, and generating an LLM review.
          </p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Results
  // ═══════════════════════════════════════════════════════════════════════════

  if (!result) return null;

  const review = result.llm_review;
  const highRiskCount = result.column_metadata.filter(c => c.static_category === "high_risk_unnecessary").length;
  const sensitiveCount = result.column_metadata.filter(c => c.is_sensitive).length;
  const totalCols = result.column_metadata.length;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-violet-500/[0.02] via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/15 mb-3">
              <Shield className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-violet-400">Phase 0 · Dataset Review</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Data Minimisation Report</h1>
            <p className="text-sm text-gray-500">
              Purpose: <span className="text-violet-400 font-medium">{PURPOSES.find(p => p.id === result.intended_use)?.label}</span>
              {" · "}{totalCols} columns analysed
            </p>
          </div>
          <div className="text-right px-5 py-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 border border-gray-700/30">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Risk Summary</p>
            <p className="text-lg font-black">
              <span className="text-red-400">{highRiskCount}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-amber-400">{sensitiveCount}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="text-gray-400">{totalCols}</span>
            </p>
            <p className="text-[10px] text-gray-500">high-risk / sensitive / total</p>
          </div>
        </div>

        {/* Headline */}
        {review.headline && (
          <div className="rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-blue-500/5 p-5 mb-8">
            <p className="text-sm text-white font-semibold leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
              {review.headline}
            </p>
          </div>
        )}

        {/* Column Review Table */}
        <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 overflow-hidden mb-8">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/30">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-violet-400" /> Column-by-Column Review
            </h3>
            <button onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-300 transition-colors">
              {showDetails ? "Hide" : "Show"} details
              <ChevronDown className={`w-3 h-3 transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700/40">
                  <th className="text-left py-2.5 px-4">Column</th>
                  <th className="text-left py-2.5 px-3">Type</th>
                  <th className="text-left py-2.5 px-3">Category</th>
                  <th className="text-center py-2.5 px-3">Decision</th>
                  <th className="text-center py-2.5 px-3">Risk</th>
                  {showDetails && <th className="text-left py-2.5 px-3">Reason</th>}
                  <th className="text-center py-2.5 px-3">Override</th>
                </tr>
              </thead>
              <tbody>
                {review.columns.map((col) => {
                  const meta = result.column_metadata.find(m => m.name === col.name);
                  const cat = meta ? CATEGORY_LABELS[meta.static_category] : null;
                  const dec = DECISION_BADGES[col.decision] || DECISION_BADGES["keep_as_feature"];
                  const DecIcon = dec.Icon;
                  const risk = RISK_COLORS[col.risk_level] || RISK_COLORS["low"];
                  const currentDecision = overrides[col.name] || col.decision;

                  return (
                    <tr key={col.name} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                      <td className="py-2 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-200 font-medium">{col.name}</span>
                          {meta?.is_sensitive && <Lock className="w-3 h-3 text-amber-400" />}
                          {meta?.is_identifier && <Users className="w-3 h-3 text-gray-500" />}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-400 font-mono">{meta?.inferred_type || "?"}</td>
                      <td className="py-2 px-3">
                        {cat && (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${cat.bg} ${cat.color} border ${cat.border}`}>
                            {cat.label}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-flex items-center gap-1 ${dec.color}`}>
                          <DecIcon className="w-3 h-3" /> {dec.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${risk}`}>
                          {col.risk_level}
                        </span>
                      </td>
                      {showDetails && (
                        <td className="py-2 px-3 text-gray-400 max-w-[250px]">{col.reason}</td>
                      )}
                      <td className="py-2 px-3 text-center">
                        <select
                          value={currentDecision}
                          onChange={(e) => setOverrides({ ...overrides, [col.name]: e.target.value })}
                          className="text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-gray-300 focus:outline-none focus:border-violet-500/60"
                        >
                          <option value="keep_as_feature">Keep</option>
                          <option value="keep_as_identifier_only">ID Only</option>
                          <option value="remove_or_mask">Remove</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommendations */}
        {review.overall_recommendations && review.overall_recommendations.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mb-8">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <Scale className="w-4 h-4" /> Recommendations
            </h3>
            <ul className="space-y-1.5">
              {review.overall_recommendations.map((rec, i) => (
                <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                  <Zap className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button onClick={saveOverrides}
            disabled={Object.keys(overrides).length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              Object.keys(overrides).length > 0
                ? "border border-violet-500/30 text-violet-400 bg-violet-500/5 hover:bg-violet-500/10"
                : "border border-gray-700/30 text-gray-500 cursor-not-allowed"
            }`}>
            <CheckCircle2 className="w-4 h-4" /> Save Overrides ({Object.keys(overrides).length})
          </button>

          <button id="proceed-to-analysis-from-review" onClick={() => router.push(`/analysis/${sessionId}`)}
            className="group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-gray-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] transition-all">
            Proceed to Bias Analysis
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
