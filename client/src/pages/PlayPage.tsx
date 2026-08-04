import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pusherClient } from '../lib/pusherClient';
import { clearPersistedLiveQuizSession, getPersistedLiveQuizSession, setPersistedLiveQuizSession } from '../lib/liveQuizSession';
import { sessionApi, pusherApi } from '../api/client';
import { useGameStore } from '../store/useGameStore';
import { useAuthStore } from '../store/authStore';
import { ActiveQuestionCard } from '../components/game/ActiveQuestionCard';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { normalizeSessionStatus } from '../lib/sessionStatus';
import { useAntiCheat } from '../antiCheat/useAntiCheat';

interface FloatingEmoji { id: string; emoji: string; studentName?: string; xOffset: number; }

export default function PlayPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedQuestionIndex, setRevealedQuestionIndex] = useState<number | null>(null);

  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);
  const resetGameState = useGameStore((s) => s.reset);

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState('Student');
  const [streak, setStreak] = useState(0);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
  const [serverTimeLimit, setServerTimeLimit] = useState<number | null>(null);
  const [timedScoring, setTimedScoring] = useState<boolean>(true);
  
  const authUser = useAuthStore((s) => s.user);
  const isGhostMode = authUser?.isGhost || false;

  // ── Part 2: Dedicated anti-cheat hook ─────────────────────────────────────
  useAntiCheat({
    sessionId,
    participantId,
    participantName,
    isActive: sessionStatus === 'active',
  });
  
  const [isTestMode] = useState(false);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const hasMarkedLeftRef = useRef(false);

  // Suppress unused variable warning
  void hasMarkedLeftRef;

  useEffect(() => {
    if (!sessionId || participantId) return;
    const persisted = getPersistedLiveQuizSession(sessionId);
    if (!persisted?.participantId) return;
    setParticipantId(persisted.participantId);
    if (persisted.nickname?.trim()) setParticipantName(persisted.nickname.trim());
  }, [participantId, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    channel.bind('session-update', (payload: any) => {
      const { status, current_question_index, questionStartedAt: qStartedAt, timeLimitSeconds, timedScoring: ts } = payload;
      setSessionInfo((prev: any) => (prev ? { ...prev, status, current_question_index } : prev));
      if (status) setSessionStatus(normalizeSessionStatus(status));
      if (typeof ts === 'boolean') setTimedScoring(ts);
      if (typeof current_question_index === 'number') {
        setCurrentQuestionIndex(current_question_index);
        setRevealedQuestionIndex(null);
        setLastAnswerCorrect(null);
        // ISSUE 5 FIX: Record precise question start time from server event
        setQuestionStartedAt(qStartedAt ? new Date(qStartedAt).getTime() : Date.now());
        if (typeof timeLimitSeconds === 'number') setServerTimeLimit(timeLimitSeconds);
      }
    });
    return () => {
      channel.unbind('session-update');
      pusherClient.unsubscribe(`session-${sessionId}`);
    };
  }, [sessionId, setCurrentQuestionIndex, setSessionStatus]);

  useEffect(() => {
    if (!sessionId || loading) return;
    const refreshSessionState = async () => {
      try {
        const uuid = localStorage.getItem('kahoot_device_uuid') || '';
        const res = await sessionApi.getPlayData(sessionId, uuid);
        const data = res.data;
        if (data?.participant) {
          const pData = data.participant;
          if ((pData.cheat_flags ?? pData.cheatFlags ?? 0) >= 10) {
            clearPersistedLiveQuizSession();
            pusherClient.unsubscribe(`session-${sessionId}`);
            navigate('/dashboard?error=banned');
            return;
          }
        }
        if (data?.liveSession) {
          setSessionInfo((prev: any) => (prev ? { ...prev, ...data.liveSession } : prev));
          if (data.liveSession.status) setSessionStatus(normalizeSessionStatus(data.liveSession.status));
          if (typeof data.liveSession.current_question_index === 'number') setCurrentQuestionIndex(data.liveSession.current_question_index);
        }
      } catch { /* silent */ }
    };
    void refreshSessionState();
    const interval = setInterval(() => void refreshSessionState(), 5000);
    return () => clearInterval(interval);
  }, [sessionId, loading, setCurrentQuestionIndex, setSessionStatus]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    channel.bind('emoji_reaction', (payload: any) => {
      const emoji = payload?.emoji;
      if (!emoji) return;
      const id = `${Date.now()}-${Math.random()}`;
      const xOffset = Math.floor(Math.random() * 260) - 130;
      setFloatingEmojis((prev) => [...prev, { id, emoji, studentName: payload?.studentName, xOffset }]);
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((item) => item.id !== id)), 2000);
    });
    return () => { channel.unbind('emoji_reaction'); };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !participantId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    channel.bind('reveal_answer', (payload: any) => {
      const idx = payload?.questionIndex;
      if (typeof idx === 'number') setRevealedQuestionIndex(idx);
    });
    channel.bind('kick_player', (payload: any) => {
      if (payload?.targetId === participantId) {
        clearPersistedLiveQuizSession();
        pusherClient.unsubscribe(`session-${sessionId}`);
        navigate('/dashboard?error=banned');
      }
    });
    channel.bind('terminate_session', () => {
      clearPersistedLiveQuizSession();
      pusherClient.unsubscribe(`session-${sessionId}`);
      navigate('/dashboard?error=terminated');
    });
    return () => {
      channel.unbind('reveal_answer');
      channel.unbind('kick_player');
      channel.unbind('terminate_session');
    };
  }, [sessionId, participantId, navigate]);

  useEffect(() => {
    setRevealedQuestionIndex(null);
    setLastAnswerCorrect(null);
  }, [currentQuestionIndex]);

  useEffect(() => {
    if (sessionStatus !== 'finished' || !sessionId) return;
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
    sessionApi.getLeaderboard(sessionId).then((res) => setLeaderboard(res.data || [])).catch(() => {});
  }, [sessionStatus, sessionId]);

  useEffect(() => {
    const initPlayRoom = async () => {
      // ISSUE 8 FIX: Reset store immediately to prevent stale currentQuestionIndex
      // from a previous session causing the waiting room to show an active question.
      resetGameState();

      const persistedSession = getPersistedLiveQuizSession(sessionId!);
      const uuid = localStorage.getItem('kahoot_device_uuid');
      if (!uuid && !persistedSession?.participantId) { navigate('/join'); return; }
      try {
        const res = await sessionApi.getPlayData(sessionId!, uuid || '');
        const data = res.data;
        setSessionInfo(data.liveSession);
        setSessionStatus(normalizeSessionStatus(data.liveSession.status));
        setCurrentQuestionIndex(data.liveSession.current_question_index ?? 0);
        setQuestions(data.liveSession.quiz.questions);
        if (typeof data.liveSession.timedScoring === 'boolean') setTimedScoring(data.liveSession.timedScoring);
        const pData = data.participant;
        setParticipantId(pData.id);
        setParticipantName(pData.display_name || pData.displayName || 'Student');
        setStreak(pData.streak || 0);
        setPersistedLiveQuizSession({ participantId: pData.id, sessionId: sessionId!, gamePin: persistedSession?.gamePin || '', nickname: pData.display_name || pData.displayName || 'Student' });
        if ((pData.cheat_flags ?? pData.cheatFlags ?? 0) >= 10) { navigate('/dashboard?error=banned'); return; }

        // ISSUE 10 FIX: Fetch authoritative participant/session state from server to handle reloads.
        try {
          const stateRes = await sessionApi.getState(sessionId!, pData.id);
          const state = stateRes.data;
          if (state?.participantStatus === 'SUBMITTED') {
            // Participant already submitted — navigate to results page.
            setPersistedLiveQuizSession({ participantId: pData.id, sessionId: sessionId!, gamePin: persistedSession?.gamePin || '', nickname: pData.display_name || pData.displayName || 'Student' });
            navigate(`/play/${sessionId}/results?participantId=${encodeURIComponent(pData.id)}`);
            return;
          }
          if (Array.isArray(state?.answeredQuestionIds) && state.answeredQuestionIds.length > 0) {
            setAnsweredQuestions(new Set<string>(state.answeredQuestionIds));
          }
          } catch (err) {
            // non-fatal: fallback to answered endpoint
          // fallback: try the older answered endpoint
          try {
            const answeredRes = await sessionApi.getAnsweredQuestions(sessionId!, pData.id);
            if (answeredRes.data?.questionIds?.length > 0) {
              setAnsweredQuestions(new Set<string>(answeredRes.data.questionIds));
            }
          } catch { /* non-critical */ }
        }
          // stop initialization here if we redirected
          // Use the freshly fetched participant id `pData.id` instead of
          // the React state `participantId` which is stale in this closure.
          if (!pData?.id) return;
      } catch {
        clearPersistedLiveQuizSession();
        navigate('/join');
        return;
      }
      setLoading(false);
    };
    void initPlayRoom();
  }, [navigate, sessionId, setCurrentQuestionIndex, setSessionStatus]);

  const handleAnswerSubmit = async (optionIndices: number[], reactionMs: number) => {
    if (!participantId || !questions.length) return;
    const q = questions[currentQuestionIndex];
    if (!q) return;
    const normalizedIndices = Array.from(new Set(optionIndices.filter((idx) => idx >= 0)));
    const selectedTexts = normalizedIndices
      .map((idx) => q.options[idx]?.text)
      .filter((text: string | undefined): text is string => !!text && text.trim().length > 0);

    try {
      const res = await sessionApi.submit(sessionId!, { participantId, questionId: q.id, reactionTimeMs: reactionMs, selectedTexts });
      const { isCorrect } = res.data;

      await pusherApi.trigger(`session-${sessionId}`, 'student-submission', { questionId: q.id });

      if (isCorrect) setStreak((s) => s + 1);
      else setStreak(0);

      setLastAnswerCorrect(isCorrect);
      setAnsweredQuestions((prev) => new Set(prev).add(q.id));
    } catch { /* silent */ }
  };

  const handleLeaveGame = async () => {
    if (!participantId || !sessionId) return;
    try {
      const reason = sessionStatus === 'active' ? 'Left session during active quiz' : 'Left session';
      await sessionApi.leave(sessionId, participantId, reason);
      clearPersistedLiveQuizSession();
      if (sessionStatus === 'active') { navigate('/dashboard?error=left-session'); return; }
      localStorage.removeItem('kahoot_device_uuid');
      navigate('/dashboard');
    } catch { navigate('/dashboard'); }
  };

  const sendEmojiReaction = async (emoji: string) => {
    if (reactionCooldown) return;
    setReactionCooldown(true);
    await pusherApi.trigger(`session-${sessionId}`, 'emoji_reaction', { emoji, studentName: participantName });
    setTimeout(() => setReactionCooldown(false), 500);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col p-3 md:p-8 pt-16 md:pt-24 select-none">
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        <AnimatePresence>
          {floatingEmojis.map((item) => (
            <motion.div
              key={item.id}
              initial={{ y: 50, opacity: 0, scale: 0.8 }}
              animate={{ y: -200, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 1.8, ease: 'easeOut' }}
              className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl"
              style={{ transform: `translateX(${item.xOffset}px)` }}
            >
              {item.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <header className="flex justify-between items-center mb-10 w-full relative h-10">
        <div className="flex-1 flex justify-start">
          {sessionStatus === 'waiting' && (
            <button onClick={handleLeaveGame} className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-rose-400 bg-slate-800/30 hover:bg-rose-500/10 px-4 py-2 rounded-full transition-colors border border-transparent hover:border-rose-500/30">
              <ArrowLeft size={16} /> Leave Game
            </button>
          )}
        </div>
        <h1 className="flex-1 text-xl font-bold text-slate-800 dark:text-white truncate text-center absolute left-1/2 -translate-x-1/2">
          {sessionInfo?.quiz?.title || sessionInfo?.quizzes?.title}
        </h1>
        <div className="flex-1 flex justify-end">
          <div className="px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            {sessionStatus}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        {sessionStatus === 'waiting' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="inline-flex items-center justify-center gap-2 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl mb-8">
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">GAME PIN:</span>
              <span className="font-mono text-2xl font-black tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                {sessionInfo?.join_code || '------'}
              </span>
            </div>
            <div className="text-6xl mb-6">🎮</div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">You're In, {participantName}!</h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">Your name is on the screen. Get ready!</p>
            <div className="mt-12 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} animate={{ y: [0, -12, 0] }} transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.22 }} className="w-4 h-4 bg-indigo-500 rounded-full" />
              ))}
            </div>
            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl z-40">
              {['🔥', '👏', '😂', '🚀'].map((emoji) => (
                <button key={emoji} type="button" onClick={() => void sendEmojiReaction(emoji)} disabled={reactionCooldown}
                  className="text-2xl hover:scale-125 transition-transform cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed" aria-label={`Send ${emoji} reaction`}>
                  <span className="pointer-events-none">{emoji}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {sessionStatus === 'active' && questions[currentQuestionIndex] && (
          <ActiveQuestionCard
            key={questions[currentQuestionIndex].id}
            questionId={questions[currentQuestionIndex].id}
            question={questions[currentQuestionIndex].question_text}
            imageUrl={questions[currentQuestionIndex].image_url || null}
            questionType={questions[currentQuestionIndex].question_type || 'mcq'}
            options={questions[currentQuestionIndex].options}
            timeLimit={
              questionStartedAt
                ? Math.max(0, Math.ceil((serverTimeLimit ?? questions[currentQuestionIndex].time_limit) - (Date.now() - questionStartedAt) / 1000))
                : (serverTimeLimit ?? questions[currentQuestionIndex].time_limit)
            }
            streak={streak}
            isRevealed={revealedQuestionIndex === currentQuestionIndex}
            wasAnswerCorrect={lastAnswerCorrect}
            onAnswer={handleAnswerSubmit}
            isGhostMode={isGhostMode}
            isAlreadyAnswered={answeredQuestions.has(questions[currentQuestionIndex].id)}
            isTestMode={isTestMode}
            timedScoring={timedScoring}
          />
        )}

        {sessionStatus === 'finished' && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-lg mx-auto">
            <div className="text-center mb-8">
              <div className="text-7xl mb-4">🏆</div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
                {isTestMode ? 'Quiz Completed!' : 'Game Over!'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                {isTestMode ? 'Your responses have been recorded.' : 'Final Standings'}
              </p>
            </div>

            {!isTestMode && (
              <div className="space-y-3 mb-8">
                {leaderboard.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const podiumColors = [
                    'bg-gradient-to-r from-amber-200 to-amber-400 border-amber-400 dark:from-amber-600/60 dark:to-amber-500/30 text-amber-900 dark:text-amber-100',
                    'bg-gradient-to-r from-slate-200 to-slate-400 border-slate-400 dark:from-slate-600/60 dark:to-slate-500/30 text-slate-800 dark:text-slate-100',
                    'bg-gradient-to-r from-orange-200 to-orange-400 border-orange-400 dark:from-orange-800/60 dark:to-orange-600/30 text-orange-950 dark:text-orange-100',
                  ];
                  return (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.1 }}
                      key={idx}
                      className={`flex items-center gap-4 px-5 py-3 rounded-2xl border ${isTop3 ? podiumColors[idx] : p.display_name === participantName ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30' : 'bg-white border-gray-100 dark:bg-slate-800 dark:border-white/5 shadow-sm'} ${isTop3 ? 'scale-[1.02] shadow-xl my-3 py-4 border-2' : ''}`}
                    >
                      <span className={`w-10 h-10 flex items-center justify-center rounded-xl font-black shrink-0 ${idx === 0 ? 'bg-amber-400 text-amber-900 text-xl shadow-inner' : idx === 1 ? 'bg-slate-300 text-slate-800 text-lg shadow-inner' : idx === 2 ? 'bg-orange-400 text-orange-900 text-lg shadow-inner' : 'bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                        #{idx + 1}
                      </span>
                      <span className={`flex-1 font-bold truncate ${isTop3 ? 'text-current text-lg' : 'text-slate-900 dark:text-white'}`}>
                        {p.display_name}
                        {p.display_name === participantName && <span className="ml-2 text-xs opacity-80 font-black uppercase">(You)</span>}
                      </span>
                      {p.streak > 0 && <span className="text-sm font-black text-rose-500 bg-rose-100 dark:bg-rose-500/20 px-2 py-1 rounded-lg">🔥 {p.streak}</span>}
                      <span className={`font-black tabular-nums text-xl ${isTop3 ? 'text-current' : 'text-indigo-600 dark:text-indigo-400'}`}>{p.score.toLocaleString()}</span>
                    </motion.div>
                  );
                })}
                {leaderboard.length === 0 && <div className="text-center py-6 text-slate-400 animate-pulse">Loading results…</div>}
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-600/30 transition-all"
            >
              <LayoutDashboard size={22} /> Back to Dashboard
            </button>
          </motion.div>
        )}
      </main>


    </div>
  );
}
