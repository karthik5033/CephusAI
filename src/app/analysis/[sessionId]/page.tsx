"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, RadialBarChart, RadialBar,
  Legend,
} from "recharts";
import {
  Shield, AlertTriangle, CheckCircle2, XCircle, Loader2,
  ArrowRight, ChevronDown, ChevronUp, Activity, Eye,
  BarChart3, Users, Zap, FileWarning,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────────────

interface BiasMetric {
  protected_attribute: string;
  metric_name: string;
  metric_value: number;
  threshold: number;
  passed: boolean;
  severity: "critical" | "warning" | "pass";
  group_breakdown: {
    selection_rates: Record<string, number>;
    accuracy_by_group: Record<string, number>;
    fpr_by_group: Record<string, number>;
    fnr_by_group: Record<string, number>;
  };
}

interface ShapValue {
  feature: string;
  importance: number;
  raw_shap: number;
  is_proxy: boolean;
}

interface ProxyFeature {
  feature: string;
  correlation: number;
  corr_with: string;
}

interface AnalysisResult {
  session_id: string;
  status: string;
  accuracy: number;
  model_type: string;
  row_count: number;
  feature_count: number;
  target_column: string;
  sensitive_attributes: string[];
  primary_protected_attribute: string;
  verdict: string;
  bias_score: number;
  bias_metrics: BiasMetric[];
  shap_values: ShapValue[];
  proxy_features: ProxyFeature[];
  demographic_breakdown: Record<string, number>;
}

type Phase = "config" | "running" | "done" | "error";

// ── Metric display names ────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, { label: string; desc: string }> = {
  disparate_impact_ratio: {
    label: "Disparate Impact Ratio",
    desc: "Ratio of selection rates between least and most favored groups. ≥ 0.80 is fair.",
  },
  demographic_parity_difference: {
    label: "Demographic Parity Diff",
    desc: "Max difference in selection rates across groups. ≤ 0.10 is fair.",
  },
  equalized_odds_difference: {
    label: "Equalized Odds Diff",
    desc: "Max difference in TPR/FPR across groups. ≤ 0.10 is fair.",
  },
};

// ── Severity colors ─────────────────────────────────────────────────────────

