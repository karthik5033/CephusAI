"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scale, Shield, Gavel, FileText, CheckCircle2, XCircle, AlertTriangle, ChevronRight, User, ShieldAlert, ArrowRight, Loader2, ExternalLink, PlayCircle } from "lucide-react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import Link from "next/link";

// --- MOCK DATA ---

const DEMO_DATASET = {
  name: "COMPAS Recidivism Prediction",
  rows: "10,324",
  features: 14,
  model: "Logistic Regression",
  accuracy: "72.4%",
  demographics: [
    { name: "Caucasian", value: 3400, color: "#94a3b8" },
    { name: "African American", value: 3100, color: "#3b82f6" },
    { name: "Hispanic", value: 2000, color: "#f59e0b" },
    { name: "Other", value: 1824, color: "#10b981" },
  ]
};

const SHAP_DATA = [
  { feature: "Prior Arrests", importance: 0.85 },
  { feature: "Age", importance: 0.65 },
  { feature: "Zipcode (Proxy)", importance: 0.55 },
  { feature: "Charge Degree", importance: 0.45 },
  { feature: "Employment Duration", importance: 0.35 },
  { feature: "Education Level", importance: 0.25 },
  { feature: "Marital Status", importance: 0.15 },
  { feature: "Substance Abuse History", importance: 0.12 },
].reverse();

const COUNTERFACTUALS = [
  { id: 1, original: "High Risk", flipped: "Low Risk", change: "Risk Score decreased by 40%", attr: "Race: Black → White" },
  { id: 2, original: "Low Risk", flipped: "Low Risk", change: "No change", attr: "Race: White → Black" },
  { id: 3, original: "High Risk", flipped: "Medium Risk", change: "Risk Score decreased by 20%", attr: "Gender: Male → Female" },
  { id: 4, original: "Medium Risk", flipped: "Low Risk", change: "Risk Score decreased by 25%", attr: "Age: 25 → 35" },
];

const JURY_PERSONAS = [
  { id: 1, name: "Marcus T.", age: 24, occupation: "Retail Worker", demographic: "African American", outcome: "Denied" },
  { id: 2, name: "Sarah J.", age: 31, occupation: "Teacher", demographic: "Caucasian", outcome: "Approved" },
  { id: 3, name: "Luis M.", age: 28, occupation: "Construction", demographic: "Hispanic", outcome: "Denied" },
  { id: 4, name: "Emily R.", age: 45, occupation: "Manager", demographic: "Caucasian", outcome: "Approved" },
  { id: 5, name: "David K.", age: 22, occupation: "Student", demographic: "African American", outcome: "Denied" },
  { id: 6, name: "Anna C.", age: 38, occupation: "Nurse", demographic: "Asian", outcome: "Approved" },
  { id: 7, name: "James W.", age: 29, occupation: "Mechanic", demographic: "Caucasian", outcome: "Approved" },
  { id: 8, name: "Maria S.", age: 34, occupation: "Chef", demographic: "Hispanic", outcome: "Denied" },
  { id: 9, name: "Kevin B.", age: 41, occupation: "Accountant", demographic: "African American", outcome: "Approved" },
  { id: 10, name: "Rachel P.", age: 27, occupation: "Designer", demographic: "Caucasian", outcome: "Approved" },
  { id: 11, name: "Thomas L.", age: 50, occupation: "Driver", demographic: "Hispanic", outcome: "Denied" },
  { id: 12, name: "Jessica H.", age: 33, occupation: "Sales", demographic: "African American", outcome: "Denied" },
];

const CHARGES = [
  "Demographic Parity Violation",
  "Equal Opportunity Violation",
  "Disparate Impact Violation"
];

const MOCK_FALLBACK_MESSAGES = [
  "Your Honor, the prosecution calls the COMPAS model to the stand. We submit Exhibit A: The model exhibits severe demographic disparity.",
  "Objection, Your Honor. The model does not explicitly use 'Race' as a feature. It relies on objective metrics to maximize accuracy.",
  "The defense's argument regarding accuracy is noted. However, the evidence shows a violation.",
  "Furthermore, counterfactual testing shows that flipping the race decreases the risk score.",
  "We argue that altering this would drastically reduce the model's accuracy on the general population.",
  "Accuracy cannot come at the expense of protected classes.",
  "The Equal Opportunity metric shows African American defendants have a much higher false positive rate.",
  "This is a reflection of the base rates in the historical data, not the model's internal logic.",
  "This confirms a violation. I am ordering immediate mitigation."
];

