import re

with open(r"d:\coding_files\Cephus-new-main\src\app\trial\new\verdict\page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Insert state variables
state_vars = """
  const [typedCode, setTypedCode] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);

  const statuses = [
    "Analyzing bias patterns...",
    "Injecting fairness constraints...",
    "Retraining model...",
    "Complete"
  ];

  useEffect(() => {
    if (retraining && statusIdx < 2) {
      const timer = setInterval(() => {
        setStatusIdx(prev => prev + 1);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [retraining, statusIdx]);

  const startTyping = (fullText: string) => {
    setIsTyping(true);
    setTypedCode("");
    setStatusIdx(3);
    let i = 0;
    const interval = setInterval(() => {
      i += 10;
      setTypedCode(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        setTypedCode(fullText);
        setIsTyping(false);
      }
    }, 10);
  };
"""

content = re.sub(
    r"(const \[retrainError, setRetrainError\] = useState<string \| null>\(null\);)",
    r"\1\n" + state_vars,
    content,
    count=1
)

new_handleRetrain = """  const handleRetrain = async () => {
    if (!sessionId) {
      setRetrainError("No session ID found. Please re-run the analysis.");
      return;
    }
    setRetraining(true);
    setRetrainError(null);
    setStatusIdx(0);

    try {
      const res = await fetch("/api/mitigate-and-retrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Server returned invalid response: ${rawText.slice(0, 200)}`);
      }

      if (!res.ok && !data.retrain_success && data.retrain_success !== false) {
        throw new Error(data.error || data.rawResponse || "Retrain failed");
      }

      if (data.retrain_success === false) {
        const errMsg = data.error || "Retrain script failed";
        const stderr = data.stderr ? `\\n\\nScript error:\\n${data.stderr.slice(-500)}` : "";
        setRetrainError(errMsg + stderr);
        return;
      }

      setRetrainResult(data);
      if (data.modified_script) {
        startTyping(data.modified_script);
      }
    } catch (err: any) {
      setRetrainError(err.message || "Retrain failed.");
    } finally {
      setRetraining(false);
    }
  };"""

content = re.sub(
    r"  const handleRetrain = async \(\) => \{.*?\n  \};\n",
    new_handleRetrain + "\n",
    content,
    flags=re.DOTALL,
    count=1
)

retrain_ui = """          {/* Retrain Section */}
          {verdict === "GUILTY" && (
            <motion.div variants={FADE_UP} className="bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
              <div className="p-6 border-b border-border bg-white">
                <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <RotateCcw className="w-5 h-5" /> Court Reform Order — Automated Retraining
                </h2>
                <p className="text-sm text-foreground/60 mt-1">
                  {hasScript
                    ? "Your training script will be automatically modified by AI to inject fairness constraints, then re-executed to produce a bias-mitigated model."
                    : "No training script was uploaded. The system will auto-generate a training script based on your model type and apply fairness constraints."}
                </p>
              </div>

              {!retrainResult && !retraining && !isTyping && (
                <div className="p-6 bg-white">
                  <button
                    onClick={handleRetrain}
                    disabled={!sessionId}
                    className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
                      sessionId
                        ? 'bg-foreground text-background hover:bg-foreground/90 shadow-md'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <RotateCcw className="w-5 h-5" />
                    {hasScript ? "Run Mitigated Retrain" : "Auto-Generate & Retrain"}
                  </button>
                </div>
              )}

              {retrainError && (
                <div className="p-6 bg-white border-t border-border">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm font-semibold text-red-700">Retrain Failed</p>
                    <pre className="text-xs text-red-600 mt-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap font-mono bg-red-100/50 rounded p-2">{retrainError}</pre>
                    <button
                      onClick={() => { setRetrainError(null); handleRetrain(); }}
                      className="mt-3 flex items-center gap-2 px-4 py-2 text-sm font-medium bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> Retry
                    </button>
                  </div>
                </div>
              )}

              {(retraining || retrainResult || isTyping) && !retrainError && (
                <div className="flex flex-col border-b border-[#30363d] bg-[#0d1117]">
                  {/* Split Panels */}
                  <div className="grid grid-cols-1 md:grid-cols-2 text-gray-300 font-mono text-xs md:divide-x divide-y md:divide-y-0 divide-[#30363d] h-[450px]">
                    {/* Left Panel */}
                    <div className="overflow-y-auto flex flex-col relative bg-[#0d1117]">
                      <div className="sticky top-0 bg-[#0d1117] border-b border-[#30363d] px-4 py-2 font-semibold text-gray-400 flex justify-between z-10 shadow-sm">
                         <span>original_script.py</span>
                      </div>
                      <div className="py-2 pb-8">
                        {(retrainResult?.original_script || analysis?.script_content || "Loading original script...\\n\\n# Waiting for backend to provide the script...")?.split('\\n').map((line: string, i: number) => {
                          const newLines = retrainResult?.modified_script?.split('\\n').map((l: string) => l.trim()) || [];
                          const isRemoved = retrainResult && !newLines.includes(line.trim()) && line.trim() !== "";
                          return (
                            <div key={i} className={`px-4 flex leading-relaxed ${isRemoved ? "bg-red-900/30 text-red-200" : ""}`}>
                              <span className="text-[#6e7681] select-none w-6 text-right mr-4 shrink-0">{i + 1}</span>
                              <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Right Panel */}
                    <div className="overflow-y-auto flex flex-col relative bg-[#0d1117]">
                      <div className="sticky top-0 bg-[#0d1117] border-b border-[#30363d] px-4 py-2 font-semibold text-[#4493f8] flex justify-between z-10 shadow-sm">
                         <span>mitigated_script.py</span>
                      </div>
                      <div className="py-2 pb-8">
                        {!isTyping && !retrainResult ? (
                          <div className="px-4 text-[#8b949e] italic mt-2 animate-pulse">Waiting for AI to analyze and modify the script...</div>
                        ) : (
                          typedCode.split('\\n').map((line: string, i: number, arr: string[]) => {
                            const oldLines = (retrainResult?.original_script || analysis?.script_content || "")?.split('\\n').map((l: string) => l.trim()) || [];
                            const isAdded = !oldLines.includes(line.trim()) && line.trim() !== "";
                            return (
                              <div key={i} className={`px-4 flex leading-relaxed ${isAdded ? "bg-green-900/30 text-green-200" : ""}`}>
                                <span className="text-[#6e7681] select-none w-6 text-right mr-4 shrink-0">{i + 1}</span>
                                <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                                {i === arr.length - 1 && isTyping && (
                                   <span className="inline-block w-2 h-3 bg-gray-400 animate-pulse ml-1 align-middle" />
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Status Bar */}
                  <div className="bg-[#161b22] px-4 py-3 flex items-center gap-3 text-xs font-mono border-t border-[#30363d]">
                     {retraining ? (
                       <>
                         <Loader2 className="w-4 h-4 animate-spin text-[#4493f8]" />
                         <span className="text-[#4493f8]">{statuses[statusIdx]}</span>
                       </>
                     ) : isTyping ? (
                       <>
                         <Loader2 className="w-4 h-4 animate-spin text-[#3fb950]" />
                         <span className="text-[#3fb950]">Applying changes character by character...</span>
                       </>
                     ) : (
                       <>
                         <CheckCircle2 className="w-4 h-4 text-[#3fb950]" />
                         <span className="text-[#3fb950]">Complete</span>
                       </>
                     )}
                  </div>
                </div>
              )}

              {retrainResult && !isTyping && !retrainError && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-white space-y-6">
                  {/* Metrics Table */}
                  <div className="bg-background border border-border rounded-xl overflow-hidden">
                    <div className="bg-surface/50 px-4 py-3 border-b border-border">
                      <h3 className="font-semibold text-sm flex items-center gap-2">
                        {retrainResult.retrial_passed
                          ? <><CheckCircle2 className="w-4 h-4 text-green-600" /> Retrial PASSED</>
                          : <><XCircle className="w-4 h-4 text-amber-600" /> Retrial Partial</>}
                      </h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-surface/30 text-xs uppercase text-foreground/60">
                        <tr>
                          <th className="px-4 py-2 text-left">Metric</th>
                          <th className="px-4 py-2 text-right">Before</th>
                          <th className="px-4 py-2 text-center"></th>
                          <th className="px-4 py-2 text-right">After</th>
                          <th className="px-4 py-2 text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {Object.keys(retrainResult.before || {}).map(key => (
                          <tr key={key}>
                            <td className="px-4 py-3 font-medium">{METRIC_LABELS[key] || key}</td>
                            <td className="px-4 py-3 text-right font-mono text-red-600">{retrainResult.before[key]?.toFixed(4)}</td>
                            <td className="px-4 py-3 text-center"><ArrowRight className="w-4 h-4 text-foreground/30 mx-auto" /></td>
                            <td className={`px-4 py-3 text-right font-mono ${retrainResult.after[key] >= 0.8 ? 'text-green-600' : 'text-amber-600'}`}>
                              {retrainResult.after[key]?.toFixed(4)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${retrainResult.improvement[key] > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {retrainResult.improvement[key] > 0 ? "+" : ""}{retrainResult.improvement[key]?.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Accuracy comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-background border border-border rounded-xl text-center">
                      <p className="text-xs text-foreground/50 uppercase font-bold mb-1">Original Accuracy</p>
                      <p className="text-2xl font-bold">{((retrainResult.original_accuracy || 0) * 100).toFixed(1)}%</p>
                    </div>
                    <div className="p-4 bg-background border border-border rounded-xl text-center">
                      <p className="text-xs text-foreground/50 uppercase font-bold mb-1">New Accuracy</p>
                      <p className="text-2xl font-bold text-blue-600">{((retrainResult.new_accuracy || 0) * 100).toFixed(1)}%</p>
                    </div>
                  </div>

                  {/* Downloads */}
                  <div className="flex flex-wrap gap-3">
                    {sessionId && (
                      <>
                        <a
                          href={`/api/download/${sessionId}/model`}
                          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-lg font-medium text-sm hover:bg-foreground/90 transition-colors"
                        >
                          <FileDown className="w-4 h-4" /> Download Mitigated Model
                        </a>
                        <a
                          href={`/api/download/${sessionId}/script`}
                          className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-lg font-medium text-sm hover:bg-surface transition-colors"
                        >
                          <Code2 className="w-4 h-4" /> Download Modified Script
                        </a>
                      </>
                    )}
                    <button onClick={downloadPDF}
                      className="flex items-center gap-2 px-5 py-2.5 border border-border rounded-lg font-medium text-sm hover:bg-surface transition-colors">
                      <Download className="w-4 h-4" /> Download PDF Report
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}"""

content = re.sub(
    r"          \{\/\* Retrain Section \*\/\}\n          \{verdict === \"GUILTY\" && \(\n            <motion\.div variants=\{FADE_UP\} className=\"bg-surface border border-border rounded-xl p-6\">\n.*?\n            <\/motion\.div>\n          \)\}",
    retrain_ui,
    content,
    flags=re.DOTALL,
    count=1
)

with open(r"d:\coding_files\Cephus-new-main\src\app\trial\new\verdict\page.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("done")
