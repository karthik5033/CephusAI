"use client";

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from "recharts";
import {
  Wrench, ArrowRight, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Download, Shield, ChevronDown, Code2,
  TrendingUp, Activity, Zap, Search, FileCode2,
  ClipboardCheck, Users, Scale, Hash,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────────────

interface Improvement {
  metric_name: string;
  original_value: number;
  mitigated_value: number;
  threshold: number;
  original_passed: boolean;
  mitigated_passed: boolean;
  original_severity: string;
  mitigated_severity: string;
}

interface RemediationResult {
  session_id: string;
  remediation_id: string;
  strategy: string;
  model_type: string;
  original_accuracy: number;
  mitigated_accuracy: number;
  original_dir: number;
  mitigated_dir: number;
  improvements: Improvement[];
  script_diff: string;
  llm_explanation?: {
    stage1_analysis?: {
      bias_patterns?: { location: string; pattern: string; severity: string }[];
      summary?: string;
      model_fit_location?: string;
      recommended_strategy?: string;
    };
    change_log?: { category: string; summary: string; risk_tradeoff: string }[];
    fairness_expectations?: {
      expected_effect?: string;
      unchanged_aspects?: string;
    };
  };
  all_passed: boolean;
  reevaluation_report?: {
    headline?: string;
    technical_summary?: string;
    manager_summary?: string;
    legal_summary?: string;
    key_numbers?: { metric: string; before: number; after: number; comment: string }[];
  };
}

type Phase = "config" | "running" | "done" | "error";

const STRATEGIES = [
  {
    id: "reweighing",
    name: "Reweighing",
    desc: "Compute sample weights inversely proportional to group × label frequency, then retrain.",
    icon: "⚖️",
  },
  {
    id: "threshold_adjustment",
    name: "Threshold Adjustment",
    desc: "Find per-group classification thresholds that equalise selection rates (post-processing).",
    icon: "🎚️",
  },
  {
    id: "fairness_constraint",
    name: "Fairness Constraint",
    desc: "Use Fairlearn ExponentiatedGradient with DemographicParity constraint (in-processing).",
    icon: "🛡️",
  },
];

const METRIC_LABELS: Record<string, string> = {
  disparate_impact_ratio: "Disparate Impact Ratio",
  demographic_parity_difference: "Demographic Parity Diff",
  equalized_odds_difference: "Equalized Odds Diff",
};

const SEV_COLORS: Record<string, string> = {
  critical: "#ef4444",
  warning: "#f59e0b",
  pass: "#10b981",
};

// ═════════════════════════════════════════════════════════════════════════════
//  Page
// ═════════════════════════════════════════════════════════════════════════════

export default function RemediationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [phase, setPhase] = useState<Phase>("config");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RemediationResult | null>(null);

  const [targetCol, setTargetCol] = useState("");
  const [sensitiveAttrs, setSensitiveAttrs] = useState("");
  const [strategy, setStrategy] = useState("reweighing");
  const [showDiff, setShowDiff] = useState(false);

  // ── Run remediation ──
  const runRemediation = useCallback(async () => {
    if (!targetCol.trim() || !sensitiveAttrs.trim()) {
      setError("Target column and sensitive attributes are required.");
      return;
    }
    setPhase("running");
    setError(null);

    try {
      const res = await fetch(`${API}/api/remediation/run/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_column: targetCol.trim(),
          sensitive_attributes: sensitiveAttrs.split(",").map((s) => s.trim()).filter(Boolean),
          strategy,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail));
      }
      const data: RemediationResult = await res.json();
      setResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Remediation failed");
      setPhase("error");
    }
  }, [sessionId, targetCol, sensitiveAttrs, strategy]);

  // ═════════════════════════════════════════════════════════════════════════
  //  Config Phase
  // ═════════════════════════════════════════════════════════════════════════

  if (phase === "config" || phase === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-emerald-500/[0.03] via-transparent to-transparent rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 mb-4">
              <Wrench className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-emerald-400">Remediation</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Mitigate Bias</h1>
            <p className="text-sm text-gray-500">Choose a strategy and retrain your model with fairness constraints.</p>
          </div>

          <div className="space-y-5 rounded-2xl border border-gray-700/40 bg-gray-900/50 p-6">
            {/* Target column */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Target Column <span className="text-red-400">*</span></label>
              <input id="rem-target-col" type="text" value={targetCol} onChange={(e) => setTargetCol(e.target.value)}
                placeholder="e.g. two_year_recid"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/60 text-sm" />
            </div>

            {/* Sensitive attrs */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Protected Attributes <span className="text-red-400">*</span></label>
              <input id="rem-sensitive-attrs" type="text" value={sensitiveAttrs} onChange={(e) => setSensitiveAttrs(e.target.value)}
                placeholder="e.g. race, sex"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-emerald-500/60 text-sm" />
            </div>

            {/* Strategy picker */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Mitigation Strategy</label>
              <div className="space-y-2">
                {STRATEGIES.map((s) => (
                  <button key={s.id} onClick={() => setStrategy(s.id)}
                    className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      strategy === s.id
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-gray-700/40 bg-gray-800/30 hover:border-gray-600/50"
                    }`}>
                    <span className="text-xl mt-0.5">{s.icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${strategy === s.id ? "text-emerald-300" : "text-gray-200"}`}>{s.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <button id="run-remediation-btn" onClick={runRemediation}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.01] transition-all">
              <Wrench className="w-4 h-4" /> Run Remediation
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Running
  // ═════════════════════════════════════════════════════════════════════════

  if (phase === "running") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mx-auto" />
          <h2 className="text-xl font-semibold text-white">Applying {STRATEGIES.find((s) => s.id === strategy)?.name}…</h2>
          <p className="text-sm text-gray-500 max-w-sm">Retraining the model with fairness constraints and computing new metrics.</p>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  Results
  // ═════════════════════════════════════════════════════════════════════════

  if (!result) return null;

  // Chart data for before/after comparison
  const comparisonData = result.improvements.map((imp) => ({
    name: (METRIC_LABELS[imp.metric_name] || imp.metric_name).replace(/ /g, "\n"),
    Original: imp.original_value,
    Mitigated: imp.mitigated_value,
    threshold: imp.threshold,
  }));

  const accDelta = result.mitigated_accuracy - result.original_accuracy;
  const dirDelta = result.mitigated_dir - result.original_dir;

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-emerald-500/[0.02] via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 mb-3">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-emerald-400">Remediation Complete</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Remediation Report</h1>
            <p className="text-sm text-gray-500">
              Strategy: <span className="text-emerald-400 font-medium">{STRATEGIES.find((s) => s.id === result.strategy)?.name}</span>
              {" · "}{result.model_type}
            </p>
          </div>
          <div className={`px-5 py-3 rounded-xl border ${result.all_passed ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Status</p>
            <p className={`text-lg font-black ${result.all_passed ? "text-emerald-400" : "text-amber-400"}`}>
              {result.all_passed ? "ALL PASSED" : "PARTIAL"}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-xl bg-gray-900/60 border border-gray-700/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Original Acc</span>
            </div>
            <p className="text-lg font-bold text-white">{(result.original_accuracy * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-gray-900/60 border border-gray-700/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Mitigated Acc</span>
            </div>
            <p className="text-lg font-bold text-white">
              {(result.mitigated_accuracy * 100).toFixed(1)}%
              <span className={`text-xs ml-1 ${accDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ({accDelta >= 0 ? "+" : ""}{(accDelta * 100).toFixed(1)}%)
              </span>
            </p>
          </div>
          <div className="rounded-xl bg-gray-900/60 border border-gray-700/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Original DIR</span>
            </div>
            <p className="text-lg font-bold text-white">{result.original_dir.toFixed(4)}</p>
          </div>
          <div className="rounded-xl bg-gray-900/60 border border-gray-700/30 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Mitigated DIR</span>
            </div>
            <p className="text-lg font-bold text-white">
              {result.mitigated_dir.toFixed(4)}
              <span className={`text-xs ml-1 ${dirDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                ({dirDelta >= 0 ? "+" : ""}{dirDelta.toFixed(4)})
              </span>
            </p>
          </div>
        </div>

        {/* Before / After chart */}
        <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 p-5 mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">Before vs After — Fairness Metrics</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Original" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Mitigated" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-metric improvement table */}
        <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 p-5 mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">Metric Improvements</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-700/40">
                  <th className="text-left py-2 pr-4">Metric</th>
                  <th className="text-right py-2 px-3">Original</th>
                  <th className="text-right py-2 px-3">Mitigated</th>
                  <th className="text-right py-2 px-3">Threshold</th>
                  <th className="text-center py-2 pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.improvements.map((imp) => (
                  <tr key={imp.metric_name} className="border-b border-gray-800/40">
                    <td className="py-2 pr-4 text-gray-300 font-medium">{METRIC_LABELS[imp.metric_name] || imp.metric_name}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: SEV_COLORS[imp.original_severity] || "#94a3b8" }}>
                      {imp.original_value.toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: SEV_COLORS[imp.mitigated_severity] || "#94a3b8" }}>
                      {imp.mitigated_value.toFixed(4)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-500">{imp.threshold}</td>
                    <td className="py-2 pl-3 text-center">
                      {imp.mitigated_passed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 inline" />
                        : <AlertTriangle className="w-4 h-4 text-amber-400 inline" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Remediation Loop v2.0 Logic */}
        {result.llm_explanation && (
          <div className="mb-10 space-y-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" /> Active Remediation Loop v2.0
            </h2>

            {/* Stage 1: Bias Patterns Found */}
            {result.llm_explanation.stage1_analysis && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="w-4 h-4 text-blue-400" />
                  <p className="text-xs uppercase tracking-widest text-blue-400 font-bold">Stage 1: Script Analysis</p>
                </div>
                {result.llm_explanation.stage1_analysis.summary && (
                  <p className="text-sm text-gray-300 leading-relaxed mb-4 italic border-l-2 border-blue-500/30 pl-3">
                    {result.llm_explanation.stage1_analysis.summary}
                  </p>
                )}
                {result.llm_explanation.stage1_analysis.bias_patterns && result.llm_explanation.stage1_analysis.bias_patterns.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">Bias Patterns Detected</p>
                    {result.llm_explanation.stage1_analysis.bias_patterns.map((bp, i) => (
                      <div key={i} className={`flex items-start gap-3 text-xs px-3 py-2 rounded-lg ${
                        bp.severity === "critical" ? "bg-red-500/10 border border-red-500/20" :
                        bp.severity === "warning" ? "bg-amber-500/10 border border-amber-500/20" :
                        "bg-gray-800/50 border border-gray-700/30"
                      }`}>
                        <span className="font-mono text-gray-500 shrink-0">{bp.location}</span>
                        <span className="text-gray-300">{bp.pattern}</span>
                        <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          bp.severity === "critical" ? "bg-red-500/20 text-red-400" :
                          bp.severity === "warning" ? "bg-amber-500/20 text-amber-400" :
                          "bg-gray-700/40 text-gray-400"
                        }`}>{bp.severity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Stage 2: Change Log */}
            {result.llm_explanation.change_log && result.llm_explanation.change_log.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold">Stage 2: Code Modifications</p>
                </div>
                <div className="space-y-3">
                  {result.llm_explanation.change_log.map((cl, i) => (
                    <div key={i} className="rounded-lg bg-gray-900/60 border border-gray-700/30 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">{cl.category.replace(/_/g, " ")}</span>
                      </div>
                      <p className="text-xs text-gray-300 mb-1">{cl.summary}</p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Risk trade-off: {cl.risk_tradeoff}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fairness Expectations */}
            {result.llm_explanation.fairness_expectations && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.llm_explanation.fairness_expectations.expected_effect && (
                  <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5">
                    <p className="text-[10px] uppercase tracking-widest text-purple-400 font-bold mb-2">Expected Fairness Impact</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{result.llm_explanation.fairness_expectations.expected_effect}</p>
                  </div>
                )}
                {result.llm_explanation.fairness_expectations.unchanged_aspects && (
                  <div className="p-4 rounded-xl border border-gray-600/20 bg-gray-800/30">
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Unchanged Aspects</p>
                    <p className="text-xs text-gray-300 leading-relaxed">{result.llm_explanation.fairness_expectations.unchanged_aspects}</p>
                  </div>
                )}
              </div>
            )}

            {/* Pipeline Stage Table */}
            <div className="rounded-xl border border-gray-700/30 bg-gray-900/40 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-800/50 text-gray-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Stage</th>
                    <th className="px-4 py-2 font-semibold">Action</th>
                    <th className="px-4 py-2 font-semibold">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {[
                    { stage: "1. Script Analysis", action: "LLM identifies bias-inducing patterns", method: "Claude API", color: "text-blue-400" },
                    { stage: "2. Code Modification", action: "LLM rewrites script with mitigation", method: "Unified Diff", color: "text-emerald-400" },
                    { stage: "3. Execution", action: "Modified script validated", method: "Subprocess", color: "text-amber-400" },
                    { stage: "4. Retrain", action: "Model retrained on mitigated pipeline", method: "scikit-learn", color: "text-gray-400" },
                    { stage: "5. Re-Evaluation", action: "Fairlearn + SHAP on new model", method: "MetricFrame", color: "text-gray-400" },
                  ].map((row) => (
                    <tr key={row.stage}>
                      <td className="px-4 py-2 text-gray-300">{row.stage}</td>
                      <td className="px-4 py-2 text-gray-400">{row.action}</td>
                      <td className={`px-4 py-2 font-mono ${row.color}`}>{row.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Script diff */}
        {result.script_diff && (
          <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 mb-8 overflow-hidden">
            <button onClick={() => setShowDiff(!showDiff)}
              className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-800/30 transition-colors">
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <Code2 className="w-4 h-4 text-blue-400" /> Remediated Training Script (Unified Diff)
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showDiff ? "rotate-180" : ""}`} />
            </button>
            {showDiff && (
              <div className="px-5 pb-5 border-t border-gray-700/30">
                <div className="mt-4 mb-2 flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                  <Activity className="w-3 h-3" /> Differential Audit Log
                </div>
                <pre className="text-[11px] font-mono leading-relaxed overflow-x-auto p-4 rounded-lg bg-black/40 border border-white/5 max-h-[500px] overflow-y-auto">
                  {result.script_diff.split("\n").map((line, i) => {
                    let color = "text-gray-500";
                    let bg = "";
                    if (line.startsWith("+") && !line.startsWith("+++")) {
                      color = "text-emerald-400";
                      bg = "bg-emerald-500/5";
                    }
                    else if (line.startsWith("-") && !line.startsWith("---")) {
                      color = "text-red-400";
                      bg = "bg-red-500/5";
                    }
                    else if (line.startsWith("@@")) {
                      color = "text-blue-400";
                      bg = "bg-blue-500/5";
                    }
                    return <div key={i} className={`${color} ${bg} px-2`}>{line}</div>;
                  })}
                </pre>
              </div>
            )}
          </div>
        )}
        {/* Stage 5: Re-Evaluation Report */}
        {result.reevaluation_report && (
          <div className="mb-10 space-y-5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-cyan-400" /> Stage 5: Re-Evaluation Report
            </h2>

            {/* Headline */}
            {result.reevaluation_report.headline && (
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 p-5">
                <p className="text-sm text-white font-semibold leading-relaxed">
                  {result.reevaluation_report.headline}
                </p>
              </div>
            )}

            {/* Multi-audience summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {result.reevaluation_report.technical_summary && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Code2 className="w-4 h-4 text-blue-400" />
                    <p className="text-[10px] uppercase tracking-widest text-blue-400 font-bold">Technical</p>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{result.reevaluation_report.technical_summary}</p>
                </div>
              )}
              {result.reevaluation_report.manager_summary && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Business</p>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{result.reevaluation_report.manager_summary}</p>
                </div>
              )}
              {result.reevaluation_report.legal_summary && (
                <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Scale className="w-4 h-4 text-rose-400" />
                    <p className="text-[10px] uppercase tracking-widest text-rose-400 font-bold">Legal / Compliance</p>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{result.reevaluation_report.legal_summary}</p>
                </div>
              )}
            </div>

            {/* Key Numbers Table */}
            {result.reevaluation_report.key_numbers && result.reevaluation_report.key_numbers.length > 0 && (
              <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-700/30">
                  <Hash className="w-4 h-4 text-cyan-400" />
                  <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Key Metric Deltas</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-700/40">
                        <th className="text-left py-2 px-4">Metric</th>
                        <th className="text-right py-2 px-4">Before</th>
                        <th className="text-right py-2 px-4">After</th>
                        <th className="text-right py-2 px-4">Delta</th>
                        <th className="text-left py-2 px-4">Assessment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.reevaluation_report.key_numbers.map((kn, i) => {
                        const delta = (typeof kn.after === "number" && typeof kn.before === "number")
                          ? kn.after - kn.before : null;
                        return (
                          <tr key={i} className="border-b border-gray-800/40">
                            <td className="py-2 px-4 text-gray-300 font-medium">{kn.metric}</td>
                            <td className="py-2 px-4 text-right font-mono text-gray-400">
                              {typeof kn.before === "number" ? kn.before.toFixed(4) : kn.before}
                            </td>
                            <td className="py-2 px-4 text-right font-mono text-white">
                              {typeof kn.after === "number" ? kn.after.toFixed(4) : kn.after}
                            </td>
                            <td className={`py-2 px-4 text-right font-mono font-bold ${
                              delta === null ? "text-gray-500" : delta >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}>
                              {delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(4)}` : "—"}
                            </td>
                            <td className="py-2 px-4 text-gray-400 max-w-[200px]">{kn.comment}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <button onClick={() => window.open(`${API}/api/remediation/${sessionId}/download`, "_blank")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-600/40 text-gray-300 hover:bg-gray-800/50 transition-all">
              <Download className="w-4 h-4" /> Download Mitigated Model
            </button>
            <button onClick={() => window.open(`${API}/api/reports/${sessionId}/pdf`, "_blank")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-red-500/20 text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-all">
              <Download className="w-4 h-4" /> Export PDF Audit
            </button>
          </div>

          <button id="proceed-to-explain" onClick={() => router.push(`/explain/${sessionId}`)}
            className="group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all">
            Proceed to Decision Explainability
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
