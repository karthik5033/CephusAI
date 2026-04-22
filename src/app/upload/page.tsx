"use client";

import React, { useState, useCallback } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileSpreadsheet,
  Box,
  Code2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Shield,
  ChevronRight,
  Database,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DatasetResponse {
  session_id: string;
  row_count: number;
  column_names: string[];
  detected_protected_attributes: string[];
}

interface ModelResponse {
  session_id: string;
  model_type: string;
  n_features_in_: number | null;
}

interface ScriptResponse {
  session_id: string;
  line_count: number;
  detected_libraries: string[];
}

type StepStatus = "idle" | "uploading" | "success" | "error";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Upload Step Card ───────────────────────────────────────────────────────

function StepCard({
  step,
  title,
  subtitle,
  icon: Icon,
  accept,
  disabled,
  status,
  error,
  progress,
  onDrop,
  children,
  badge,
}: {
  step: number;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accept: Record<string, string[]>;
  disabled: boolean;
  status: StepStatus;
  error: string | null;
  progress: number;
  onDrop: (files: File[]) => void;
  children?: React.ReactNode;
  badge?: string;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    disabled: disabled || status === "uploading",
  });

  const borderColor =
    status === "success"
      ? "border-emerald-500/50"
      : status === "error"
      ? "border-red-500/50"
      : isDragActive
      ? "border-amber-400/70"
      : disabled
      ? "border-gray-700/30"
      : "border-gray-600/40 hover:border-gray-500/60";

  const bgColor =
    status === "success"
      ? "bg-emerald-950/20"
      : status === "error"
      ? "bg-red-950/20"
      : isDragActive
      ? "bg-amber-950/20"
      : "bg-gray-900/50";

  return (
    <div
      className={`relative rounded-2xl border-2 ${borderColor} ${bgColor} transition-all duration-300 ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
    >
      {/* Progress bar */}
      {status === "uploading" && (
        <div className="absolute top-0 left-0 h-1 rounded-t-2xl bg-amber-400/80 transition-all duration-300"
             style={{ width: `${progress}%` }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2">
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-xl text-sm font-bold ${
              status === "success"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-gray-700/50 text-gray-400"
            }`}
          >
            {status === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              step
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-100">{title}</h3>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
        </div>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
            {badge}
          </span>
        )}
      </div>

      {/* Dropzone */}
      {status !== "success" && (
        <div
          {...getRootProps()}
          className={`mx-5 mb-4 mt-2 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-all duration-200 ${
            isDragActive
              ? "border-amber-400/60 bg-amber-500/5"
              : "border-gray-700/50 hover:border-gray-600/60 hover:bg-gray-800/30"
          }`}
        >
          <input {...getInputProps()} />
          {status === "uploading" ? (
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          ) : (
            <Icon className="w-8 h-8 text-gray-500" />
          )}
          <p className="text-sm text-gray-400">
            {status === "uploading"
              ? "Uploading & validating…"
              : isDragActive
              ? "Drop it here"
              : "Drag & drop or click to browse"}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {/* Success content */}
      {status === "success" && children && (
        <div className="px-6 pb-5">{children}</div>
      )}
    </div>
  );
}

