import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { sessionApi, authApi } from '../api/client';
import { setPersistedLiveQuizSession } from '../lib/liveQuizSession';

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, updateUser } = useAuthStore();

  const [pin, setPin] = useState('');
  const [name, setName] = useState(user?.name || user?.email || 'Player');
  const [regNo, setRegNo] = useState(user?.regNo || '');
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ id: string; timedScoring: boolean } | null>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const codeFromUrl = searchParams.get('code')?.trim().toUpperCase() ?? '';
    if (!codeFromUrl) return;
    setPin(codeFromUrl.slice(0, 6));
    setStep(2);
  }, [searchParams]);

  useEffect(() => {
    if (step !== 2) return;
    nicknameInputRef.current?.focus();
  }, [step]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1) {
      const normalizedPin = pin.trim().toUpperCase();
      if (normalizedPin.length !== 6) {
        setError('Please enter a valid 6-digit game PIN');
        return;
      }
      setPin(normalizedPin);
      setError('');
      setStep(2);
      return;
    }

    if (!name.trim()) {
      setError('Please enter a nickname to continue');
      return;
    }

    if (user && !user.regNo) {
      const normalizedRegNo = regNo.trim().toUpperCase();
      if (!/^RA[0-9]{13}$/.test(normalizedRegNo)) {
        setError('Registration number must be RA followed by 13 digits (e.g., RA2211004050001).');
        return;
      }
    }

    try {
      setLoading(true);
      const sessionRes = await sessionApi.getByCode(pin.trim().toUpperCase());
      setSessionInfo(sessionRes.data);
      setShowConsentModal(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not find session. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmJoin = async () => {
    setShowConsentModal(false);
    setLoading(true);
    setError('');

    let deviceUuid = localStorage.getItem('kahoot_device_uuid');
    if (!deviceUuid) {
      deviceUuid = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : 'uuid-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('kahoot_device_uuid', deviceUuid);
    }

    try {
      if (user && !user.regNo) {
        const normalizedRegNo = regNo.trim().toUpperCase();
        await authApi.updateProfile(user.name || name.trim() || 'Player', user.image || undefined, normalizedRegNo);
        updateUser({ regNo: normalizedRegNo });
      }

      if (!sessionInfo) return;
      const sessionId = sessionInfo.id;
      const consentAt = new Date().toISOString();
      const finalRegNo = user?.regNo || regNo.trim().toUpperCase() || null;

      await sessionApi.join(sessionId, pin.trim().toUpperCase(), name.trim(), deviceUuid, consentAt, finalRegNo);

      setPersistedLiveQuizSession({
        participantId: 'pending',
        sessionId,
        gamePin: pin.trim().toUpperCase(),
        nickname: name.trim(),
      });

      navigate(`/play/${sessionId}`);
    } catch (err: any) {
      const msg = err?.code === 'ECONNABORTED'
        ? 'Connection timed out. Check that the server is running and retry.'
        : err?.response?.data?.error || 'Could not join the session. Try again.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-slate-900 transition-colors">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5 }}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl shadow-indigo-500/10 dark:shadow-none border border-gray-100 dark:border-white/10"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 -mt-16 shadow-xl shadow-indigo-600/30 transform -rotate-3">
            <span className="text-white font-bold text-4xl">L</span>
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
                aria-label="Game PIN"
                required
                maxLength={6}
                placeholder="Game PIN"
                className="w-full text-center text-3xl tracking-[0.2em] font-bold px-6 py-4 rounded-2xl bg-gray-50 dark:bg-slate-900 border-2 border-transparent focus:border-indigo-500 outline-none transition-all dark:text-white uppercase placeholder:text-gray-300 dark:placeholder:text-slate-700 placeholder:font-medium placeholder:tracking-normal"
              />
            </div>
          ) : (
            <>
              <div className="w-full text-center text-base font-semibold px-4 py-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-500/10 dark:border-indigo-500/30 dark:text-indigo-300">
                Game PIN: <span className="font-extrabold tracking-[0.12em]">{pin}</span>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Nickname</label>
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Nickname"
                  maxLength={24}
                  required
                  placeholder="Enter your nickname"
                  className="w-full text-center text-xl font-semibold px-6 py-4 rounded-2xl bg-gray-100 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
                />
              </div>
              {user && !user.regNo && (
                <div>
                  <label className="block text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">Registration Number</label>
                  <input
                    type="text"
                    value={regNo}
                    onChange={(e) => setRegNo(e.target.value.toUpperCase())}
                    aria-label="Registration Number"
                    maxLength={15}
                    required
                    placeholder="e.g. RA2211004050001"
                    className="w-full text-center text-xl font-semibold px-6 py-4 rounded-2xl bg-gray-100 dark:bg-slate-900/50 border-2 border-transparent focus:border-indigo-500 outline-none transition-all text-slate-700 dark:text-slate-200 placeholder:text-slate-400 uppercase"
                  />
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    This will be saved to your profile for future sessions.
                  </p>
                </div>
              )}
            </>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={loading}
            type="submit"
            className="w-full py-4 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-2xl font-bold text-xl shadow-xl shadow-slate-900/20 dark:shadow-indigo-600/30 transition-all flex justify-center items-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="animate-spin" /> : step === 1 ? 'Continue' : 'Enter'}
          </motion.button>
        </form>
      </motion.div>

      <AnimatePresence>
        {showConsentModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden p-6"
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center">
                  <ShieldAlert size={32} />
                </div>
              </div>
              <h3 className="text-2xl font-black text-center text-slate-900 dark:text-white mb-4">
                Anti-Cheat Engine Active
              </h3>
              <p className="text-slate-600 dark:text-slate-300 font-medium mb-4 text-center">
                To ensure a fair environment, the following actions will be strictly monitored during the quiz:
              </p>
              <ul className="space-y-3 mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-sm font-semibold text-slate-700 dark:text-slate-200">
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 mt-0.5">•</span>
                  Tab switches / window blur
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 mt-0.5">•</span>
                  Fullscreen exits
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-500 mt-0.5">•</span>
                  Right-click and keyboard shortcuts (copy, paste, devtools)
                </li>
              </ul>
              
              <div className="p-3 mb-6 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-xl text-indigo-800 dark:text-indigo-400 text-sm font-bold text-center">
                {sessionInfo?.timedScoring 
                  ? '⏱ This quiz uses Timed Scoring. Faster answers get more points!'
                  : '📝 This quiz has No Time Limit. Take your time and think freely.'}
              </div>

              <div className="p-3 mb-6 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-400 text-sm font-bold text-center">
                ⚠️ Multiple violations will auto-submit your quiz.
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowConsentModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmJoin}
                  className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30"
                >
                  I understand, start quiz
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