const SEV = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", icon: XCircle },
  warning:  { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", icon: AlertTriangle },
  pass:     { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", icon: CheckCircle2 },
};

const PIE_COLORS = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

// ═════════════════════════════════════════════════════════════════════════════
//  Page Component
// ═════════════════════════════════════════════════════════════════════════════

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [phase, setPhase] = useState<Phase>("config");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Config form
  const [targetCol, setTargetCol] = useState("");
  const [sensitiveAttrs, setSensitiveAttrs] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [detectedProtected, setDetectedProtected] = useState<string[]>([]);

  // Expandable metric cards
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Load column info from dataset on mount ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/analysis/${sessionId}`);
        const data = await res.json();
        if (data.status === "complete" && data.bias_metrics?.length > 0) {
          // Already analysed — try to rebuild from GET
          setPhase("done");
          // We need the full run result, so re-fetch won't have shap/proxies.
          // Keep in config so user can re-run or view partial.
        }
      } catch {
        // Session may not have analysis yet — that's fine
      }
    })();
  }, [sessionId]);

  // ── Run analysis ──
  const runAnalysis = useCallback(async () => {
    if (!targetCol.trim() || !sensitiveAttrs.trim()) {
      setError("Both target column and sensitive attributes are required.");
      return;
    }

    setPhase("running");
    setError(null);

    try {
      const res = await fetch(`${API}/api/analysis/run/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_column: targetCol.trim(),
          sensitive_attributes: sensitiveAttrs.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail));
      }

      const data: AnalysisResult = await res.json();
      setResult(data);
      setPhase("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
      setPhase("error");
    }
  }, [sessionId, targetCol, sensitiveAttrs]);

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER: Config Phase
  // ═════════════════════════════════════════════════════════════════════════

  if (phase === "config" || phase === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-blue-500/[0.03] via-transparent to-transparent rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-xl mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/15 mb-4">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-blue-400">
                Bias Analysis
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Configure Analysis</h1>
            <p className="text-sm text-gray-500">
              Session: <span className="font-mono text-gray-400">{sessionId}</span>
            </p>
          </div>

          <div className="space-y-5 rounded-2xl border border-gray-700/40 bg-gray-900/50 p-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Target Column <span className="text-red-400">*</span>
              </label>
              <input
                id="target-column-input"
                type="text"
                value={targetCol}
                onChange={(e) => setTargetCol(e.target.value)}
                placeholder="e.g. two_year_recid, loan_approved, hired"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Protected Attributes <span className="text-red-400">*</span>
              </label>
              <input
                id="sensitive-attrs-input"
                type="text"
                value={sensitiveAttrs}
                onChange={(e) => setSensitiveAttrs(e.target.value)}
                placeholder="e.g. race, sex, age (comma-separated)"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/60 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">Comma-separated list of column names</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <button
              id="run-analysis-btn"
              onClick={runAnalysis}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.01] transition-all"
            >
              <Zap className="w-4 h-4" />
              Run Bias Analysis
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER: Running Phase
  // ═════════════════════════════════════════════════════════════════════════

  if (phase === "running") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-400 animate-spin mx-auto" />
          <h2 className="text-xl font-semibold text-white">Running Analysis…</h2>
          <p className="text-sm text-gray-500 max-w-sm">
            Computing Fairlearn metrics, SHAP feature importance, and proxy
            detection on your dataset. This may take 30–90 seconds.
          </p>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RENDER: Results
  // ═════════════════════════════════════════════════════════════════════════

  if (!result) return null;

  const verdictColor =
    result.verdict === "GUILTY" ? "text-red-400" :
    result.verdict === "WARNING" ? "text-amber-400" : "text-emerald-400";
  const verdictBg =
    result.verdict === "GUILTY" ? "from-red-500/10 to-red-500/5" :
    result.verdict === "WARNING" ? "from-amber-500/10 to-amber-500/5" : "from-emerald-500/10 to-emerald-500/5";

  // SHAP chart data
  const shapData = result.shap_values.map((s) => ({
    name: s.feature.length > 18 ? s.feature.slice(0, 16) + "…" : s.feature,
    importance: s.importance,
    isProxy: s.is_proxy,
  }));

  // Demographics pie data
  const demoData = Object.entries(result.demographic_breakdown).map(
    ([name, value], i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] })
  );

  // Bias score radial
  const scoreData = [{ name: "Risk", value: result.bias_score, fill: result.bias_score > 60 ? "#ef4444" : result.bias_score > 30 ? "#f59e0b" : "#10b981" }];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-500/[0.02] via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-10">
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/15 mb-3">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] uppercase tracking-widest font-semibold text-blue-400">Analysis Complete</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Bias Audit Report</h1>
            <p className="text-sm text-gray-500">
              {result.model_type} · {result.row_count.toLocaleString()} rows · {result.feature_count} features
            </p>
          </div>
          <div className={`text-right px-5 py-3 rounded-xl bg-gradient-to-br ${verdictBg} border border-gray-700/30`}>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Verdict</p>
            <p className={`text-2xl font-black ${verdictColor}`}>{result.verdict}</p>
          </div>
        </div>

        {/* ── Top stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Model Accuracy", value: `${(result.accuracy * 100).toFixed(1)}%`, icon: Activity },
            { label: "Bias Risk Score", value: `${result.bias_score}/100`, icon: AlertTriangle },
            { label: "Protected Attr", value: result.primary_protected_attribute, icon: Users },
            { label: "Metrics Computed", value: String(result.bias_metrics.length), icon: BarChart3 },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-gray-900/60 border border-gray-700/30 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-[11px] text-gray-500 uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="text-lg font-bold text-white truncate">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Metric Cards ── */}
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-400" /> Fairness Metrics
        </h2>
        <div className="space-y-3 mb-10">
          {result.bias_metrics.map((m) => {
            const meta = METRIC_LABELS[m.metric_name] || { label: m.metric_name, desc: "" };
            const sev = SEV[m.severity];
            const SevIcon = sev.icon;
            const isOpen = expanded === m.metric_name;
            const breakdown = m.group_breakdown;

            return (
              <div key={m.metric_name} className={`rounded-xl border ${sev.border} ${sev.bg} overflow-hidden transition-all`}>
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => setExpanded(isOpen ? null : m.metric_name)}
                >
                  <div className="flex items-center gap-3">
                    <SevIcon className={`w-5 h-5 ${sev.text}`} />
                    <div>
                      <p className="text-sm font-semibold text-gray-100">{meta.label}</p>
                      <p className="text-[11px] text-gray-500">{meta.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className={`text-xl font-bold ${sev.text}`}>{m.metric_value.toFixed(4)}</p>
                      <p className="text-[10px] text-gray-500">threshold: {m.threshold}</p>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                  </div>
                </button>

                {isOpen && breakdown && (
                  <div className="px-5 pb-5 border-t border-gray-700/30 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Selection rates */}
                      {breakdown.selection_rates && Object.keys(breakdown.selection_rates).length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-2">Selection Rate by Group</p>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(breakdown.selection_rates).map(([g, v]) => ({ group: g.length > 12 ? g.slice(0, 10) + "…" : g, rate: v }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="group" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 1]} />
                                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                                  {Object.keys(breakdown.selection_rates).map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* Accuracy by group */}
                      {breakdown.accuracy_by_group && Object.keys(breakdown.accuracy_by_group).length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-400 mb-2">Accuracy by Group</p>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={Object.entries(breakdown.accuracy_by_group).map(([g, v]) => ({ group: g.length > 12 ? g.slice(0, 10) + "…" : g, accuracy: v }))}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="group" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 1]} />
                                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                                <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                                  {Object.keys(breakdown.accuracy_by_group).map((_, i) => (
                                    <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* FPR/FNR table */}
                    {breakdown.fpr_by_group && Object.keys(breakdown.fpr_by_group).length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-medium text-gray-400 mb-2">Error Rates by Group</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-700/40">
                                <th className="text-left py-2 pr-4">Group</th>
                                <th className="text-right py-2 px-4">FPR</th>
                                <th className="text-right py-2 pl-4">FNR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.keys(breakdown.fpr_by_group).map((g) => (
                                <tr key={g} className="border-b border-gray-800/40">
                                  <td className="py-1.5 pr-4 text-gray-300">{g}</td>
                                  <td className="py-1.5 px-4 text-right font-mono text-gray-400">
                                    {breakdown.fpr_by_group[g]?.toFixed(4)}
                                  </td>
                                  <td className="py-1.5 pl-4 text-right font-mono text-gray-400">
                                    {breakdown.fnr_by_group[g]?.toFixed(4)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── SHAP + Demographics row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          {/* SHAP chart */}
          <div className="lg:col-span-2 rounded-xl border border-gray-700/30 bg-gray-900/50 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" /> SHAP Feature Importance
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={shapData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    formatter={(val: number) => [val.toFixed(4), "Importance"]}
                  />
                  <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                    {shapData.map((entry, i) => (
                      <Cell key={i} fill={entry.isProxy ? "#ef4444" : "#3b82f6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-500" /> Normal feature</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500" /> Proxy / protected</span>
            </div>
          </div>

          {/* Demographics pie */}
          <div className="rounded-xl border border-gray-700/30 bg-gray-900/50 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" /> Demographics
            </h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={demoData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {demoData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Proxy Features ── */}
        {result.proxy_features.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 mb-10">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
              <FileWarning className="w-4 h-4" /> Proxy Features Detected
            </h3>
            <p className="text-xs text-gray-400 mb-3">
              These features are highly correlated with the protected attribute and may encode bias indirectly.
            </p>
            <div className="flex flex-wrap gap-2">
              {result.proxy_features.map((p) => (
                <span key={p.feature} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
                  {p.feature} <span className="text-amber-500/60 ml-1">r={p.correlation.toFixed(2)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Next Step ── */}
        <div className="flex justify-end">
          <button
            id="proceed-to-courtroom"
            onClick={() => router.push(`/courtroom/${sessionId}`)}
            className="group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-amber-500 to-amber-600 text-gray-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] transition-all"
          >
            Proceed to AI Courtroom
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