// ─── Main Upload Page ───────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();

  // ── State ──
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Dataset
  const [datasetStatus, setDatasetStatus] = useState<StepStatus>("idle");
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetProgress, setDatasetProgress] = useState(0);
  const [datasetResult, setDatasetResult] = useState<DatasetResponse | null>(null);

  // Model
  const [modelStatus, setModelStatus] = useState<StepStatus>("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelResult, setModelResult] = useState<ModelResponse | null>(null);

  // Script
  const [scriptStatus, setScriptStatus] = useState<StepStatus>("idle");
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptProgress, setScriptProgress] = useState(0);
  const [scriptResult, setScriptResult] = useState<ScriptResponse | null>(null);

  // ── Upload helpers ──

  const uploadFile = useCallback(
    async (
      url: string,
      file: File,
      setStatus: (s: StepStatus) => void,
      setError: (e: string | null) => void,
      setProgress: (n: number) => void,
    ): Promise<Record<string, unknown> | null> => {
      setStatus("uploading");
      setError(null);
      setProgress(10);

      const formData = new FormData();
      formData.append("file", file);

      try {
        // Simulate progress stages during fetch
        setProgress(30);

        const res = await fetch(url, {
          method: "POST",
          body: formData,
        });

        setProgress(70);

        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }));
          const msg =
            typeof body.detail === "string"
              ? body.detail
              : JSON.stringify(body.detail);
          throw new Error(msg);
        }

        setProgress(100);
        const data = await res.json();
        setStatus("success");
        return data;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        setStatus("error");
        setProgress(0);
        return null;
      }
    },
    [],
  );

  // ── Dataset upload ──
  const onDatasetDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      const data = await uploadFile(
        `${API_BASE}/api/upload/dataset`,
        file,
        setDatasetStatus,
        setDatasetError,
        setDatasetProgress,
      );

      if (data) {
        const typed = data as unknown as DatasetResponse;
        setSessionId(typed.session_id);
        setDatasetResult(typed);
      }
    },
    [uploadFile],
  );

  // ── Model upload ──
  const onModelDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !sessionId) return;

      const data = await uploadFile(
        `${API_BASE}/api/upload/model?session_id=${sessionId}`,
        file,
        setModelStatus,
        setModelError,
        setModelProgress,
      );

      if (data) {
        setModelResult(data as unknown as ModelResponse);
      }
    },
    [sessionId, uploadFile],
  );

  // ── Script upload ──
  const onScriptDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || !sessionId) return;

      const data = await uploadFile(
        `${API_BASE}/api/upload/script?session_id=${sessionId}`,
        file,
        setScriptStatus,
        setScriptError,
        setScriptProgress,
      );

      if (data) {
        setScriptResult(data as unknown as ScriptResponse);
      }
    },
    [sessionId, uploadFile],
  );

  const canProceed = datasetStatus === "success" && modelStatus === "success";

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100">
      {/* Subtle gradient backdrop */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-amber-500/[0.03] via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15 mb-4">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] uppercase tracking-widest font-semibold text-amber-400">
              AI Courtroom v2.0
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Begin Your Bias Audit
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Upload your dataset, trained model, and optionally the training
            script. We&apos;ll run real Fairlearn + SHAP analysis on your data.
          </p>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-5">
          {/* Step 1: Dataset */}
          <StepCard
            step={1}
            title="Dataset"
            subtitle="CSV file with at least 500 rows"
            icon={FileSpreadsheet}
            accept={{ "text/csv": [".csv"] }}
            disabled={false}
            status={datasetStatus}
            error={datasetError}
            progress={datasetProgress}
            onDrop={onDatasetDrop}
          >
            {datasetResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    {datasetResult.row_count.toLocaleString()} rows ·{" "}
                    {datasetResult.column_names.length} columns
                  </span>
                </div>

                {/* Column chips */}
                <div className="flex flex-wrap gap-1.5">
                  {datasetResult.column_names.map((col) => {
                    const isProtected =
                      datasetResult.detected_protected_attributes.includes(col);
                    return (
                      <span
                        key={col}
                        className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                          isProtected
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                            : "bg-gray-800 text-gray-400 border border-gray-700/50"
                        }`}
                      >
                        {isProtected && "⚡ "}
                        {col}
                      </span>
                    );
                  })}
                </div>

                <p className="text-[11px] text-gray-500">
                  <span className="text-amber-400">⚡ Protected attributes</span>{" "}
                  detected and highlighted above
                </p>
              </div>
            )}
          </StepCard>

          {/* Step 2: Model */}
          <StepCard
            step={2}
            title="Trained Model"
            subtitle=".pkl or .joblib scikit-learn estimator"
            icon={Box}
            accept={{
              "application/octet-stream": [".pkl", ".joblib"],
            }}
            disabled={datasetStatus !== "success"}
            status={modelStatus}
            error={modelError}
            progress={modelProgress}
            onDrop={onModelDrop}
          >
            {modelResult && (
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-emerald-400 font-medium">
                    {modelResult.model_type}
                  </span>
                  {modelResult.n_features_in_ !== null && (
                    <span className="text-gray-500 ml-2">
                      · {modelResult.n_features_in_} features expected
                    </span>
                  )}
                </div>
              </div>
            )}
          </StepCard>

          {/* Step 3: Script (optional) */}
          <StepCard
            step={3}
            title="Training Script"
            subtitle=".py file used to train the model"
            icon={Code2}
            accept={{ "text/x-python": [".py"] }}
            disabled={datasetStatus !== "success"}
            status={scriptStatus}
            error={scriptError}
            progress={scriptProgress}
            onDrop={onScriptDrop}
            badge="Required for Remediation"
          >
            {scriptResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    {scriptResult.line_count} lines
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {scriptResult.detected_libraries.map((lib) => (
                    <span
                      key={lib}
                      className="text-[11px] px-2 py-0.5 rounded-md font-mono bg-gray-800 text-gray-400 border border-gray-700/50"
                    >
                      {lib}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </StepCard>
        </div>

        {/* Phase 0: Dataset Review button */}
        {datasetStatus === "success" && sessionId && (
          <div className="mt-5">
            <button
              id="proceed-to-dataset-review"
              onClick={() => router.push(`/dataset-review/${sessionId}`)}
              className="w-full group flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 border border-violet-500/30 text-violet-400 bg-violet-500/5 hover:bg-violet-500/10 hover:border-violet-500/50"
            >
              <Database className="w-4 h-4" />
              Run Data Minimisation Check (No Model Required)
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        )}

        {/* Proceed button */}
        <div className="mt-4 flex justify-end">
          <button
            id="proceed-to-analysis"
            disabled={!canProceed}
            onClick={() => router.push(`/analysis/${sessionId}`)}
            className={`group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-300 ${
              canProceed
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-gray-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02]"
                : "bg-gray-800 text-gray-500 cursor-not-allowed"
            }`}
          >
            Proceed to Bias Analysis
            <ArrowRight
              className={`w-4 h-4 transition-transform ${
                canProceed ? "group-hover:translate-x-0.5" : ""
              }`}
            />
          </button>
        </div>

        {/* Session ID badge */}
        {sessionId && (
          <div className="mt-4 text-center">
            <span className="text-[10px] text-gray-600 font-mono">
              Session: {sessionId}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
