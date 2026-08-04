import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, X, Loader2, ArrowLeft } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import LogoMark from '../components/LogoMark';

type VerificationState = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [state, setState] = useState<VerificationState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setState('error');
        setErrorMessage('No verification token found.');
        return;
      }

      try {
        await authApi.verifyEmail(token);
        setState('success');

        // Auto-redirect after 5 seconds
        setTimeout(() => {
          navigate('/login', { replace: true });
        }, 5000);
      } catch (err: any) {
        console.error('Verification error:', err);
        setState('error');
        setErrorMessage(
          err?.response?.data?.error || 'Verification failed. Please try again.'
        );
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors z-10">
        <ArrowLeft size={20} /> Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl shadow-indigo-600/10 dark:shadow-[0_20px_60px_rgba(2,6,23,0.5)] border border-white/20 dark:border-slate-800/50 relative z-10"
      >
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <Link to="/" className="group inline-flex items-center justify-center gap-3">
              <LogoMark size="md" className="shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" />
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400">
                LevelNLearn
              </span>
            </Link>
          </div>

          {state === 'loading' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="flex justify-center"
              >
                <Loader2 size={48} className="text-indigo-600 dark:text-indigo-400" />
              </motion.div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Verifying your email...</h1>
              <p className="text-slate-600 dark:text-slate-400">Please wait while we confirm your email address.</p>
            </motion.div>
          )}

          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="flex justify-center"
              >
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
                </div>
              </motion.div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Email verified!</h1>
              <p className="text-slate-600 dark:text-slate-400">Your account is ready. Redirecting to login...</p>
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">Redirecting in 5 seconds...</p>
              </div>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center">
                  <X size={32} className="text-rose-600 dark:text-rose-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Verification failed</h1>
              <p className="text-slate-600 dark:text-slate-400">{errorMessage}</p>
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 space-y-2">
                <Link
                  to="/register"
                  className="block w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors text-center"
                >
                  Register again
                </Link>
                <Link
                  to="/login"
                  className="block w-full py-3 px-4 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors text-center"
                >
                  Back to login
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
