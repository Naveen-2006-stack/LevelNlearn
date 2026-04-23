"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { pusherClient } from "@/lib/pusherClient";
import { useSession } from "next-auth/react";
import {
  clearPersistedLiveQuizSession,
  getPersistedLiveQuizSession,
  setPersistedLiveQuizSession,
} from "@/lib/liveQuizSession";
import { submitAnswerAction, flagCheatAction, fetchPlaySession, leaveGameAction } from "@/actions/game";
import { useGameStore } from "@/store/useGameStore";
import { ActiveQuestionCard } from "@/components/game/ActiveQuestionCard";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, ArrowLeft, NotebookPen, X, Save } from "lucide-react";
import confetti from "canvas-confetti";

// For debouncing notes
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface FloatingEmoji {
  id: string;
  emoji: string;
  studentName?: string;
  xOffset: number;
}

export default function StudentPlayRoom() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.session_id as string;

  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedQuestionIndex, setRevealedQuestionIndex] = useState<number | null>(null);

  // Zustand Game State
  const sessionStatus = useGameStore((s) => s.sessionStatus);
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex);
  const setSessionStatus = useGameStore((s) => s.setSessionStatus);
  const setCurrentQuestionIndex = useGameStore((s) => s.setCurrentQuestionIndex);

  // Local participant state
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("Student");
  const [streak, setStreak] = useState(0);
  const [reactionCooldown, setReactionCooldown] = useState(false);
  const reactionChannelRef = useRef<any>(null);
  // Cached auth token for reliable page-close logging (keepalive fetch needs auth headers)
  const authTokenRef = useRef<string>("");
  // Ghost Mode: fetched from the user's OWN profile — never exposed to host or peers
  const [isGhostMode, setIsGhostMode] = useState(false);
  // Test Mode: when true, marks and leaderboard are hidden from students
  const [isTestMode, setIsTestMode] = useState(false);
  // Banned state
  const [isBanned, setIsBanned] = useState(false);
  // Notes & Multi-submission
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set());
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const debouncedNotes = useDebounce(notes, 1000);
  // Guard: prevent auto-save from overwriting DB notes before they've been loaded
  const notesInitializedRef = useRef(false);

  // Universal emoji floats — same logic as Host screen
  const [floatingEmojis, setFloatingEmojis] = useState<FloatingEmoji[]>([]);
  const hasMarkedLeftRef = useRef(false);

  // Restore critical in-memory participant state after refresh so quiz flow survives reloads.
  useEffect(() => {
    if (!sessionId || participantId) return;

    const persisted = getPersistedLiveQuizSession(sessionId);
    if (!persisted?.participantId) return;

    setParticipantId(persisted.participantId);
    if (persisted.nickname?.trim()) {
      setParticipantName(persisted.nickname.trim());
    }
  }, [participantId, sessionId]);

  // Student realtime sync: follow host-driven session updates via Pusher.
  useEffect(() => {
    if (!sessionId) return;

    const channel = pusherClient.subscribe(`session-${sessionId}`);
    
    channel.bind("session-update", (payload: any) => {
      const { status, current_question_index } = payload;
      
      setSessionInfo((prev: any) => (prev ? { ...prev, status, current_question_index } : prev));

      if (status) {
        setSessionStatus(status as any);
      }

      if (typeof current_question_index === "number") {
        setCurrentQuestionIndex(current_question_index);
        setRevealedQuestionIndex(null);
        setLastAnswerCorrect(null);
      }
    });

    return () => {
      channel.unbind("session-update");
      pusherClient.unsubscribe(`session-${sessionId}`);
    };
  }, [sessionId, setCurrentQuestionIndex, setSessionStatus]);

  // Fallback sync for session status/index
  useEffect(() => {
    if (!sessionId || loading) return;

    const refreshSessionState = async () => {
      try {
        const uuid = localStorage.getItem("kahoot_device_uuid") || "";
        const data = await fetchPlaySession(sessionId, uuid);
        
        if (data && data.liveSession) {
          setSessionInfo((prev: any) => (prev ? { ...prev, ...data.liveSession } : prev));

          if (data.liveSession.status) {
            setSessionStatus(data.liveSession.status as any);
          }

          if (typeof data.liveSession.currentQuestionIndex === "number") {
            setCurrentQuestionIndex(data.liveSession.currentQuestionIndex);
          }
        }
      } catch (e) {}
    };

    void refreshSessionState();
    const interval = setInterval(() => {
      void refreshSessionState();
    }, 5000);

    return () => clearInterval(interval);
  }, [sessionId, loading, setCurrentQuestionIndex, setSessionStatus]);

  // Auto-save notes (notes persistence not yet in schema; stubbed out)
  useEffect(() => {
    if (!participantId || !sessionId || !notesInitializedRef.current) return;
    const saveNotes = async () => {
      setSavingNotes(true);
      // TODO: Call a server action when notes column is added to Participant schema.
      await new Promise(r => setTimeout(r, 200));
      setSavingNotes(false);
    };
    saveNotes();
  }, [debouncedNotes, participantId, sessionId]);

  // Init room data
  useEffect(() => {
    const initPlayRoom = async () => {
      const persistedSession = getPersistedLiveQuizSession(sessionId);
      const uuid = localStorage.getItem("kahoot_device_uuid");
      const fallbackParticipantId = persistedSession?.sessionId === sessionId ? persistedSession?.participantId : undefined;

      if (!uuid && !fallbackParticipantId) {
        router.push("/join");
        return;
      }

      try {
        const data = await fetchPlaySession(sessionId, uuid || "");

        setSessionInfo(data.liveSession);
        setSessionStatus(data.liveSession.status.toLowerCase() as any);
        setCurrentQuestionIndex(data.liveSession.currentQuestionIndex ?? 0);
        setIsTestMode(false); // testMode not in current schema
        setQuestions(data.liveSession.quiz.questions);

        const pData = data.participant;
        setParticipantId(pData.id);
        setParticipantName(pData.displayName || "Student");
        setStreak(pData.streak || 0);

        setPersistedLiveQuizSession({
          participantId: pData.id,
          sessionId,
          gamePin: persistedSession?.gamePin || "",
          nickname: pData.displayName || "Student",
        });

        // Banned check: treat high cheatFlags as a soft ban
        if (pData.cheatFlags >= 10) {
          router.push("/dashboard?error=banned");
          return;
        }
      } catch (err) {
        console.error("Initialization checks failed:", err);
        clearPersistedLiveQuizSession();
        router.push("/join");
        return;
      }

      setLoading(false);
    };

    void initPlayRoom();
  }, [router, sessionId, setCurrentQuestionIndex, setSessionStatus]);

  // Anti-cheat: hardened detection — tab switch, window blur, mouse leave, context menu, key shortcuts
  useEffect(() => {
    if (!sessionId || !participantId || sessionStatus !== "active") return;

    let strikeCooldown = false;
    let blurDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let mouseLeaveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const markParticipantLeft = async (reason: string, useKeepalive = false) => {
      if (!participantId || hasMarkedLeftRef.current) return;
      hasMarkedLeftRef.current = true;
      // Leaving logic via actions if needed
    };

    const triggerStrike = async (type: string, useKeepalive = false) => {
      if (strikeCooldown) return;
      strikeCooldown = true;
      setTimeout(() => { strikeCooldown = false; }, 3000);

      const violationEvent = {
        type,
        timestamp: new Date().toISOString(),
      };

      try {
        await flagCheatAction(participantId, sessionId);
        // We notify teacher via Pusher about the violation event
        await fetch('/api/pusher', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: `session-${sessionId}`,
            event: 'anti_cheat_violation',
            payload: {
              studentName: participantName,
              studentId: participantId,
              violation: violationEvent,
              violationType: type,
            }
          })
        }).catch(() => {});
      } catch (err) {}
    };

    // ── 1. APP BACKGROUND / TAB HIDDEN ──
    // Fire immediately on hidden so mobile app-switching is captured before WebView suspension.
    const onVisibilityChange = () => {
      if (document.hidden) {
        void triggerStrike("App Backgrounded / Tab Hidden", true);
      }
    };

    const onPageLeave = () => {
      void triggerStrike("Page Refresh / Leave", true);
    };

    // ── 3. WINDOW BLUR (alt-tab, mobile notification, switching to another app) ──
    // 500ms debounce prevents OS focus-flicker (e.g. a system dialog that immediately
    // closes) from generating a false positive. If the user refocuses within 500ms
    // (onWindowFocus), the pending timer is cancelled — no strike logged.
    const onWindowBlur = () => {
      if (blurDebounceTimer !== null) return; // Already pending
      blurDebounceTimer = setTimeout(() => {
        blurDebounceTimer = null;
        // Only trigger if the tab is still visible — visibilitychange handles the rest
        if (!document.hidden) void triggerStrike("Window Lost Focus");
      }, 500);
    };
    const onWindowFocus = () => {
      if (blurDebounceTimer !== null) { clearTimeout(blurDebounceTimer); blurDebounceTimer = null; }
    };

    // ── 4. CURSOR LEFT PAGE (mouseleave on document) ──
    // 500ms debounce suppresses rapid edge-jitter without masking genuine exits.
    // Cancels if the cursor re-enters the viewport within the debounce window.
    const onMouseLeave = () => {
      if (mouseLeaveDebounceTimer !== null) return;
      mouseLeaveDebounceTimer = setTimeout(() => {
        mouseLeaveDebounceTimer = null;
        void triggerStrike("App Backgrounded / Tab Hidden", true);
      }, 500);
    };
    const onMouseEnter = () => {
      if (mouseLeaveDebounceTimer !== null) { clearTimeout(mouseLeaveDebounceTimer); mouseLeaveDebounceTimer = null; }
    };

    // ── 5. RIGHT-CLICK (contextmenu) ──
    const onContextMenu = (e: Event) => {
      e.preventDefault();
      void triggerStrike("Right-Click Context Menu");
    };

    // ── 6. CHEAT KEYBOARD SHORTCUTS (F12, Ctrl+U, Ctrl+Shift+I/J/C) ──
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        void triggerStrike("Screenshot Attempt (PrintScreen)");
        return;
      }

      if (
        (e.ctrlKey && ['u', 's'].includes(e.key.toLowerCase())) ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase()))
      ) {
        e.preventDefault();
        void triggerStrike("Blocked Shortcut: " + e.key);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageLeave);
    window.addEventListener("beforeunload", onPageLeave);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    const onFreeze = () => {
      void triggerStrike("App Frozen / Backgrounded", true);
    };
    document.addEventListener("freeze" as any, onFreeze as any);

    return () => {
      // Clear all pending debounce timers before removing listeners
      if (blurDebounceTimer !== null) clearTimeout(blurDebounceTimer);
      if (mouseLeaveDebounceTimer !== null) clearTimeout(mouseLeaveDebounceTimer);

      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageLeave);
      window.removeEventListener("beforeunload", onPageLeave);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("freeze" as any, onFreeze as any);
    };
  }, [sessionId, participantId, participantName, sessionStatus]);

  // Keep participant heartbeat fresh while the student is in-session.
  // Host-side anti-cheat uses this to detect app-background/disconnect gaps.
  useEffect(() => {
    if (!sessionId || !participantId || (sessionStatus !== "waiting" && sessionStatus !== "active")) return;

    const touchParticipant = async () => {
      // TODO: Call a lightweight server action to update lastActive when needed.
    };

    const onVisible = () => {
      if (!document.hidden) {
        void touchParticipant();
      }
    };

    void touchParticipant();
    const interval = setInterval(() => {
      if (!document.hidden) {
        void touchParticipant();
      }
    }, 5000);

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, participantId, sessionStatus]);

  // Emoji reactions
  useEffect(() => {
    if (!sessionId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    
    channel.bind("emoji_reaction", (payload: any) => {
      const emoji = payload?.emoji;
      const studentName = payload?.studentName;
      if (!emoji) return;
      const id = `${Date.now()}-${Math.random()}`;
      const xOffset = Math.floor(Math.random() * 260) - 130;
      setFloatingEmojis((prev) => [...prev, { id, emoji, studentName, xOffset }]);
      setTimeout(() => {
        setFloatingEmojis((prev) => prev.filter((item) => item.id !== id));
      }, 2000);
    });
    
    return () => {
      channel.unbind("emoji_reaction");
    };
  }, [sessionId]);

  // Listen for answer-reveal, kicks, and termination broadcasts from host
  useEffect(() => {
    if (!sessionId || !participantId) return;
    const channel = pusherClient.subscribe(`session-${sessionId}`);
    
    channel.bind("reveal_answer", (payload: any) => {
      const idx = payload?.questionIndex;
      if (typeof idx === "number") setRevealedQuestionIndex(idx);
    });
    
    channel.bind("kick_player", (payload: any) => {
      const targetId = payload?.targetId;
      if (targetId && targetId === participantId) {
        clearPersistedLiveQuizSession();
        pusherClient.unsubscribe(`session-${sessionId}`);
        setIsBanned(true);
      }
    });
    
    channel.bind("terminate_session", () => {
      clearPersistedLiveQuizSession();
      pusherClient.unsubscribe(`session-${sessionId}`);
      router.push("/dashboard?error=terminated");
    });
    
    return () => {
      channel.unbind("reveal_answer");
      channel.unbind("kick_player");
      channel.unbind("terminate_session");
    };
  }, [sessionId, participantId, router]);

  // Reset reveal state and last answer when question advances
  useEffect(() => {
    setRevealedQuestionIndex(null);
    setLastAnswerCorrect(null);
  }, [currentQuestionIndex]);

  // Fetch leaderboard when session finishes
  useEffect(() => {
    if (sessionStatus !== "finished" || !sessionId) return;
    
    // Confetti explosion on finish
    const duration = 3000;
    const end = Date.now() + duration;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#4F46E5', '#EC4899', '#F59E0B'], zIndex: 100 });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Leaderboard is populated via Pusher real-time events; no direct DB fetch needed here.
  }, [sessionStatus, sessionId]);

  const handleAnswerSubmit = async (optionIndices: number[], reactionMs: number) => {
    if (!participantId || !questions.length) return;

    const q = questions[currentQuestionIndex];
    if (!q) return;

    const normalizedIndices = Array.from(new Set(optionIndices.filter((idx) => idx >= 0)));
    const selectedOptionTexts = normalizedIndices
      .map((idx) => q.options[idx]?.text)
      .filter((text: string | undefined): text is string => !!text && text.trim().length > 0);

    try {
      const selectedSet = new Set(selectedOptionTexts.map((text) => text.trim().toLowerCase()));
      const correctSet = new Set(
        (q.options as any[])
          .filter((opt: any) => !!opt?.isCorrect)
          .map((opt: any) => String(opt.text || "").trim().toLowerCase())
          .filter((text: string) => text.length > 0)
      );
      const isCorrect =
        selectedSet.size > 0 &&
        selectedSet.size === correctSet.size &&
        [...selectedSet].every((text) => correctSet.has(text));
      const points = isCorrect ? 1000 : 0;
      const streakBonus = isCorrect ? streak * 50 : 0;

      await submitAnswerAction(
        sessionId,
        participantId,
        q.id,
        reactionMs,
        isCorrect,
        points,
        streakBonus
      );

      // Send Pusher event for student submission (to update host submission count)
      await fetch('/api/pusher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: `session-${sessionId}`,
          event: 'student-submission',
          payload: { questionId: q.id }
        })
      }).catch(() => {});

      if (isCorrect) {
        setStreak(streak + 1);
      } else {
        setStreak(0);
      }

      setLastAnswerCorrect(isCorrect);
      setAnsweredQuestions(prev => new Set(prev).add(q.id));
    } catch (err) {
      console.error("Submission failed:", err);
    }
  };

  const handleLeaveGame = async () => {
    if (!participantId || !sessionId) return;
    try {
      if (sessionStatus === "active") {
        await leaveGameAction(sessionId, participantId, "Left session during active quiz");
        clearPersistedLiveQuizSession();
        router.push("/dashboard?error=left-session");
        return;
      }

      await leaveGameAction(sessionId, participantId, "Left session");
      localStorage.removeItem("kahoot_device_uuid");
      clearPersistedLiveQuizSession();
      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to leave game cleanly:", error);
    }
  };

  const handleBackToDashboard = () => {
    router.push("/dashboard");
  };

  const sendEmojiReaction = async (emoji: string) => {
    if (reactionCooldown) return;
    setReactionCooldown(true);
    await fetch('/api/pusher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: `session-${sessionId}`,
        event: 'emoji_reaction',
        payload: { emoji, studentName: participantName }
      })
    }).catch(() => {});
    setTimeout(() => setReactionCooldown(false), 500);
  };

  if (isBanned) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-2xl border border-rose-100"
        >
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <X size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4">You have been banned</h2>
          <p className="text-slate-500 font-medium mb-8">
            The host has removed you from this session. You cannot rejoin this game.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 transition-colors"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col p-4 md:p-8 pt-20 md:pt-24 select-none">

      {/* ── Universal floating emoji overlay (mirrors Host screen) ── */}
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        <AnimatePresence>
          {floatingEmojis.map((item) => (
            <motion.div
              key={item.id}
              initial={{ y: 50, opacity: 0, scale: 0.8 }}
              animate={{ y: -200, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 1.8, ease: "easeOut" }}
              className="absolute bottom-10 left-1/2 text-4xl drop-shadow-2xl"
              style={{ transform: `translateX(${item.xOffset}px)` }}
              title={item.studentName || "Student"}
            >
              {item.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* Top Header */}
      <header className="flex justify-between items-center mb-10 w-full relative h-10">
        <div className="flex-1 flex justify-start">
          {sessionStatus === "waiting" && (
            <button
              onClick={handleLeaveGame}
              className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-rose-400 bg-slate-800/30 hover:bg-rose-500/10 px-4 py-2 rounded-full transition-colors border border-transparent hover:border-rose-500/30"
            >
              <ArrowLeft size={16} /> Leave Game
            </button>
          )}
        </div>

        <h1 className="flex-1 text-xl font-bold text-slate-800 dark:text-white truncate text-center absolute left-1/2 -translate-x-1/2">
          {sessionInfo?.quizzes?.title}
        </h1>

        <div className="flex-1 flex justify-end">
          <div className="px-4 py-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            {sessionStatus}
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center">

        {/* WAITING: lobby */}
        {sessionStatus === "waiting" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <div className="inline-flex items-center justify-center gap-2 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl mb-8">
              <span className="text-sm font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-300">GAME PIN:</span>
              <span className="font-mono text-2xl font-black tracking-[0.2em] text-indigo-600 dark:text-indigo-400">
                {sessionInfo?.join_code || "------"}
              </span>
            </div>
            <div className="text-6xl mb-6">🎮</div>
            <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">
              You're In, {participantName}!
            </h2>
            <p className="text-xl text-slate-500 dark:text-slate-400">Your name is on the screen. Get ready!</p>
            <div className="mt-12 flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{ y: [0, -12, 0] }}
                  transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.22 }}
                  className="w-4 h-4 bg-indigo-500 rounded-full"
                />
              ))}
            </div>

            <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/70 dark:bg-slate-800/60 backdrop-blur-md border border-white dark:border-slate-700/50 px-6 py-3 rounded-full shadow-xl z-40">
              {["🔥", "👏", "😂", "🚀"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void sendEmojiReaction(emoji)}
                  disabled={reactionCooldown}
                  className="text-2xl hover:scale-125 transition-transform cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                  aria-label={`Send ${emoji} reaction`}
                >
                  <span className="pointer-events-none">{emoji}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ACTIVE: question with 2-step submission (handled inside ActiveQuestionCard) */}
        {sessionStatus === "active" && questions[currentQuestionIndex] && (
          <ActiveQuestionCard
            key={questions[currentQuestionIndex].id}
            question={questions[currentQuestionIndex].question_text}
            imageUrl={questions[currentQuestionIndex].image_url || null}
            questionType={questions[currentQuestionIndex].question_type || "mcq"}
            options={questions[currentQuestionIndex].options}
            timeLimit={questions[currentQuestionIndex].time_limit}
            streak={streak}
            isRevealed={revealedQuestionIndex === currentQuestionIndex}
            wasAnswerCorrect={lastAnswerCorrect}
            onAnswer={handleAnswerSubmit}
            isGhostMode={isGhostMode}
            isAlreadyAnswered={answeredQuestions.has(questions[currentQuestionIndex].id)}
            isTestMode={isTestMode}
          />
        )}

        {/* FINISHED: Game over with leaderboard */}
        {sessionStatus === "finished" && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg mx-auto"
          >
            <div className="text-center mb-8">
              <div className="text-7xl mb-4">🏆</div>
              <h2 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">
                {isTestMode ? "Quiz Completed!" : "Game Over!"}
              </h2>
              <p className="text-slate-500 dark:text-slate-400">
                {isTestMode ? "Your responses have been recorded. Results will be shared by your host." : "Final Standings"}
              </p>
            </div>

            {/* Leaderboard — hidden in test mode */}
            {!isTestMode && (
              <div className="space-y-3 mb-8">
                {leaderboard.map((p, idx) => {
                  const isTop3 = idx < 3;
                  const podiumColors = [
                    "bg-gradient-to-r from-amber-200 to-amber-400 border-amber-400 dark:from-amber-600/60 dark:to-amber-500/30 text-amber-900 dark:text-amber-100",
                    "bg-gradient-to-r from-slate-200 to-slate-400 border-slate-400 dark:from-slate-600/60 dark:to-slate-500/30 text-slate-800 dark:text-slate-100",
                    "bg-gradient-to-r from-orange-200 to-orange-400 border-orange-400 dark:from-orange-800/60 dark:to-orange-600/30 text-orange-950 dark:text-orange-100"
                  ];

                  return (
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    key={idx}
                    className={`flex items-center gap-4 px-5 py-3 rounded-2xl border ${
                      isTop3 ? podiumColors[idx] :
                      p.display_name === participantName
                        ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30"
                        : "bg-white border-gray-100 dark:bg-slate-800 dark:border-white/5 shadow-sm"
                    } ${isTop3 ? 'scale-[1.02] shadow-xl my-3 py-4 border-2' : ''}`}
                  >
                    <span className={`w-10 h-10 flex items-center justify-center rounded-xl font-black shrink-0 ${idx === 0 ? "bg-amber-400 text-amber-900 text-xl shadow-inner" : idx === 1 ? "bg-slate-300 text-slate-800 text-lg shadow-inner" : idx === 2 ? "bg-orange-400 text-orange-900 text-lg shadow-inner" : "bg-gray-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                      #{idx + 1}
                    </span>
                    <span className={`flex-1 font-bold truncate ${isTop3 ? "text-current text-lg" : "text-slate-900 dark:text-white"}`}>
                      {p.display_name}
                      {p.display_name === participantName && <span className="ml-2 text-xs opacity-80 font-black uppercase">(You)</span>}
                    </span>
                    {p.streak > 0 && <span className="text-sm font-black text-rose-500 bg-rose-100 dark:bg-rose-500/20 px-2 py-1 rounded-lg">🔥 {p.streak}</span>}
                    <span className={`font-black tabular-nums text-xl ${isTop3 ? "text-current" : "text-indigo-600 dark:text-indigo-400"}`}>
                      {p.score.toLocaleString()}
                    </span>
                  </motion.div>
                  );
                })}
                {leaderboard.length === 0 && (
                  <div className="text-center py-6 text-slate-400 animate-pulse">Loading results…</div>
                )}
              </div>
            )}

            <button
              onClick={handleBackToDashboard}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg shadow-xl shadow-indigo-600/30 transition-all"
            >
              <LayoutDashboard size={22} /> Back to Dashboard
            </button>
          </motion.div>
        )}
      </main>

      {/* Floating Notes Toggle Component */}
      {(sessionStatus === "active" || sessionStatus === "waiting") && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end">
          <AnimatePresence>
            {isNotesOpen && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="mb-4 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-indigo-100 dark:border-indigo-500/20 overflow-hidden"
              >
                <div className="bg-indigo-50 dark:bg-indigo-900/40 px-4 py-3 border-b border-indigo-100 dark:border-indigo-500/20 flex justify-between items-center">
                  <h3 className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                    <NotebookPen size={16} /> My Notes
                  </h3>
                  <div className="flex items-center gap-2">
                    {savingNotes && <Save size={14} className="text-indigo-400 animate-pulse" />}
                    <button onClick={() => setIsNotesOpen(false)} className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300">
                      <X size={18} />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={sessionStatus !== "waiting"}
                    placeholder={sessionStatus === "waiting" ? "Write your note before the quiz starts..." : "Notes are locked during the quiz."}
                    className="w-full h-32 bg-transparent resize-none focus:outline-none text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {sessionStatus !== "waiting" && (
                    <p className="mt-2 text-xs text-indigo-500 dark:text-indigo-400 font-medium">Notes are read-only during the quiz.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setIsNotesOpen(!isNotesOpen)}
            className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          >
            <NotebookPen size={24} />
          </button>
        </div>
      )}

    </div>
  );
}
