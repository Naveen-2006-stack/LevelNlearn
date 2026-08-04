import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Play, Edit3, Trash2, Clock, Hash, Award, MonitorPlay } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { quizApi, sessionApi } from '../api/client';
import { ConfirmModal } from '../components/ConfirmModal';

interface Quiz {
  id: string;
  title: string;
  description: string;
  created_at: string;
  question_count?: number;
  _count?: { questions?: number };
}

interface ReportSession {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  join_code: string;
  quiz_title: string;
  participant_count?: number;
  top_score?: number;
  cheat_count?: number;
  participants?: Array<{ id: string; display_name: string; score: number; cheat_flags?: number }>;
}

interface ParticipantHistory {
  id: string;
  score: number;
  session_id: string;
  joined_at: string;
  quiz_title?: string;
  rank?: number;
}

const formatOrdinal = (n: number) => {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
};

const getRankPresentation = (rank?: number) => {
  if (!rank) return { label: 'Unranked', colorClass: 'text-slate-400 dark:text-slate-500' };
  if (rank === 1) return { label: '🥇 1st Place', colorClass: 'text-amber-400' };
  if (rank === 2) return { label: '🥈 2nd Place', colorClass: 'text-slate-300' };
  if (rank === 3) return { label: '🥉 3rd Place', colorClass: 'text-amber-700 dark:text-amber-600' };
  return { label: `${formatOrdinal(rank)} Place`, colorClass: 'text-slate-400' };
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<ParticipantHistory[]>([]);
  const [reportSessions, setReportSessions] = useState<ReportSession[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [activeTab, setActiveTab] = useState<'history' | 'hosted' | 'reports'>('history');
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  });

  const [startModal, setStartModal] = useState<{ isOpen: boolean; quizId: string | null; timedScoring: boolean }>({
    isOpen: false,
    quizId: null,
    timedScoring: true,
  });

  useEffect(() => {
    loadData();
    if (searchParams.get('error') === 'banned') {
      setConfirmModal({
        isOpen: true,
        title: 'You have been banned',
        message: 'The host has removed you from this session. You cannot rejoin this game.',
        action: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      });
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get('error') === 'terminated') {
      setConfirmModal({
        isOpen: true,
        title: 'Session Terminated',
        message: 'The host has ended this session early.',
        action: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      });
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadData = async () => {
    const deviceUuid = localStorage.getItem('kahoot_device_uuid');

    sessionApi.getHistory(deviceUuid).then((res) => {
      setHistory(res.data || []);
      setLoadingHistory(false);
    }).catch(() => setLoadingHistory(false));

    quizApi.list().then((res) => {
      setQuizzes(res.data || []);
      setLoadingQuizzes(false);
    }).catch(() => setLoadingQuizzes(false));

    sessionApi.getReports().then((res) => {
      setReportSessions(res.data || []);
      setLoadingReports(false);
    }).catch(() => setLoadingReports(false));
  };

  const createNewQuiz = async () => {
    try {
      const res = await quizApi.create();
      navigate(`/quiz/${res.data.id}/edit`);
    } catch (err) {
      console.error('Failed to create quiz:', err);
    }
  };

  const deleteQuiz = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Quiz',
      message: 'Are you sure you want to delete this quiz and all its questions? This cannot be undone.',
      action: async () => {
        try {
          await quizApi.remove(id);
          setQuizzes((prev) => prev.filter((q) => q.id !== id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err) {
          console.error('Failed to delete quiz:', err);
          alert('Failed to delete quiz');
        }
      }
    });
  };

  const startSession = async (mode: 'NORMAL' | 'UNANIMOUS') => {
    if (!startModal.quizId) return;
    setSessionStartError(null);
    try {
      const res = await sessionApi.create(startModal.quizId, mode, startModal.timedScoring);
      navigate(`/host/${res.data.id}`);
    } catch (err: any) {
      if (err?.code === 'ERR_NETWORK') {
        setSessionStartError('Cannot reach server. Start backend API and try again.');
      } else {
        setSessionStartError(err?.response?.data?.error || 'Failed to start live session.');
      }
      console.error('Failed to start session:', err);
    }
    setStartModal({ isOpen: false, quizId: null, timedScoring: true });
  };

  const greeting = user?.name ? `Hi, ${user.name.split(' ')[0]} 👋` : 'Your Dashboard';

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <AnimatePresence>
        {startModal.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 border border-slate-100 dark:border-white/10">
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Start Live Session</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-5">Configure how this session runs for students.</p>

              {/* Timed Scoring Toggle */}
              <div 
                onClick={() => setStartModal(prev => ({ ...prev, timedScoring: !prev.timedScoring }))}
                className={`mb-5 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  startModal.timedScoring 
                    ? 'border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/10' 
                    : 'border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`font-bold text-sm ${startModal.timedScoring ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>⏱ Timed Scoring</p>
                    <p className={`text-xs mt-0.5 ${startModal.timedScoring ? 'text-indigo-700/70 dark:text-indigo-400/70' : 'text-slate-500 dark:text-slate-400'}`}>
                      {startModal.timedScoring
                        ? 'Countdown timer shown — faster answers score higher.'
                        : 'No timer shown — participants can think and submit freely.'}
                    </p>
                  </div>
                  <button
                    id="timed-scoring-toggle"
                    className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-300 focus:outline-none shadow-inner ${
                      startModal.timedScoring ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    aria-pressed={startModal.timedScoring}
                    aria-label="Toggle timed scoring"
                  >
                    <motion.span
                      layout
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md ${
                        startModal.timedScoring ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    >
                      {startModal.timedScoring && <Clock size={12} className="text-indigo-600" />}
                    </motion.span>
                  </button>
                </div>
              </div>

              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">Game Mode</p>
              <div className="space-y-3">
                <button onClick={() => startSession('NORMAL')} className="w-full flex flex-col text-left p-4 rounded-2xl border-2 border-indigo-100 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 dark:border-indigo-500/20 dark:hover:border-indigo-500/50 dark:bg-indigo-500/5 transition-all">
                  <span className="font-bold text-lg text-indigo-900 dark:text-indigo-300">Classic Mode</span>
                  <span className="text-sm text-indigo-700/70 dark:text-indigo-400/70">Host manually controls when to advance to the next question.</span>
                </button>
                <button onClick={() => startSession('UNANIMOUS')} className="w-full flex flex-col text-left p-4 rounded-2xl border-2 border-emerald-100 hover:border-emerald-500 bg-emerald-50/50 hover:bg-emerald-50 dark:border-emerald-500/20 dark:hover:border-emerald-500/50 dark:bg-emerald-500/5 transition-all">
                  <span className="font-bold text-lg text-emerald-900 dark:text-emerald-300">Unanimous Mode</span>
                  <span className="text-sm text-emerald-700/70 dark:text-emerald-400/70">Game auto-advances when all connected students have answered.</span>
                </button>
              </div>
              <div className="mt-6">
                <button onClick={() => setStartModal({ isOpen: false, quizId: null, timedScoring: true })} className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-bold transition-all">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{greeting}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Everything in one place.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/join" className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 transition-all">
            <MonitorPlay size={18} /> Join Game
          </Link>
          <button onClick={createNewQuiz} className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-500/30 transition-all">
            <Plus size={18} /> Create Quiz
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl w-fit border border-slate-200/70 dark:border-slate-700/70">
        {(['history', 'hosted', 'reports'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'history' ? '🎮 Games Played' : tab === 'hosted' ? '📋 My Quizzes' : '📊 Reports'}
          </button>
        ))}
      </div>

      {sessionStartError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {sessionStartError}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
              <div className="text-5xl mb-4">🎯</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No games yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Join a quiz to see your history here.</p>
              <Link to="/join" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/30 transition-all">
                <MonitorPlay size={18} /> Join a Game
              </Link>
            </div>
          ) : (
            <AnimatePresence>
              {history.map((entry, idx) => {
                const rankView = getRankPresentation(entry.rank);
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-4 shadow-sm border border-slate-200/60 dark:border-white/5"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Award className="text-indigo-600 dark:text-indigo-400" size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{entry.quiz_title ?? 'Unknown Quiz'}</div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                        <Clock size={12} /> {new Date(entry.joined_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">{entry.score.toLocaleString()} pts</div>
                      <div className={`mt-1 text-sm font-semibold ${rankView.colorClass}`}>{rankView.label}</div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      )}

      {activeTab === 'hosted' && (
        <div className="space-y-4">
          <AnimatePresence>
            {loadingQuizzes
              ? [1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
                ))
              : quizzes.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
                    <div className="text-5xl mb-4">📝</div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No quizzes yet</h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-6">Create your first quiz and start hosting!</p>
                    <button onClick={createNewQuiz} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-lg shadow-indigo-500/30">
                      <Plus size={18} /> Create Quiz
                    </button>
                  </div>
                )
              : quizzes.map((quiz, idx) => (
                  <motion.div
                    key={quiz.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ delay: idx * 0.04 }}
                    className="group flex items-center gap-5 bg-white dark:bg-slate-800 rounded-2xl px-6 py-5 shadow-sm border border-slate-200/60 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg truncate">{quiz.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Hash size={11} /> {quiz.question_count ?? quiz._count?.questions ?? 0} questions</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {new Date(quiz.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link to={`/quiz/${quiz.id}/edit`} className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors">
                        <Edit3 size={18} />
                      </Link>
                      <button onClick={() => deleteQuiz(quiz.id)} className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <button
                      onClick={() => setStartModal({ isOpen: true, quizId: quiz.id, timedScoring: true })}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-all"
                    >
                      <Play size={16} /> Host Live
                    </button>
                  </motion.div>
                ))}
          </AnimatePresence>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-4">
          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/5 shadow-sm animate-pulse" />
              ))}
            </div>
          ) : reportSessions.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/10 shadow-sm">
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No reports yet</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">Run a live quiz to generate analytics and session reports.</p>
              <button onClick={() => setActiveTab('hosted')} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/30 transition-all">
                Back to My Quizzes
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {reportSessions.map((session, idx) => {
                const sortedPlayers = [...(session.participants || [])].sort((a, b) => b.score - a.score);
                const totalPlayers = session.participant_count ?? sortedPlayers.length;
                const totalCheats = session.cheat_count ?? sortedPlayers.reduce((sum, p) => sum + (p.cheat_flags || 0), 0);
                const topScore = session.top_score ?? sortedPlayers[0]?.score ?? 0;

                return (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-white dark:bg-slate-800 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 shadow-sm border border-slate-200/60 dark:border-white/5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg truncate">{session.quiz_title || 'Unknown Quiz'}</h3>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                          Played on {new Date(session.finished_at || session.started_at || Date.now()).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        to={`/dashboard/reports/${session.id}`}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 sm:py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20 whitespace-nowrap"
                      >
                        View Analytics
                      </Link>
                    </div>

                    <div className="mt-4 sm:mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Players</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{totalPlayers}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Top Score</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{topScore}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 p-3 sm:p-4">
                        <div className="text-xs font-semibold text-slate-500 truncate">Cheats</div>
                        <div className="mt-1 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{totalCheats}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
