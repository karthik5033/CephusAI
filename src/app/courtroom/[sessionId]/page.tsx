"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield, Gavel, Scale, UserCheck, UserX, Loader2,
  AlertTriangle, CheckCircle2, XCircle, ArrowRight,
  ChevronRight, MessageSquare,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ───────────────────────────────────────────────────────────────────

interface TrialResult {
  session_id: string;
  verdict_id: string;
  prosecution_argument: string;
  defense_argument: string;
  judge_verdict: "guilty" | "not_guilty";
  bias_risk_score: number;
  judge_reasoning: string;
  recommended_sentence: string;
}

type Phase = "ready" | "prosecution" | "defense" | "judge" | "verdict" | "error";

// ── Typing animation hook ───────────────────────────────────────────────────

function useTypewriter(text: string, speed: number = 12, active: boolean = false) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active || !text) { setDisplayed(""); setDone(false); return; }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setDone(true); }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed, active]);

  return { displayed, done };
}

// ── Agent Card ──────────────────────────────────────────────────────────────

function AgentCard({
  role,
  icon: Icon,
  color,
  borderColor,
  bgColor,
  text,
  isActive,
  isDone,
}: {
  role: string;
  icon: React.ElementType;
  color: string;
  borderColor: string;
  bgColor: string;
  text: string;
  isActive: boolean;
  isDone: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { displayed, done } = useTypewriter(text, 8, isActive || isDone);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayed]);

  const content = isDone && !isActive ? text : displayed;

  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} transition-all duration-500 ${isActive ? "ring-2 ring-offset-2 ring-offset-[#0a0a0f]" : ""}`}
         style={isActive ? { "--tw-ring-color": color } as React.CSSProperties : {}}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${isActive ? "animate-pulse" : ""}`}
             style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-100">{role}</h3>
          {isActive && !done && (
            <span className="text-[10px] uppercase tracking-widest text-gray-500 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Speaking…
            </span>
          )}
          {(isDone || done) && (
            <span className="text-[10px] uppercase tracking-widest text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Complete
            </span>
          )}
        </div>
      </div>
      {content && (
        <div ref={scrollRef} className="px-5 pb-4 max-h-64 overflow-y-auto">
          <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
            {content}
            {isActive && !done && <span className="animate-pulse text-amber-400">▎</span>}
          </div>
        </div>
      )}
      {!content && !isActive && (
        <div className="px-5 pb-4">
          <p className="text-xs text-gray-600 italic">Waiting…</p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Main Page
// ═════════════════════════════════════════════════════════════════════════════

export default function CourtroomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrialResult | null>(null);

  // Phases for typewriter sequencing
  const [prosecutionDone, setProsecutionDone] = useState(false);
  const [defenseDone, setDefenseDone] = useState(false);
  const [judgeDone, setJudgeDone] = useState(false);

  // ── Start Trial ──
  const startTrial = async () => {
    setPhase("prosecution");
    setError(null);
    setProsecutionDone(false);
    setDefenseDone(false);
    setJudgeDone(false);

    try {
      const res = await fetch(`${API}/api/courtroom/trial/${sessionId}`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail));
      }

      const data: TrialResult = await res.json();
      setResult(data);

      // Sequence the typewriter animations
      setPhase("prosecution");
      setProsecutionDone(true);

      // Wait for prosecution typing to feel right, then show defense
      setTimeout(() => {
        setPhase("defense");
        setDefenseDone(true);
      }, Math.min(data.prosecution_argument.length * 8 + 500, 4000));

      // Then judge
      setTimeout(() => {
        setPhase("judge");
        setJudgeDone(true);
      }, Math.min(
        (data.prosecution_argument.length + data.defense_argument.length) * 8 + 1000,
        8000,
      ));

      // Then final verdict reveal
      setTimeout(() => {
        setPhase("verdict");
      }, Math.min(
        (data.prosecution_argument.length + data.defense_argument.length + data.judge_reasoning.length) * 8 + 1500,
        12000,
      ));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Trial failed");
      setPhase("error");
    }
  };

  // ── Render: Ready ──
  if (phase === "ready" || phase === "error") {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-100 flex items-center justify-center">
        <div className="max-w-md text-center space-y-6 px-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15">
            <Gavel className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] uppercase tracking-widest font-semibold text-amber-400">
              AI Courtroom
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">The Trial Begins</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Three AI agents powered by Claude will debate your model&apos;s fairness.
            The <span className="text-red-400 font-medium">Prosecutor</span> will
            argue it&apos;s biased, the{" "}
            <span className="text-blue-400 font-medium">Defense</span> will argue
            it&apos;s fair, and the{" "}
            <span className="text-amber-400 font-medium">Judge</span> will deliver
            a binding verdict.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-left">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            id="start-trial-btn"
            onClick={startTrial}
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-500 to-red-500 text-gray-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] transition-all"
          >
            <Gavel className="w-5 h-5" />
            Begin Trial
          </button>

          <p className="text-[10px] text-gray-600 font-mono">
            Session: {sessionId}
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Trial in progress / verdict ──
  const isVerdictPhase = phase === "verdict" && result;
  const verdictColor = result?.judge_verdict === "guilty" ? "text-red-400" : "text-emerald-400";
  const verdictBg = result?.judge_verdict === "guilty" ? "from-red-500/10 to-red-900/10" : "from-emerald-500/10 to-emerald-900/10";
  const verdictBorder = result?.judge_verdict === "guilty" ? "border-red-500/30" : "border-emerald-500/30";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-100 pb-20">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-amber-500/[0.02] via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/15 mb-3">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] uppercase tracking-widest font-semibold text-amber-400">
              {isVerdictPhase ? "Verdict Delivered" : "Trial In Progress"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">AI Courtroom</h1>
        </div>

        {/* Loading state while API call is in flight */}
        {!result && (
          <div className="text-center py-16 space-y-4">
            <Loader2 className="w-12 h-12 text-amber-400 animate-spin mx-auto" />
            <p className="text-sm text-gray-500">
              Claude is preparing the courtroom arguments…
            </p>
            <p className="text-xs text-gray-600">
              This makes 3 API calls and may take 15–30 seconds.
            </p>
          </div>
        )}

        {result && (
          <>
            {/* Agent Cards */}
            <div className="space-y-4 mb-8">
              <AgentCard
                role="🔴 Prosecutor"
                icon={UserX}
                color="#ef4444"
                borderColor="border-red-500/20"
                bgColor="bg-red-950/10"
                text={result.prosecution_argument}
                isActive={phase === "prosecution"}
                isDone={prosecutionDone && phase !== "prosecution"}
              />
              <AgentCard
                role="🔵 Defense Attorney"
                icon={UserCheck}
                color="#3b82f6"
                borderColor="border-blue-500/20"
                bgColor="bg-blue-950/10"
                text={result.defense_argument}
                isActive={phase === "defense"}
                isDone={defenseDone && phase !== "defense"}
              />
              <AgentCard
                role="⚖️ Judge"
                icon={Gavel}
                color="#f59e0b"
                borderColor="border-amber-500/20"
                bgColor="bg-amber-950/10"
                text={result.judge_reasoning}
                isActive={phase === "judge"}
                isDone={judgeDone && phase !== "judge"}
              />
            </div>

            {/* Verdict Banner */}
            {isVerdictPhase && (
              <div className={`rounded-2xl border ${verdictBorder} bg-gradient-to-r ${verdictBg} p-6 mb-6 animate-in fade-in duration-700`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Gavel className="w-6 h-6 text-amber-400" />
                    <h2 className="text-lg font-bold text-white">Final Verdict</h2>
                  </div>
                  <div className={`text-3xl font-black ${verdictColor} uppercase tracking-wider`}>
                    {result.judge_verdict === "guilty" ? "GUILTY" : "NOT GUILTY"}
                  </div>
                </div>

                {/* Risk Score Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                    <span>Bias Risk Score</span>
                    <span className="font-mono font-bold text-gray-300">{result.bias_risk_score}/100</span>
                  </div>
                  <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${result.bias_risk_score}%`,
                        background: result.bias_risk_score > 60
                          ? "linear-gradient(90deg, #ef4444, #dc2626)"
                          : result.bias_risk_score > 30
                          ? "linear-gradient(90deg, #f59e0b, #d97706)"
                          : "linear-gradient(90deg, #10b981, #059669)",
                      }}
                    />
                  </div>
                </div>

                {/* Sentence */}
                <div className="rounded-xl bg-gray-900/50 border border-gray-700/30 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                      Recommended Sentence
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {result.recommended_sentence}
                  </p>
                </div>
              </div>
            )}

            {/* Next Step */}
            {isVerdictPhase && (
              <div className="flex justify-end">
                <button
                  id="proceed-to-remediation"
                  onClick={() => router.push(`/remediation/${sessionId}`)}
                  className="group flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-gray-950 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:scale-[1.02] transition-all"
                >
                  Proceed to Remediation
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
