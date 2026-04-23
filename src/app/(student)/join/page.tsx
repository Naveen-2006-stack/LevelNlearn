"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { setPersistedLiveQuizSession } from "@/lib/liveQuizSession";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { joinGameAction } from "@/actions/game";

function StudentJoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      const currentPath = typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/join";
      const loginParams = new URLSearchParams({
        message: "Please sign in to join a game",
        next: currentPath,
      });
      router.push(`/login?${loginParams.toString()}`);
    } else if (status === "authenticated" && session?.user) {
      setName(session.user.name || session.user.email || "Player");
      setLoading(false);
    }
  }, [status, session, router]);

  useEffect(() => {
    const codeFromUrl = searchParams.get("code")?.trim().toUpperCase() ?? "";
    if (!codeFromUrl) return;

    setPin(codeFromUrl.slice(0, 6));
    setStep(2);
  }, [searchParams]);

  useEffect(() => {
    if (status !== "authenticated" || step !== 2) return;
    nicknameInputRef.current?.focus();
  }, [status, step]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      const normalizedPin = pin.trim().toUpperCase();
      if (normalizedPin.length !== 6) {
        setError("Please enter a valid 6-digit game PIN");
        return;
      }
      setPin(normalizedPin);
      setError("");
      setStep(2);
      return;
    }

    if (!name.trim()) {
      setError("Please enter a nickname to continue");
      return;
    }

    setLoading(true);
    setError("");

    let deviceUuid = localStorage.getItem("kahoot_device_uuid");
    if (!deviceUuid) {
      deviceUuid = crypto.randomUUID();
      localStorage.setItem("kahoot_device_uuid", deviceUuid);
    }

    try {
      const sessionId = await joinGameAction(pin.trim().toUpperCase(), name.trim(), deviceUuid);
      
      setPersistedLiveQuizSession({
        participantId: "handled-on-server", 
        sessionId: sessionId,
        gamePin: pin.trim().toUpperCase(),
        nickname: name.trim(),
      });

      router.push(`/play/${sessionId}`);
    } catch (err: any) {
      setError(err.message || "Could not join the session. Try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-900 transition-colors">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.5 }}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl shadow-indigo-500/10 dark:shadow-none border border-gray-100 dark:border-white/10"
      >
        {status !== "authenticated" ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
            <p className="text-slate-500 font-medium animate-pulse">Verifying Account...</p>
          </div>
        ) : (
          <>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 -mt-16 shadow-xl shadow-indigo-600/30 transform -rotate-3">
            <span className="text-white font-bold text-4xl">K</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">LevelNLearn</h1>
          <p className="text-slate-500 dark:text-slate-400">Join the live session</p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm text-center font-medium dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400">
            {error}
          </motion.div>
        )}

        <form onSubmit={handleJoin} className="space-y-4">
          {step === 1 ? (
            <div>
              <input 
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.toUpperCase())}
                required
                maxLength={6}
                placeholder="Game PIN"
                className="w-full text-center text-3xl tracking-[0.2em] font-bold px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white uppercase placeholder:text-gray-300 dark:placeholder:text-slate-700 placeholder:font-medium placeholder:tracking-normal"
              />
            </div>
          ) : (
            <>
              <div className="w-full text-center text-base font-semibold px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700">
                Game PIN: <span className="font-extrabold tracking-[0.12em]">{pin}</span>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Nickname</label>
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={24}
                  required
                  placeholder="Enter your nickname"
                  className="w-full text-center text-xl font-semibold px-6 py-4 rounded-2xl bg-gray-100 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
            </>
          )}

          <motion.button 
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={loading}
            type="submit"
            className="w-full py-4 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold text-xl shadow-xl shadow-slate-900/20 dark:shadow-indigo-600/30 transition-all flex justify-center items-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : step === 1 ? "Continue" : "Enter"}
          </motion.button>
        </form>
        </>
        )}
      </motion.div>
    </div>
  );
}

function JoinPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <Loader2 className="animate-spin text-indigo-500 w-10 h-10" />
    </div>
  );
}

export default function StudentJoin() {
  return (
    <Suspense fallback={<JoinPageFallback />}>
      <StudentJoinContent />
    </Suspense>
  );
}
