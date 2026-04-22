"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  X, Loader2, Download, Shield, AlertTriangle, ShieldAlert,
  ShieldCheck, ShieldX,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DimensionScore {
  dimension: string;
  score: number;
  finding: string;
}

interface Fingerprint {
  overallRisk: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  dimensions: DimensionScore[];
  summary: string;
}

interface BiasGFingerprintProps {
  open: boolean;
  onClose: () => void;
  datasetName: string;
  sensitiveAttr: string;
  demographicParity: number;
  equalOpportunity: number;
  disparateImpact: number;
}

// ─── Risk badge config ──────────────────────────────────────────────────────

const RISK_CONFIG = {
  LOW:      { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30", icon: ShieldCheck, label: "Low Risk" },
  MODERATE: { bg: "bg-gold/10",   text: "text-gold",   border: "border-gold/30",   icon: Shield,      label: "Moderate Risk" },
  HIGH:     { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-500/30",  icon: AlertTriangle, label: "High Risk" },
  CRITICAL: { bg: "bg-red-500/10",     text: "text-red-400",     border: "border-red-500/30",     icon: ShieldX,      label: "Critical Risk" },
};

const SCORE_COLOR = (score: number) =>
  score >= 0.7 ? "bg-red-500" : score >= 0.4 ? "bg-amber-500" : "bg-emerald-500";

const SCORE_TEXT = (score: number) =>
  score >= 0.7 ? "text-red-400" : score >= 0.4 ? "text-gold" : "text-emerald-400";

// ─── Component ──────────────────────────────────────────────────────────────

export default function BiasFingerprint({
  open,
  onClose,
  datasetName,
  sensitiveAttr,
  demographicParity,
  equalOpportunity,
  disparateImpact,
}: BiasGFingerprintProps) {
  const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFingerprint = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bias-fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetName,
          sensitiveAttr,
          demographicParity,
          equalOpportunity,
          disparateImpact,
        }),
      });

      if (!res.ok) throw new Error("Failed to generate fingerprint");

      const data: Fingerprint = await res.json();
      setFingerprint(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [datasetName, sensitiveAttr, demographicParity, equalOpportunity, disparateImpact]);

  useEffect(() => {
    if (open && !fingerprint && !loading) {
      fetchFingerprint();
    }
  }, [open, fingerprint, loading, fetchFingerprint]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setFingerprint(null);
      setError(null);
    }
  }, [open]);

  // ── PDF Certificate ──

  const downloadCertificate = () => {
    if (!fingerprint) return;

    const doc = new jsPDF();
    const pw = doc.internal.pageSize.width;
    let y = 20;

    const center = (text: string, yPos: number) => {
      doc.text(text, (pw - doc.getTextWidth(text)) / 2, yPos);
    };

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    center("TrialAI", y);
    y += 10;

    doc.setFontSize(16);
    center("Bias Fingerprint Certificate", y);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    center(`Dataset: ${datasetName} | Sensitive: ${sensitiveAttr} | ${new Date().toLocaleDateString()}`, y);
    y += 12;

    // Overall risk
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    center(`Overall Risk: ${fingerprint.overallRisk}`, y);
    y += 12;

    // Metrics table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Input Fairness Metrics", 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value", "Threshold", "Status"]],
      body: [
        ["Demographic Parity", demographicParity.toFixed(4), "> 0.80", demographicParity >= 0.8 ? "PASS" : "FAIL"],
        ["Equal Opportunity", equalOpportunity.toFixed(4), "> 0.80", equalOpportunity >= 0.8 ? "PASS" : "FAIL"],
        ["Disparate Impact", disparateImpact.toFixed(4), "> 0.80", disparateImpact >= 0.8 ? "PASS" : "FAIL"],
      ],
      theme: "plain",
      styles: { lineColor: [0, 0, 0], lineWidth: 0.1, fontSize: 10 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    // Dimension scores
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Bias Dimension Scores", 14, y);
    y += 5;

    autoTable(doc, {
      startY: y,
      head: [["Dimension", "Score", "Risk Level", "Finding"]],
      body: fingerprint.dimensions.map((d) => [
        d.dimension,
        (d.score * 100).toFixed(0) + "%",
        d.score >= 0.7 ? "HIGH" : d.score >= 0.4 ? "MODERATE" : "LOW",
        d.finding,
      ]),
      theme: "plain",
      styles: { lineColor: [0, 0, 0], lineWidth: 0.1, fontSize: 9, cellWidth: "wrap" },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: { 3: { cellWidth: 70 } },
    });

    y = (doc as any).lastAutoTable.finalY + 12;

    // Summary
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Summary", 14, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(fingerprint.summary, pw - 28);
    doc.text(lines, 14, y);

    // Footer
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      center(`Generated by TrialAI Bias Fingerprint Engine — ${new Date().toLocaleString()}`, doc.internal.pageSize.height - 10);
    }

    doc.save(`TrialAI-BiasFingerprint-${datasetName.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ── Radar data ──

  const radarData = fingerprint?.dimensions.map((d) => ({
    dimension: d.dimension,
    score: Math.round(d.score * 100),
    fullMark: 100,
  })) || [];

  // ── Render ──

  const risk = fingerprint ? RISK_CONFIG[fingerprint.overallRisk] : null;
  const RiskIcon = risk?.icon || Shield;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-black/60 backdrop-blur-3xl rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 overflow-hidden flex flex-col"
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Bias Fingerprint</h2>
                  <p className="text-xs text-white/50">{datasetName} — {sensitiveAttr}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {fingerprint && risk && (
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${risk.bg} ${risk.text} ${risk.border}`}>
                    <RiskIcon className="w-3.5 h-3.5" />
                    {risk.label}
                  </div>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-white/70">Generating Bias Fingerprint…</p>
                    <p className="text-xs text-white/40 mt-1">Analyzing 6 bias dimensions with AI</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <ShieldX className="w-10 h-10 text-red-400" />
                  <p className="text-sm text-red-400 font-medium">{error}</p>
                  <button
                    onClick={fetchFingerprint}
                    className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {fingerprint && !loading && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* ── Left: Radar Chart + Summary ── */}
                  <div className="space-y-6">
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4">Radar Profile</h3>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                            <PolarGrid stroke="#ffffff1a" />
                            <PolarAngleAxis
                              dataKey="dimension"
                              tick={{ fontSize: 11, fill: "#ffffff66" }}
                            />
                            <PolarRadiusAxis
                              angle={30}
                              domain={[0, 100]}
                              tick={{ fontSize: 9, fill: "#ffffff4d" }}
                              tickCount={5}
                            />
                            <Tooltip
                              contentStyle={{
                                borderRadius: "8px",
                                fontSize: "12px",
                                background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)",
                                border: "1px solid #ffffff1a",
                              }}
                              formatter={(value: any) => [`${value}%`, "Bias Score"]}
                            />
                            <Radar
                              name="Bias Score"
                              dataKey="score"
                              stroke="#EF4444"
                              fill="#EF4444"
                              fillOpacity={0.15}
                              strokeWidth={2}
                            />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-2">Analysis Summary</h3>
                      <p className="text-sm text-white/70 leading-relaxed">
                        {fingerprint.summary}
                      </p>
                    </div>
                  </div>

                  {/* ── Right: Dimension Rows ── */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white mb-1">Dimension Breakdown</h3>
                    {fingerprint.dimensions.map((dim, i) => (
                      <motion.div
                        key={dim.dimension}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        className="bg-white/[0.03] border border-white/10 rounded-xl p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-white">
                            {dim.dimension}
                          </span>
                          <span className={`text-sm font-bold ${SCORE_TEXT(dim.score)}`}>
                            {(dim.score * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden mb-2.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${dim.score * 100}%` }}
                            transition={{ duration: 0.6, delay: i * 0.08 + 0.2 }}
                            className={`h-full rounded-full ${SCORE_COLOR(dim.score)}`}
                          />
                        </div>

                        <p className="text-xs text-white/50 leading-relaxed">
                          {dim.finding}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            {fingerprint && !loading && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02]">
                <button
                  onClick={downloadCertificate}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-black rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Certificate
                </button>
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-5 py-2.5 border border-white/10 rounded-lg text-sm font-medium hover:bg-white/[0.03] transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
