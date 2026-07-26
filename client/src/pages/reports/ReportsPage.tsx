import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, Trophy, Users, ShieldAlert, Award, FileSpreadsheet, Trash2 } from 'lucide-react';
import { sessionApi } from '../../api/client';

export default function ReportsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sessionApi.getReports()
      .then((res) => setSessions(res.data))
      .catch((err) => console.error('Failed to fetch sessions:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleDownloadExcel = async (sessionId: string) => {
    try {
      const res = await sessionApi.getExcelReport(sessionId);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `session-${sessionId}-report.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      alert("Failed to download Excel report.");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to archive this session report? It will be hidden from reports but kept for audit history.')) return;
    try {
      await sessionApi.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Failed to delete session.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10 transition-colors">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Reports &amp; Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400">Review historical data and student performance from your live sessions.</p>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-white dark:bg-slate-800 rounded-3xl border border-gray-100 dark:border-white/5" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-slate-800 rounded-[2rem] border border-dashed border-gray-200 dark:border-white/10">
            <BarChart3 className="mx-auto w-16 h-16 text-indigo-200 dark:text-indigo-900 mb-4" />
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Reports Yet</h3>
            <p className="text-slate-500">Host your first live game to start generating analytics!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sessions.map((sess, idx) => {
              const sortedPlayers = [...(sess.participants || [])].sort((a: any, b: any) => b.score - a.score);
              const totalPlayers = sortedPlayers.length;
              const topScore = sortedPlayers[0]?.score || 0;
              const totalCheats = sortedPlayers.reduce((sum: number, p: any) => sum + (p.cheatFlags || p.cheat_flags || 0), 0);

              return (
                <motion.div
                  key={sess.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-gray-100 dark:border-white/10"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-gray-100 dark:border-white/10 pb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                        {sess.quiz?.title || sess.quizzes?.title || sess.quiz_title || 'Unknown Quiz'}
                      </h3>
                      <p className="text-sm font-medium text-slate-500">
                        {sess.status === 'ACTIVE' ? 'Live now' : 'Played on'}{' '}
                        {new Date(sess.finishedAt || sess.finished_at || sess.startedAt || sess.started_at || Date.now()).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <div className="font-mono text-sm tracking-widest text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 rounded-xl font-bold inline-block">
                        PIN: {sess.joinCode || sess.join_code}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleDownloadExcel(sess.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                          title="Download Excel Report"
                        >
                          <FileSpreadsheet size={14} /> Excel
                        </button>
                        <Link
                          to={`/dashboard/reports/${sess.id}`}
                          className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          View Full Analytics
                        </Link>
                        <button
                          onClick={() => handleDeleteSession(sess.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                          title="Archive Session Report"
                          aria-label="Archive session report"
                        >
                          <Trash2 size={14} /> Archive
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                    <div className="flex flex-col gap-2 p-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-100 dark:border-white/5">
                      <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-semibold">
                        <Users size={18} /> Players
                      </div>
                      <div className="text-3xl font-black text-slate-900 dark:text-white">{totalPlayers}</div>
                    </div>
                    <div className="flex flex-col gap-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20">
                      <div className="flex items-center gap-2 text-amber-600 font-semibold">
                        <Trophy size={18} /> Top Score
                      </div>
                      <div className="text-3xl font-black text-amber-500">{topScore}</div>
                    </div>
                    <div className="flex flex-col gap-2 p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20">
                      <div className="flex items-center gap-2 text-rose-600 font-semibold">
                        <ShieldAlert size={18} /> Cheat Flags
                      </div>
                      <div className="text-3xl font-black text-rose-500">{totalCheats}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <Award className="text-indigo-500" /> Leaderboard Map
                    </h4>
                    <div className="space-y-3">
                      {sortedPlayers.slice(0, 5).map((p: any, i: number) => (
                        <div
                          key={p.id}
                          className="flex justify-between items-center bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-white/5"
                        >
                          <div className="flex items-center gap-4">
                            <span className={`font-black text-xl w-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-300 dark:text-slate-600'}`}>
                              #{i + 1}
                            </span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {p.displayName || p.display_name}
                            </span>
                            {(p.cheatFlags || p.cheat_flags) > 0 && (
                              <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-md font-bold text-center">
                                FLAGGED ×{p.cheatFlags || p.cheat_flags}
                              </span>
                            )}
                          </div>
                          <span className="font-black text-indigo-600 dark:text-indigo-400">{p.score}</span>
                        </div>
                      ))}
                      {totalPlayers > 5 && (
                        <div className="text-center text-sm font-medium text-slate-500 pt-2">
                          + {totalPlayers - 5} more player(s) not shown
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
