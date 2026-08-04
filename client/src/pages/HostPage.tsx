import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { pusherClient } from '../lib/pusherClient';
import { useLiveSession } from '../hooks/useLiveSession';
import { useGameStore } from '../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Play, Copy, Check, ArrowLeft, CheckSquare, LayoutDashboard, ShieldAlert, XCircle, Trash2, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn, copyToClipboard } from '../lib/utils';
import { sessionApi } from '../api/client';
import { normalizeSessionStatus } from '../lib/sessionStatus';

interface LiveSession { id: string; join_code: string; quiz_id: string; status: string; mode?: 'NORMAL' | 'UNANIMOUS'; timedScoring?: boolean; quizzes?: { title: string; questions: { id: string }[] }; }
interface ViolationEntry { id: string | number; participant_id: string; violation_type: string; created_at: string; source: 'live' | 'db'; }
interface FloatingEmoji { id: string; emoji: string; studentName?: string; xOffset: number; }

export default function HostPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const baseUrl = (() => {
    if (typeof window === 'undefined') return 'http://localhost:5173';
    const origin = window.location.origin.replace(/\/$/, '');
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) return origin;
    try {
      const apiHost = new URL(import.meta.env.VITE_API_URL || '').hostname;
      return apiHost && apiHost !== 'localhost' ? `${window.location.protocol}//${apiHost}:${window.location.port || '5173'}` : origin;
    } catch {
      return origin;
    }
  })();

  const [sessionInfo, setSessionInfo] = useState<LiveSession | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [advancingQuestion, setAdvancingQuestion] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const [isAnswersHidden, setIsAnswersHidden] = useState(true);
  const [liveViolations, setLiveViolations] = useState<ViolationEntry[]>([]);
  const [selectedViolationsParticipant, setSelectedViolationsParticipant] = useState<{ id: string; name: string } | null>(null);
  const [violationsHistory, setViolationsHistory] = useState<ViolationEntry[]>([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [violationLogsByParticipant, setViolationLogsByParticipant] = useState<Record<string, ViolationEntry[]>>({});
  const [submissionCount, setSubmissionCount] = useState(0);
  const [confirmKickParticipant, setConfirmKickParticipant] = useState<{ id: string; name: string } | null>(null);
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [autoAdvanceArmed, setAutoAdvanceArmed] = useState(false);

  const latestSessionStatusRef = useRef<string>('waiting');
  const hasAutoCompletedRef = useRef(false);
  const inactivityViolationRef = useRef<Record<string, number>>({});
  const hasAutoRedirectedToReportRef = useRef(false);

  const participantsMap = useGameStore((s) => s.participants);
  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setParticipants = useGameStore((s) => s.setParticipants);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);
  const incrementCheatFlag = useGameStore((s) => s.incrementCheatFlag);
  const removeParticipant = useGameStore((s) => s.removeParticipant);
  const resetGameState = useGameStore((s) => s.reset);

  useLiveSession(sessionId!, 'teacher');

  const participantsList = Object.values(participantsMap).filter((p: any) => !p.is_banned);
  const totalPlayers = participantsList.length;

  useEffect(() => {
    // Prevent stale status from previous sessions from triggering accidental redirects.
    resetGameState();
    setSessionHydrated(false);
    hasAutoCompletedRef.current = false;
    hasAutoRedirectedToReportRef.current = false;
  }, [sessionId, resetGameState]);

  useEffect(() => { latestSessionStatusRef.current = sessionStatus; }, [sessionStatus]);

  useEffect(() => {
    if (!sessionId) return;
    const completeSessionIfOpen = () => {
      if (hasAutoCompletedRef.current) return;
      const status = latestSessionStatusRef.current;
      if (status !== 'active' && status !== 'waiting') return;
      hasAutoCompletedRef.current = true;
      sessionApi.finish(sessionId).catch(() => {});
    };
    window.addEventListener('beforeunload', completeSessionIfOpen);
    return () => { window.removeEventListener('beforeunload', completeSessionIfOpen); };
  }, [sessionId]);

  useEffect(() => { fetchSession(); }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    channel.bind('anti_cheat_violation', (payload: any) => {
      const studentId = payload?.studentId;
      const violationType = payload?.violationType;
      if (!studentId || !violationType) return;
      incrementCheatFlag(studentId);
      const entry: ViolationEntry = { id: Date.now() + Math.random(), participant_id: studentId, violation_type: violationType, created_at: payload?.timestamp || new Date().toISOString(), source: 'live' };
      setLiveViolations((prev) => [entry, ...prev]);
      setViolationLogsByParticipant((prev) => ({ ...prev, [studentId]: [entry, ...(prev[studentId] || [])] }));
    });
    channel.bind('emoji_reaction', (payload: any) => {
      const emoji = payload?.emoji;
      if (!emoji) return;
      const id = `${Date.now()}-${Math.random()}`;
      const xOffset = Math.floor(Math.random() * 260) - 130;
      setFloatingEmojis((prev) => [...prev, { id, emoji, studentName: payload?.studentName, xOffset }]);
      setTimeout(() => setFloatingEmojis((prev) => prev.filter((item) => item.id !== id)), 2000);
    });
    return () => { channel.unbind('anti_cheat_violation'); channel.unbind('emoji_reaction'); };
  }, [sessionId, incrementCheatFlag]);

  useEffect(() => { setSubmissionCount(0); setIsAnswersHidden(true); }, [currentQuestionIndex]);

  useEffect(() => {
    const isUnanimous = sessionInfo?.mode === 'UNANIMOUS';
    if (!isUnanimous || sessionStatus !== 'active' || totalPlayers === 0) {
      setAutoAdvanceArmed(false);
      return;
    }
    setAutoAdvanceArmed(submissionCount >= totalPlayers);
  }, [sessionInfo?.mode, sessionStatus, submissionCount, totalPlayers]);

  useEffect(() => {
    if (!sessionId || !questions[currentQuestionIndex]) return;
    const qId = questions[currentQuestionIndex]?.id;
    if (!qId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    channel.bind('student-submission', (payload: any) => { if (payload.questionId === qId) setSubmissionCount((c) => c + 1); });
    return () => { channel.unbind('student-submission'); };
  }, [sessionId, questions, currentQuestionIndex]);

  useEffect(() => {
    if (!sessionId || sessionStatus !== 'active' || !questions[currentQuestionIndex]) return;
    const qId = questions[currentQuestionIndex]?.id;
    if (!qId) return;
    const refresh = async () => {
      try {
        const res = await sessionApi.getSubmissionCount(sessionId, qId);
        setSubmissionCount(res.data.count ?? 0);
      } catch { /* silent */ }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 2000);
    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, questions, currentQuestionIndex]);

  useEffect(() => {
    if (!sessionId || (sessionStatus !== 'waiting' && sessionStatus !== 'active')) return;
    const refreshParticipants = async () => {
      try {
        const res = await sessionApi.getById(sessionId);
        const data = res.data;
        const normalizedParticipants = (data.participants || []).map((p: any) => ({
          id: p.id,
          session_id: p.session_id ?? p.sessionId,
          device_uuid: p.device_uuid ?? p.deviceUuid,
          display_name: p.display_name ?? p.displayName,
          regNo: p.regNo,
          score: p.score ?? 0,
          streak: p.streak ?? 0,
          cheat_flags: p.cheat_flags ?? p.cheatFlags ?? 0,
          last_active: p.last_active ?? p.lastActive,
          joined_at: p.joined_at ?? p.joinedAt,
          is_banned: (p.cheat_flags ?? p.cheatFlags ?? 0) >= 10,
        }));
        setParticipants(normalizedParticipants as any);
      } catch { /* silent */ }
    };
    void refreshParticipants();
    const interval = setInterval(() => void refreshParticipants(), 2500);
    return () => clearInterval(interval);
  }, [sessionId, sessionStatus, setParticipants]);

  useEffect(() => {
    if (!sessionHydrated || sessionStatus !== 'finished' || !sessionId) { hasAutoRedirectedToReportRef.current = false; return; }
    if (hasAutoRedirectedToReportRef.current) return;
    hasAutoRedirectedToReportRef.current = true;
    const timer = setTimeout(() => navigate(`/dashboard/reports/${sessionId}`), 700);
    return () => clearTimeout(timer);
  }, [sessionHydrated, sessionStatus, sessionId, navigate]);

  useEffect(() => {
    if (sessionStatus !== 'active' || !sessionId) return;
    const now = Date.now();
    const staleThresholdMs = 15000;
    const duplicateCooldownMs = 30000;
    Object.values(participantsMap).filter((p: any) => !p.is_banned).forEach((p: any) => {
      if (!p?.id || !p?.last_active) return;
      const lastActiveMs = new Date(p.last_active).getTime();
      if (!Number.isFinite(lastActiveMs)) return;
      if (now - lastActiveMs <= staleThresholdMs) return;
      const lastFlaggedAt = inactivityViolationRef.current[p.id] ?? 0;
      if (now - lastFlaggedAt < duplicateCooldownMs) return;
      inactivityViolationRef.current[p.id] = now;
      const violationType = 'App Backgrounded / Inactive';
      incrementCheatFlag(p.id);
      const entry: ViolationEntry = { id: Date.now() + Math.random(), participant_id: p.id, violation_type: violationType, created_at: new Date().toISOString(), source: 'live' };
      setLiveViolations((prev) => [entry, ...prev]);
      setViolationLogsByParticipant((prev) => ({ ...prev, [p.id]: [entry, ...(prev[p.id] || [])] }));
    });
  }, [Object.values(participantsMap).length, sessionStatus, sessionId, incrementCheatFlag]);

  const fetchSession = async () => {
    try {
      const res = await sessionApi.getById(sessionId!);
      const data = res.data;
      const normalizedQuestions = (data.quiz?.questions || []).map((q: any) => ({
        id: q.id,
        question_text: q.question_text ?? q.questionText,
        question_type: q.question_type ?? q.questionType ?? 'mcq',
        options: q.options || [],
        time_limit: q.time_limit ?? q.timeLimit ?? 20,
        base_points: q.base_points ?? q.basePoints ?? 100,
        order_index: q.order_index ?? q.orderIndex ?? 0,
        image_url: q.image_url ?? q.imageUrl ?? null,
      }));

      const normalizedParticipants = (data.participants || []).map((p: any) => ({
        id: p.id,
        session_id: p.session_id ?? p.sessionId,
        device_uuid: p.device_uuid ?? p.deviceUuid,
        display_name: p.display_name ?? p.displayName,
        regNo: p.regNo,
        score: p.score ?? 0,
        streak: p.streak ?? 0,
        cheat_flags: p.cheat_flags ?? p.cheatFlags ?? 0,
        last_active: p.last_active ?? p.lastActive,
        joined_at: p.joined_at ?? p.joinedAt,
        is_banned: (p.cheat_flags ?? p.cheatFlags ?? 0) >= 10,
      }));

      setSessionInfo({
        id: data.id,
        join_code: data.join_code ?? data.joinCode,
        quiz_id: data.quiz_id ?? data.quizId,
        status: data.status,
        mode: data.mode ?? 'NORMAL',
        timedScoring: data.timedScoring !== false,
        quizzes: {
          title: data.quiz?.title,
          questions: normalizedQuestions.map((q: any) => ({ id: q.id })),
        },
      });
      setQuestions(normalizedQuestions);
      setSessionStatus(normalizeSessionStatus(data.status));
      setCurrentQuestionIndex(data.current_question_index ?? data.currentQuestionIndex ?? 0);
      setParticipants(normalizedParticipants as any);
      setViolationLogsByParticipant({});
      setSessionHydrated(true);
    } catch (err: any) {
      setSessionHydrated(false);
      if (err?.code === 'ERR_NETWORK') {
        setStartError('Cannot reach server. Start backend API and reload this page.');
      }
      console.error(err);
    }
  };

  const copyPin = async () => {
    if (!sessionInfo?.join_code) return;
    const success = await copyToClipboard(sessionInfo.join_code);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      alert('Failed to copy to clipboard.');
    }
  };

  const copyLink = async () => {
    const success = await copyToClipboard(joinUrl);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } else {
      alert('Failed to copy to clipboard.');
    }
  };

  const downloadQRImage = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `levelnlearn-${sessionInfo?.quizzes?.title || 'quiz'}-${sessionInfo?.join_code}.png`;
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const downloadQRSVG = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `levelnlearn-${sessionInfo?.quizzes?.title || 'quiz'}-${sessionInfo?.join_code}.svg`;
    downloadLink.click();
  };

  const startGame = async () => {
    if (startingGame) return;
    setStartingGame(true);
    setStartError(null);
    try {
      await sessionApi.start(sessionId!);
      setSessionStatus('active');
    } catch (err: any) {
      setStartError(err?.response?.data?.error || 'Failed to start. Please try again.');
    } finally { setStartingGame(false); }
  };

  const nextQuestion = async () => {
    if (!questions.length || advancingQuestion) return;
    setAdvancingQuestion(true);
    const isLast = currentQuestionIndex >= questions.length - 1;
    try {
      await sessionApi.next(sessionId!, currentQuestionIndex + 1, isLast);
      if (isLast) { setSessionStatus('finished'); return; }
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSessionStatus('active');
    } catch (err) { console.error('Failed to advance question:', err); }
    finally { setAdvancingQuestion(false); }
  };

  const terminateQuiz = async () => {
    if (!sessionId) return;
    try {
      await sessionApi.finish(sessionId);
      setSessionStatus('finished');
      setConfirmTerminate(false);
    } catch (err: any) { console.error('Failed to terminate quiz:', err.message); }
  };

  const kickParticipant = async (pId: string) => {
    if (!sessionId) return;
    try {
      await sessionApi.kick(sessionId, pId);
      removeParticipant(pId);
      setSelectedViolationsParticipant(null);
      setConfirmKickParticipant(null);
    } catch (err: any) { console.error('Failed to kick participant:', err.message); }
  };

  const handleOpenViolations = async (pId: string, pName: string) => {
    setSelectedViolationsParticipant({ id: pId, name: pName });
    setLoadingViolations(true);
    setViolationsHistory([]);
    try {
      // Fetch persisted report which now includes violationLogs per participant
      const res = await sessionApi.getReport(sessionId!);
      const rpt = res.data;
      const persisted = (rpt.participants || []).find((pp: any) => pp.id === pId)?.violationLogs || [];
      // Normalize persisted entries to ViolationEntry shape and merge with live violations
      const persistedEntries: ViolationEntry[] = (persisted as any[]).map((v: any, i: number) => ({
        id: v.id || `db-${i}`, participant_id: pId, violation_type: v.type || v.violationType || 'violation', created_at: v.timestamp || v.createdAt || new Date().toISOString(), source: 'db',
      }));
      const liveForStudent = (liveViolations.filter((v) => v.participant_id === pId) || []);
      // Merge: persisted first (older), then live recent ones, avoiding exact timestamp duplicates
      const seen = new Set<string>();
      const merged = [...persistedEntries, ...liveForStudent].filter((e) => {
        const key = `${e.violation_type}|${e.created_at}`;
        if (seen.has(key)) return false; seen.add(key); return true;
      });
      setViolationsHistory(merged);
    } catch (err) {
      // fallback to in-memory live violations
      const liveForStudent = (liveViolations.filter((v) => v.participant_id === pId) || []);
      setViolationsHistory(liveForStudent);
    } finally {
      setLoadingViolations(false);
    }
  };

  const joinCode = sessionInfo?.join_code || '------';
  const joinUrl = `${baseUrl}/join?code=${encodeURIComponent(sessionInfo?.join_code || '')}`;
  const isJoinUrlLocalOnly = /localhost|127\.0\.0\.1/i.test(joinUrl);

  const renderModals = () => (
    <>
      <AnimatePresence>
        {confirmKickParticipant && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4"><XCircle size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Ban Student?</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">Are you sure you want to ban <strong className="text-slate-800 dark:text-slate-200">{confirmKickParticipant.name}</strong>?</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setConfirmKickParticipant(null)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={() => kickParticipant(confirmKickParticipant.id)} className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30">Yes, Ban</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {confirmTerminate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden p-6 text-center">
              <div className="mx-auto w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4"><Trash2 size={32} /></div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Terminate Quiz?</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6 font-medium">This will instantly end the session for all participants.</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setConfirmTerminate(false)} className="flex-1 px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">Cancel</button>
                <button onClick={terminateQuiz} className="flex-1 px-4 py-3 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-500/30">Terminate</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (sessionStatus === 'active' || sessionStatus === 'finished') {
    const sortedParticipants = [...participantsList].sort((a, b) => b.score - a.score);
    const activeQ = questions[currentQuestionIndex];
    const isUnanimousMode = sessionInfo?.mode === 'UNANIMOUS';
    const activeQuestionType = (activeQ?.question_type || 'mcq') as 'mcq' | 'true_false' | 'multi_select';
    const typeMeta = activeQuestionType === 'true_false'
      ? { label: 'True / False', className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30', hint: 'Single-answer question' }
      : activeQuestionType === 'multi_select'
        ? { label: 'Multiple Answer', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30', hint: 'Participants must choose all correct answers' }
        : { label: 'Multiple Choice', className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30', hint: 'Single-answer question' };

    return (
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <AnimatePresence>
            {floatingEmojis.map((item) => (
              <motion.div key={item.id} initial={{ y: 50, opacity: 0, scale: 0.8 }} animate={{ y: -200, opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 1.8, ease: 'easeOut' }} className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl" style={{ transform: `translateX(${item.xOffset}px)` }}>
                {item.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {sessionStatus === 'active' && activeQ && (
          <div className="mb-10 bg-white dark:bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-indigo-50 dark:border-white/5">
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
              <span className="px-4 py-2 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 font-bold rounded-xl text-sm tracking-widest uppercase">
                Question {currentQuestionIndex + 1} of {questions.length}
              </span>
              <span className={cn('px-4 py-2 rounded-xl text-sm font-bold border', typeMeta.className)}>{typeMeta.label}</span>
              <span className={cn('px-4 py-2 rounded-xl text-sm font-bold border', isUnanimousMode ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600')}>
                {isUnanimousMode ? 'UNANIMOUS MODE' : 'NORMAL MODE'}
              </span>
              <span className={cn('px-4 py-2 rounded-xl text-sm font-bold border', sessionInfo?.timedScoring !== false ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/30' : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/60 dark:text-slate-400 dark:border-slate-600')}>
                {sessionInfo?.timedScoring !== false ? '⏱ Timed Scoring' : '📝 No Timer'}
              </span>
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl text-sm border border-indigo-200 dark:border-indigo-500/30">
                <span className="text-indigo-500/70">PIN:</span><span className="tracking-[0.1em]">{sessionInfo?.join_code}</span>
              </div>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                <CheckSquare size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span className="font-black text-emerald-700 dark:text-emerald-400 text-lg tabular-nums">{submissionCount}<span className="font-semibold text-emerald-500"> / {totalPlayers}</span></span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-500">submitted</span>
              </div>
              <button onClick={() => setConfirmTerminate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 transition-colors font-bold text-sm">
                <Trash2 size={16} /> Terminate Quiz
              </button>
              <span className="text-slate-500 font-medium font-mono">{activeQ.time_limit}s</span>
            </div>

            <div className="flex justify-between items-start gap-4 mb-8">
              <div className="flex-1">
                <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">{activeQ.question_text}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">{typeMeta.hint}</p>
              </div>
              <button onClick={() => setIsAnswersHidden(!isAnswersHidden)} className={cn('flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all whitespace-nowrap', isAnswersHidden ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' : 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30')}>
                {isAnswersHidden ? <EyeOff size={18} /> : <Eye size={18} />}
                {isAnswersHidden ? 'Answers Hidden' : 'Answers Visible'}
              </button>
            </div>

            {activeQ.image_url && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <img src={activeQ.image_url} alt="Question visual" className="w-full max-h-96 object-contain" loading="lazy" />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeQ.options.map((opt: any, idx: number) => (
                <div key={idx} className={cn('p-5 text-lg font-semibold rounded-2xl border-2 transition-all', !isAnswersHidden && opt.is_correct ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-gray-50 border-transparent dark:bg-slate-900 dark:text-slate-300')}>
                  {opt.text}
                </div>
              ))}
            </div>

            <div className="mt-8 flex justify-end gap-3 items-center">
              {isUnanimousMode && totalPlayers > 0 && (
                <div className="min-w-[260px] max-w-[360px] w-full mr-auto">
                  <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                    <span>{autoAdvanceArmed ? 'All answers received' : 'Waiting for everyone'}</span>
                    <span>{submissionCount}/{totalPlayers}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <motion.div
                      className={cn('h-full', autoAdvanceArmed ? 'bg-emerald-500' : 'bg-indigo-500')}
                      initial={false}
                      animate={{ width: `${Math.min(100, Math.round((submissionCount / Math.max(totalPlayers, 1)) * 100))}%` }}
                      transition={{ type: 'spring', stiffness: 130, damping: 20 }}
                    />
                  </div>
                </div>
              )}
              {submissionCount > 0 && submissionCount < totalPlayers && <span className="text-sm text-slate-400 dark:text-slate-500">Waiting for {totalPlayers - submissionCount} more…</span>}
              {submissionCount >= totalPlayers && totalPlayers > 0 && <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Everyone's in! ✅</span>}
              <motion.button onClick={nextQuestion} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} disabled={advancingQuestion || autoAdvanceArmed} className="bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-60 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-xl">
                {advancingQuestion ? 'Revealing…' : autoAdvanceArmed ? 'Auto-Advancing…' : currentQuestionIndex >= questions.length - 1 ? 'End Game' : 'Next Question →'}
              </motion.button>
            </div>
          </div>
        )}

        {sessionStatus === 'finished' && (
          <div className="text-center mb-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-5xl font-black text-slate-900 dark:text-white mb-3">Final Standings</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">The game has concluded. Great job everyone!</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => navigate(`/dashboard/reports/${sessionId}`)} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-600/20 transition-all">View Full Report</button>
              <button onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-600/20 transition-all"><LayoutDashboard size={20} /> Back to Dashboard</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 max-w-4xl mx-auto">
          <AnimatePresence>
            {sortedParticipants.map((p, idx) => {
              const violationCount = Math.max(violationLogsByParticipant[p.id]?.length || 0, p.cheat_flags || 0);
              return (
                <motion.div key={p.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', delay: idx * 0.04 }} className="group flex items-center gap-6 bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                  <div className={cn('w-10 h-10 flex items-center justify-center rounded-xl text-lg font-black', idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-white' : idx === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400')}>#{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                      {p.regNo ? `${p.regNo} - ${p.display_name}` : p.display_name}
                    </h3>
                    {p.streak > 0 && <div className="text-xs font-semibold text-amber-500 mt-0.5">🔥 {p.streak} streak</div>}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 min-w-[64px]">
                    <button
                      onClick={() => handleOpenViolations(p.id, p.display_name || 'Unknown')}
                      className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition-colors', violationCount > 0 ? (violationCount >= 3 ? 'bg-rose-600 text-white hover:bg-rose-700' : violationCount >= 2 ? 'bg-orange-500 text-white hover:bg-orange-600' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400') : 'bg-slate-100 text-slate-400 dark:bg-slate-700/50 cursor-default')}
                      disabled={violationCount === 0}
                    >
                      <ShieldAlert size={12} />{violationCount}
                    </button>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">violations</span>
                  </div>
                  <div className="text-3xl font-black tabular-nums text-indigo-600 dark:text-indigo-400 min-w-[80px] text-right">{p.score.toLocaleString()}</div>
                  {sessionStatus === 'active' && (
                    <button onClick={() => setConfirmKickParticipant({ id: p.id, name: p.display_name })} aria-label={`Ban ${p.display_name}`} className="ml-2 p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Ban Student">
                      <Trash2 size={20} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {selectedViolationsParticipant && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-100 dark:border-rose-500/20 overflow-hidden">
                <div className="bg-rose-50 dark:bg-rose-500/10 px-6 py-4 border-b border-rose-100 dark:border-rose-500/20 flex justify-between items-center">
                  <div className="flex items-center gap-3"><ShieldAlert className="text-rose-600 dark:text-rose-400" size={24} /><h3 className="font-extrabold text-xl text-rose-900 dark:text-rose-300">Violations History</h3></div>
                  <button onClick={() => setSelectedViolationsParticipant(null)} aria-label="Close violations history" className="p-2 text-rose-400 hover:text-rose-600 bg-rose-100/50 hover:bg-rose-200/50 dark:bg-rose-500/20 rounded-full transition-colors"><XCircle size={20} /></button>
                </div>
                <div className="p-6">
                  <p className="font-medium text-slate-700 dark:text-slate-300 mb-6">Showing recorded strikes for <strong className="text-slate-900 dark:text-white">{selectedViolationsParticipant.name}</strong></p>
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {loadingViolations ? (
                      <div className="flex justify-center p-8"><div className="w-8 h-8 rounded-full border-4 border-dashed border-rose-300 animate-spin" /></div>
                    ) : violationsHistory.length === 0 ? (
                      <div className="text-center p-8 text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">No violation records found for this student.</div>
                    ) : (
                      violationsHistory.map((v, i) => (
                        <div key={`${v.id}-${i}`} className="flex items-start gap-4 p-4 rounded-xl border border-rose-100 dark:border-rose-500/20 bg-white dark:bg-slate-800 shadow-sm relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-rose-500" />
                          <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 font-black shrink-0">{violationsHistory.length - i}</div>
                          <div className="flex-1"><h4 className="font-bold text-slate-800 dark:text-slate-200">{v.violation_type}</h4><p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">{new Date(v.created_at).toLocaleString()}</p></div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-8 flex justify-end">
                    <button onClick={() => kickParticipant(selectedViolationsParticipant.id)} className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition-all"><Trash2 size={18} /> Ban Player Now</button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto py-12 px-4">
        <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
          <AnimatePresence>
            {floatingEmojis.map((item) => (
              <motion.div key={item.id} initial={{ y: 50, opacity: 0, scale: 0.8 }} animate={{ y: -200, opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 1.8, ease: 'easeOut' }} className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl" style={{ transform: `translateX(${item.xOffset}px)` }}>
                {item.emoji}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-8 group">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back to Dashboard
        </button>

        <div className="mb-12 rounded-3xl bg-white border border-slate-200/80 shadow-sm p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 mb-3">Game PIN</p>
              <div className="flex items-center gap-4">
                <span className="text-5xl md:text-6xl font-mono tracking-[0.18em] font-extrabold text-indigo-600">{joinCode}</span>
                <button onClick={copyPin} className="w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-100 hover:bg-slate-200 text-indigo-600 transition-colors border border-slate-200" aria-label="Copy game PIN">
                  {copied ? <Check size={24} /> : <Copy size={24} />}
                </button>
              </div>
              <p className="mt-4 text-sm text-slate-500">Students can join instantly by scanning the QR code.</p>
              <p className="mt-2 text-xs text-slate-400 break-all">{joinUrl}</p>
              {isJoinUrlLocalOnly && (
                <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This QR uses localhost. Set VITE_APP_URL to your LAN IP or deployed URL for QR codes to work on phones.
                </p>
              )}
            </div>
            <div className="justify-self-center md:justify-self-end">
              <motion.div initial={{ scale: 0.98, opacity: 0.95 }} animate={{ scale: [1, 1.02, 1], opacity: [0.95, 1, 0.95] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-inner relative group cursor-pointer">
                <QRCodeSVG id="qr-code-svg" value={joinUrl} size={180} fgColor="#0f172a" bgColor="#ffffff" level="H" includeMargin />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity gap-3 backdrop-blur-sm">
                  <button onClick={downloadQRImage} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 w-32 shadow-lg">Download PNG</button>
                  <button onClick={downloadQRSVG} className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 w-32 shadow-lg">Download SVG</button>
                </div>
              </motion.div>
              <div className="mt-4 flex flex-col gap-2 items-center">
                <p className="text-center text-xs font-medium text-slate-500">Scan to join or share link</p>
                <button onClick={copyLink} className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg transition-colors border border-slate-200">
                  {copiedLink ? (
                    <span className="inline-flex items-center gap-2"><Check size={14} /> Copied</span>
                  ) : (
                    'Copy Share Link'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-end mb-6">
          <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl shadow-sm border border-slate-200/60">
            <Users className="text-indigo-500" size={24} />
            <span className="text-2xl font-bold text-slate-900">{participantsList.length}</span>
            <span className="text-slate-500 font-medium">Players Connected</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setConfirmTerminate(true)} className="flex items-center gap-2 px-6 py-4 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors font-bold text-lg border border-rose-200">
              <Trash2 size={24} /> End Game
            </button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={startGame} disabled={participantsList.length === 0 || startingGame} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-8 py-4 rounded-2xl font-bold text-xl shadow-xl shadow-emerald-500/30 transition-all">
              <Play size={24} /> {startingGame ? 'Starting…' : 'Start Game'}
            </motion.button>
          </div>
        </div>

        {startError && <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{startError}</div>}

        <div className="bg-white rounded-3xl p-8 min-h-[380px] border border-slate-200/60 shadow-sm">
          <AnimatePresence>
            {participantsList.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center h-full pt-16 text-slate-400">
                <div className="w-16 h-16 rounded-full border-4 border-dashed border-slate-300 animate-[spin_3s_linear_infinite] mb-6" />
                <p className="text-2xl font-medium tracking-tight">Waiting for players…</p>
              </motion.div>
            ) : (
              <div className="flex flex-wrap gap-3 justify-center">
                {participantsList.map((p) => (
                  <motion.div key={p.id} initial={{ opacity: 0, scale: 0.5, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', bounce: 0.6 }} className="group relative">
                    <div className="bg-white px-5 py-2.5 rounded-xl shadow-md border border-gray-100 font-bold text-lg text-slate-800">
                      {p.regNo ? `${p.regNo} - ${p.display_name}` : p.display_name}
                    </div>
                    <button onClick={() => setConfirmKickParticipant({ id: p.id, name: p.display_name })} aria-label={`Remove ${p.display_name}`} className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity transform hover:scale-110 shadow-lg" title="Remove Player">
                      <XCircle size={16} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>
        {renderModals()}
      </div>
    </div>
  );
}