type Message = {
  id: string;
  role: "PROSECUTION" | "DEFENSE" | "JUDGE";
  name: string;
  text: string;
  isThinking?: boolean;
};

export default function DemoPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<"Features" | "Fairness" | "Counterfactuals">("Fairness");
  const [juryState, setJuryState] = useState<number>(0);
  const [currentChargeIndex, setCurrentChargeIndex] = useState(0);
  const [trialComplete, setTrialComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Simulation Logic
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const streamText = async (res: Response, msgId: string) => {
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let fullText = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const groqContent = data.choices?.[0]?.delta?.content;
              const geminiContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
              const content = groqContent || geminiContent;
              
              if (content) {
                fullText += content;
                setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: fullText } : m));
              }
            } catch (e) {
              // Ignore partial JSON parsing errors
            }
          }
        }
      }
      return fullText;
    };

    const simulateStream = async (text: string, msgId: string) => {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isThinking: false } : m));
      const words = text.split(" ");
      let currentText = "";
      for (const word of words) {
        currentText += word + " ";
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: currentText } : m));
        await new Promise(r => setTimeout(r, 100)); // 100ms per word
      }
      return currentText;
    };

    const runSequence = async () => {
      for (let i = 0; i < 3; i++) {
        setCurrentChargeIndex(i);
        const metric = CHARGES[i];
        
        // --- PROSECUTION ---
        const prosId = `pros-${i}`;
        setMessages(prev => [...prev, { id: prosId, role: "PROSECUTION", name: "Llama 3", text: "", isThinking: true }]);
        let prosText = "";
        try {
          const res = await fetch("/api/agents/prosecution", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset: DEMO_DATASET.name, sensitiveAttributes: ["Race", "Gender", "Age"], metric })
          });
          if (!res.ok) throw new Error("API failed");
          setMessages(prev => prev.map(m => m.id === prosId ? { ...m, isThinking: false } : m));
          prosText = await streamText(res, prosId);
        } catch(e) {
          prosText = await simulateStream(MOCK_FALLBACK_MESSAGES[i * 3], prosId);
        }

        // --- DEFENSE ---
        const defId = `def-${i}`;
        setMessages(prev => [...prev, { id: defId, role: "DEFENSE", name: "Gemini Flash", text: "", isThinking: true }]);
        let defText = "";
        try {
          const res = await fetch("/api/agents/defense", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataset: DEMO_DATASET.name, sensitiveAttributes: ["Race", "Gender", "Age"], metric })
          });
          if (!res.ok) throw new Error("API failed");
          setMessages(prev => prev.map(m => m.id === defId ? { ...m, isThinking: false } : m));
          defText = await streamText(res, defId);
        } catch(e) {
          defText = await simulateStream(MOCK_FALLBACK_MESSAGES[i * 3 + 1], defId);
        }

        // --- JUDGE ---
        const judId = `jud-${i}`;
        setMessages(prev => [...prev, { id: judId, role: "JUDGE", name: "Gemini Pro", text: "", isThinking: true }]);
        try {
          const res = await fetch("/api/agents/judge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              dataset: DEMO_DATASET.name, 
              sensitiveAttributes: ["Race", "Gender", "Age"], 
              metric, 
              prosecutionArgument: prosText, 
              defenseArgument: defText 
            })
          });
          if (!res.ok) throw new Error("API failed");
          setMessages(prev => prev.map(m => m.id === judId ? { ...m, isThinking: false } : m));
          await streamText(res, judId);
        } catch(e) {
          await simulateStream(MOCK_FALLBACK_MESSAGES[i * 3 + 2], judId);
        }
        
        // Small pause between charges
        await new Promise(r => setTimeout(r, 2000));
      }
      
      setTrialComplete(true);
    };

    runSequence();
  }, []);

  useEffect(() => {
    const juryInterval = setInterval(() => {
      setJuryState(prev => (prev < 12 ? prev + 1 : prev));
    }, 4000);
    return () => clearInterval(juryInterval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAgentStyles = (role: string) => {
    switch (role) {
      case "PROSECUTION": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Scale };
      case "DEFENSE": return { color: "text-white", bg: "bg-white/5", border: "border-white/10", icon: Shield };
      case "JUDGE": return { color: "text-white", bg: "bg-white/10", border: "border-white/20", icon: Gavel };
      default: return { color: "text-white/60", bg: "transparent", border: "border-white/5", icon: User };
    }
  };

  return (
    <div className="relative h-screen w-full text-white flex flex-col overflow-hidden font-sans selection:bg-white/20 pt-16">
      
      {/* Video Background */}
      <div className="fixed inset-0 w-full h-full z-[-2]">
        <video autoPlay loop muted playsInline className="w-full h-full object-cover scale-105">
          <source src="/scales-video.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="fixed inset-0 bg-black/60 z-[-1]" />

      
      {/* Top Banner */}
      <div className="bg-white/5 border-b border-white/10 text-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 font-medium text-sm">
          <AlertTriangle className="w-5 h-5 text-white shrink-0" />
          <span className="hidden sm:inline"><strong>Demo Mode</strong> — COMPAS Recidivism Dataset — A real-world AI bias case from 2016</span>
          <span className="sm:hidden"><strong>Demo Mode</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/trial/demo/verdict" className={`text-sm font-semibold flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all duration-500 ${trialComplete ? "bg-white text-black animate-pulse ring-2 ring-white ring-offset-2 ring-offset-black scale-105 shadow-md" : "bg-white/10 hover:bg-white/20 text-white"}`}>
            <ExternalLink className="w-4 h-4" /> <span className="hidden md:inline">View Full Verdict</span>
          </Link>
          <Link href="/trial/upload" className="text-sm font-semibold flex items-center gap-2 bg-white text-black hover:bg-white/90 px-4 py-1.5 rounded-lg transition-colors shadow-sm">
            <PlayCircle className="w-4 h-4" /> <span className="hidden md:inline">Start Your Own Trial</span>
          </Link>
        </div>
      </div>

      {/* MAIN CONTENT (3 COLUMNS) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* LEFT PANEL: Case File */}
        <div className="w-[300px] border-r border-white/10 bg-black/40 backdrop-blur-2xl flex flex-col p-6 overflow-y-auto [&::-webkit-scrollbar]:hidden shrink-0 hidden lg:flex">
          <div className="flex items-center gap-2 mb-6">
            <FileText className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-lg">Case File</h2>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-xs text-white/50 font-bold uppercase mb-1">Dataset</p>
              <p className="font-medium">{DEMO_DATASET.name}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-white/70">
                <span>{DEMO_DATASET.rows} Rows</span>
                <span>{DEMO_DATASET.features} Features</span>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 font-bold uppercase mb-2">Sensitive Attributes</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded border border-red-500/20">Race</span>
                <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded border border-red-500/20">Gender</span>
                <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded border border-red-500/20">Age</span>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 font-bold uppercase mb-1">Model Profile</p>
              <p className="font-medium text-sm">{DEMO_DATASET.model}</p>
              <p className="text-sm text-green-400 font-medium mt-1">Accuracy: {DEMO_DATASET.accuracy}</p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <p className="text-xs text-white/50 font-bold uppercase mb-4">Demographic Breakdown</p>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={DEMO_DATASET.demographics}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {DEMO_DATASET.demographics.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {DEMO_DATASET.demographics.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span>{d.name}</span>
                    </div>
                    <span className="font-mono text-white/60">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Courtroom */}
        <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
          {/* Top Bar */}
          <div className="h-16 border-b border-white/10 flex items-center px-6 justify-between bg-black/40 backdrop-blur-2xl z-10 shrink-0">
            <div>
              <h1 className="font-bold text-lg tracking-tight flex items-center gap-2">
                Trial #COMPAS-Demo
                <span className="text-xs px-2 py-0.5 bg-red-500/20 text-white rounded-full font-bold uppercase">Live</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className={currentChargeIndex === 0 && !trialComplete ? "text-white font-bold" : "text-white/40 hidden sm:inline"}>Opening</span>
              <ChevronRight className="w-4 h-4 text-white/40 hidden sm:inline" />
              <span className={currentChargeIndex === 1 && !trialComplete ? "text-white font-bold" : "text-white/40 hidden sm:inline"}>Examination</span>
              <ChevronRight className="w-4 h-4 text-white/40 hidden sm:inline" />
              <span className={currentChargeIndex === 2 && !trialComplete ? "text-white font-bold" : "text-white/40 hidden sm:inline"}>Cross-Examination</span>
              <ChevronRight className="w-4 h-4 text-white/40 hidden sm:inline" />
              <span className={trialComplete ? "text-white font-bold" : "text-white/40 hidden sm:inline"}>Verdict</span>
            </div>
          </div>

          {/* Current Charge Banner */}
          <div className="bg-white/5 border-b border-white/10 px-6 py-4 flex items-center justify-between shrink-0 z-10 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-white" />
              <span className="font-semibold text-sm text-red-300">Charge #{currentChargeIndex + 1}: {CHARGES[currentChargeIndex]}</span>
            </div>
            {!trialComplete && <span className="text-xs font-mono text-white uppercase tracking-wider font-semibold animate-pulse hidden sm:inline">Under Review</span>}
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden p-8 space-y-6" ref={scrollRef}>
            <AnimatePresence>
              {messages.map((msg) => {
                const style = getAgentStyles(msg.role);
                const Icon = style.icon;
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="flex gap-4 max-w-3xl mx-auto"
                  >
                    <div className={`w-10 h-10 rounded-full ${style.bg} border ${style.border} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${style.color}`} />
                    </div>
                    <div className="flex-1 bg-black/40 backdrop-blur-2xl border border-white/5 p-6 rounded-2xl shadow-2xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold ${style.color}`}>{msg.role}</span>
                        <span className="text-xs text-white/50 font-mono border-l border-white/10 pl-2">{msg.name}</span>
                      </div>
                      
                      {msg.isThinking ? (
                        <div className="flex items-center gap-2 text-white/50 text-sm py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                        </div>
                      ) : (
                        <p className="text-[15px] leading-relaxed text-white/90 whitespace-pre-wrap">{msg.text}</p>
                      )}

                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {trialComplete && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center pt-8 pb-4">
                <Link href="/trial/demo/verdict" className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/90 transition-colors shadow-lg">
                  <Gavel className="w-5 h-5" /> View Verdict
                </Link>
              </motion.div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Evidence Board */}
        <div className="w-[380px] border-l border-white/10 bg-black/40 backdrop-blur-2xl flex flex-col shrink-0 hidden xl:flex">
          <div className="p-4 border-b border-white/10 bg-black/40 backdrop-blur-2xl">
            <h2 className="font-bold mb-4">Evidence Board</h2>
            <div className="flex gap-2 bg-black/40 backdrop-blur-2xl p-1 rounded-lg border border-white/10">
              {(["Fairness", "Features", "Counterfactuals"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                    activeTab === tab ? "bg-black/40 backdrop-blur-2xl shadow-sm text-white" : "text-white/60 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden p-4">
            {activeTab === "Fairness" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="p-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-semibold">Demographic Parity</h3>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-4xl font-light tracking-tight mb-1 text-white">0.62</div>
                  <p className="text-xs text-white/60">Severe violation (Threshold: &gt;0.80). African Americans are 38% less likely to receive a favorable outcome.</p>
                </div>
                
                <div className="p-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-semibold">Equal Opportunity</h3>
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-4xl font-light tracking-tight mb-1 text-white">0.75</div>
                  <p className="text-xs text-white/60">Moderate violation. True positive rates differ significantly across demographic groups.</p>
                </div>

                <div className="p-4 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-sm font-semibold">Disparate Impact</h3>
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="text-4xl font-light tracking-tight mb-1 text-white">0.58</div>
                  <p className="text-xs text-white/60">Severe violation. Structural bias detected in the underlying dataset distributions.</p>
                </div>
              </motion.div>
            )}

            {activeTab === "Features" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-[400px]">
                <h3 className="text-sm font-semibold mb-4">SHAP Feature Importance</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={SHAP_DATA} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff1a" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="feature" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#ffffff99" }} width={120} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ borderRadius: '8px', fontSize: '12px' }} />
                    <Bar dataKey="importance" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20}>
                      {
                        SHAP_DATA.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.feature.includes("Zipcode") ? "#EF4444" : "#3B82F6"} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {activeTab === "Counterfactuals" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {COUNTERFACTUALS.map(cf => (
                  <div key={cf.id} className="bg-black/40 backdrop-blur-2xl border border-white/10 p-3 rounded-lg text-sm">
                    <p className="text-xs font-mono text-blue-400 bg-blue-500/10 inline-block px-1 rounded mb-2">{cf.attr}</p>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white/60 line-through">{cf.original}</span>
                      <ArrowRight className="w-3 h-3 mx-2 text-white/40" />
                      <span className="font-semibold">{cf.flipped}</span>
                    </div>
                    <p className="text-xs text-white mt-2 bg-gold/10 px-2 py-1 rounded">{cf.change}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM PANEL: The Jury */}
      <div className="h-[180px] border-t border-white/10 bg-black/40 backdrop-blur-2xl shrink-0 p-4 overflow-hidden flex flex-col">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          Synthetic Jury <span className="text-xs font-normal text-white/50">Experiencing model decisions in real-time</span>
        </h3>
        <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar [&::-webkit-scrollbar]:hidden">
          {JURY_PERSONAS.map((persona, index) => {
            const isRevealed = index < juryState;
            const isApproved = persona.outcome === "Approved";
            return (
              <motion.div
                key={persona.id}
                layout
                className={`w-[240px] shrink-0 rounded-xl p-3 border transition-colors relative overflow-hidden group
                  ${isRevealed 
                    ? (isApproved ? 'bg-white/[0.03] border-white/10' : 'bg-white/[0.03] border-white/10') 
                    : 'bg-transparent border-white/10'}
                `}
              >
                <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                    ${isRevealed 
                      ? (isApproved ? 'bg-white/10 text-white' : 'bg-white/10 text-white') 
                      : 'bg-white/5 text-white/40'}
                  `}>
                    {persona.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="overflow-hidden">
                    <p className={`font-semibold text-sm truncate ${isRevealed ? 'text-white' : 'text-white/40'}`}>
                      {persona.name}
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      {persona.age} • {persona.occupation}
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      {persona.demographic}
                    </p>
                  </div>
                </div>
                
                {/* Reveal Overlay */}
                <AnimatePresence>
                  {!isRevealed && (
                    <motion.div 
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10"
                    >
                      <span className="text-xs font-bold text-white/40 uppercase tracking-widest animate-pulse">Pending</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Outcome Badge */}
                {isRevealed && (
                  <div className={`absolute top-3 right-3
                    ${isApproved ? 'text-green-400' : 'text-red-400'}
                  `}>
                    {isApproved ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {/* WHAT IS COMPAS? Collapsible Section */}
      <div className="bg-black/60 backdrop-blur-3xl border-t border-white/10 shrink-0">
        <details className="group px-6 py-4">
          <summary className="font-semibold text-sm cursor-pointer list-none flex items-center gap-2 text-white/80 hover:text-white">
            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
            What is COMPAS?
          </summary>
          <div className="pl-6 pt-2 text-sm text-white/70 max-w-4xl leading-relaxed">
            COMPAS is a risk assessment algorithm used by US courts to forecast which criminals are most likely to reoffend. In 2016, a ProPublica investigation revealed that the algorithm was systematically biased against African Americans, who were nearly twice as likely to be incorrectly labeled as higher risk compared to white defendants. This landmark real-world case highlighted the critical need for independent AI bias auditing in high-stakes socio-technical systems.
          </div>
        </details>
      </div>

    </div>
  );
}
