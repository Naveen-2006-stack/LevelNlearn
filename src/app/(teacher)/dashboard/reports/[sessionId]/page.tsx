"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Download, Target, Users, Trophy, Percent, ShieldAlert, XCircle } from "lucide-react";
import Link from "next/link";

type ViolationLog = { type: string; timestamp: string };
type Participant = {
  id: string; displayName: string; score: number;
  cheatFlags?: number; isBanned?: boolean; notes?: string;
  violationLogs?: ViolationLog[];
};
type StudentResponse = { questionId: string; participantId: string; isCorrect: boolean };
type Question = { id: string; questionText: string; orderIndex: number };
type LeaderboardRow = {
  participantId: string; rank: number; name: string; score: number;
  correctCount: number; totalQuestions: number; violationLogs: ViolationLog[]; isBanned: boolean;
};
type QuestionStat = {
  id: string; orderIndex: number; questionText: string;
  correctCount: number; incorrectCount: number; attempts: number;
  correctPct: number; incorrectPct: number;
};

const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const itemVariants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

function rankClass(rank: number) {
  if (rank === 1) return "text-amber-500";
  if (rank === 2) return "text-slate-500";
  if (rank === 3) return "text-orange-500";
  return "text-slate-400";
}

export default function SessionAnalyticsReportPage() {
  const params = useParams();
  const router = useRouter();
  const { data: authSession } = useSession();
  const sessionId = params.sessionId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedViolations, setSelectedViolations] = useState<{ name: string; logs: ViolationLog[] } | null>(null);

  useEffect(() => {
    if (!sessionId || !authSession?.user?.id) return;
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authSession]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${sessionId}?userId=${authSession?.user?.id}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Could not load this report.");
        setLoading(false);
        if (res.status === 403) router.replace("/dashboard");
        return;
      }
      const data = await res.json();
      setSessionInfo(data.session);
      setParticipants(data.participants || []);
      setResponses(data.responses || []);
      setQuestions(data.questions || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics report.");
    } finally {
      setLoading(false);
    }
  };

  const leaderboard = useMemo<LeaderboardRow[]>(() => {
    const correctByParticipant = new Map<string, number>();
    responses.forEach((r) => {
      if (r.isCorrect) correctByParticipant.set(r.participantId, (correctByParticipant.get(r.participantId) || 0) + 1);
    });
    return [...participants]
      .sort((a, b) => b.score - a.score)
      .map((p, index) => ({
        participantId: p.id,
        rank: index + 1,
        name: p.displayName || "Unknown",
        score: p.score || 0,
        correctCount: correctByParticipant.get(p.id) || 0,
        totalQuestions: questions.length,
        violationLogs: p.violationLogs || [],
        isBanned: p.isBanned || false,
      }));
  }, [participants, responses, questions.length]);

  const questionStats = useMemo<QuestionStat[]>(() => {
    const grouped = new Map<string, { correct: number; incorrect: number }>();
    responses.forEach((r) => {
      const cur = grouped.get(r.questionId) || { correct: 0, incorrect: 0 };
      if (r.isCorrect) cur.correct += 1; else cur.incorrect += 1;
      grouped.set(r.questionId, cur);
    });
    return questions.map((q) => {
      const stats = grouped.get(q.id) || { correct: 0, incorrect: 0 };
      const attempts = stats.correct + stats.incorrect;
      return {
        id: q.id, orderIndex: q.orderIndex, questionText: q.questionText,
        correctCount: stats.correct, incorrectCount: stats.incorrect, attempts,
        correctPct: attempts > 0 ? (stats.correct / attempts) * 100 : 0,
        incorrectPct: attempts > 0 ? (stats.incorrect / attempts) * 100 : 0,
      };
    });
  }, [questions, responses]);

  const averageScore = useMemo(() =>
    participants.length ? participants.reduce((a, p) => a + (p.score || 0), 0) / participants.length : 0
  , [participants]);

  const averageAccuracy = useMemo(() =>
    responses.length ? (responses.filter(r => r.isCorrect).length / responses.length) * 100 : 0
  , [responses]);

  const toughestQuestion = useMemo(() => {
    const attempted = questionStats.filter(q => q.attempts > 0);
    return attempted.length ? [...attempted].sort((a, b) => a.correctPct - b.correctPct)[0] : null;
  }, [questionStats]);

  const downloadCsv = () => {
    const header = ["Rank", "Student Name", "Final Score", "Questions Correct", "Violations"];
    const rows = leaderboard.map(row => [row.rank, row.name, row.score, `${row.correctCount} / ${row.totalQuestions}`, row.violationLogs.length]);
    const csv = [header, ...rows].map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `session-${sessionId}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
        <div className="h-10 w-72 rounded-xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-white border border-slate-200" />)}
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <h1 className="text-2xl font-bold text-rose-700">Report Error</h1>
        <p className="mt-2 text-rose-600">{error}</p>
        <Link href="/dashboard/reports" className="mt-5 inline-flex items-center gap-2 text-slate-600 hover:text-indigo-600">
          <ArrowLeft size={16} /> Back to Reports
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <motion.div className="mx-auto max-w-7xl space-y-8" variants={containerVariants} initial="hidden" animate="show">
        {/* Header */}
        <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard/reports" className="mb-2 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600">
              <ArrowLeft size={14} /> Back to Reports
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-slate-800">{sessionInfo?.quiz?.title || "Session Report"}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Played on {sessionInfo?.finishedAt ? new Date(sessionInfo.finishedAt).toLocaleString() : "N/A"}
            </p>
          </div>
        </motion.div>

        {/* Stats cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Participants", icon: <Users size={14} />, value: participants.length },
            { label: "Average Score",      icon: <Trophy size={14} />, value: averageScore.toFixed(1) },
            { label: "Avg Accuracy",       icon: <Percent size={14} />, value: `${averageAccuracy.toFixed(1)}%` },
            { label: "Toughest Question",  icon: <Target size={14} />, value: toughestQuestion ? `Q${toughestQuestion.orderIndex + 1}: ${toughestQuestion.questionText.slice(0, 40)}…` : "N/A" },
          ].map(card => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">{card.icon}{card.label}</div>
              <div className="mt-3 text-2xl font-black text-slate-800 truncate">{card.value}</div>
            </div>
          ))}
        </motion.div>

        {/* Leaderboard */}
        <motion.section variants={itemVariants} className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800">Leaderboard</h2>
            <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 transition-colors">
              <Download size={16} /> Download CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-3">Rank</th><th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Score</th><th className="px-3 py-3">Correct</th>
                  <th className="px-3 py-3">Violations</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(row => (
                  <tr key={row.participantId} className="border-b border-slate-100 last:border-b-0">
                    <td className={`px-3 py-3 font-black ${rankClass(row.rank)}`}>#{row.rank}</td>
                    <td className="px-3 py-3 text-slate-800">
                      {row.name}
                      {row.isBanned && <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">Banned</span>}
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{row.score.toLocaleString()}</td>
                    <td className="px-3 py-3 text-slate-500">{row.correctCount} / {row.totalQuestions}</td>
                    <td className="px-3 py-3">
                      {row.violationLogs.length > 0 ? (
                        <button onClick={() => setSelectedViolations({ name: row.name, logs: row.violationLogs })}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors">
                          <ShieldAlert size={12} /> {row.violationLogs.length}
                        </button>
                      ) : <span className="text-slate-400 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No leaderboard data available.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.section>

        {/* Question breakdown */}
        <motion.section variants={itemVariants} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-800">Question-by-Question Breakdown</h2>
          {questionStats.map((q, index) => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.04 }}
              className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Question {q.orderIndex + 1}</div>
              <div className="mb-4 font-semibold text-slate-800">{q.questionText}</div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200">
                <div className="flex h-full">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${q.correctPct}%` }} />
                  <div className="h-full bg-rose-500 transition-all"   style={{ width: `${q.incorrectPct}%` }} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span className="text-emerald-600 font-medium">{q.correctCount} Correct</span>
                <span className="text-rose-600 font-medium">{q.incorrectCount} Incorrect</span>
                <span className="text-slate-400">({q.attempts} attempts)</span>
              </div>
            </motion.div>
          ))}
          {questionStats.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">No question analytics available.</div>
          )}
        </motion.section>
      </motion.div>

      {/* Violations Modal */}
      <AnimatePresence>
        {selectedViolations && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-rose-100 overflow-hidden">
              <div className="bg-rose-50 px-6 py-4 border-b border-rose-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="text-rose-600" size={24} />
                  <h3 className="font-extrabold text-xl text-rose-900">Violations: {selectedViolations.name}</h3>
                </div>
                <button onClick={() => setSelectedViolations(null)} className="p-2 text-rose-400 hover:text-rose-600 rounded-full transition-colors">
                  <XCircle size={20} />
                </button>
              </div>
              <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                {selectedViolations.logs.map((v, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-rose-100 bg-white shadow-sm relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500" />
                    <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-black shrink-0">{i + 1}</div>
                    <div>
                      <h4 className="font-bold text-slate-800">{v.type}</h4>
                      <p className="text-xs text-slate-400 mt-1">{new Date(v.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
