import { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { authApi } from '../api/client';
import LogoMark from '../components/LogoMark';

export default function VerifyEmailPendingPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const email = searchParams.get('email') || '';

  const handleResendVerification = async () => {
    if (!email) return;
    
    setLoading(true);
    setMessage('');
    setError('');

    try {
      await authApi.resendVerification(email);
      setMessage('Verification link sent! Check your inbox.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

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

          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex justify-center mb-6"
          >
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-500/20 rounded-full flex items-center justify-center">
              <Mail size={32} className="text-indigo-600 dark:text-indigo-400" />
            </div>
          </motion.div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Check Your Email</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-2">
            We've sent a verification link to:
          </p>
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-6 break-all">
            {email}
          </p>

          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 mb-6 text-left">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">What's next?</h3>
            <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
              <li>Open the email from LevelNLearn</li>
              <li>Click the "Verify Email Address" button or link</li>
              <li>You'll be logged in automatically!</li>
            </ol>
          </div>

          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              ⏰ <span className="font-semibold">Expires in 24 hours</span> – If you don't verify by then, you can register again.
            </p>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-lg mb-4 text-sm font-semibold">
              {error}
            </motion.div>
          )}

          {message && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-lg mb-4 text-sm font-semibold">
              {message}
            </motion.div>
          )}

          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              onClick={handleResendVerification}
              className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin w-5 h-5" />
                  Resending...
                </>
              ) : (
                <>
                  <Mail size={20} />
                  Resend Verification Email
                </>
              )}
            </motion.button>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Can't find the email? Check your spam folder or click above to resend.
            </p>

            <Link
              to="/login"
              className="block w-full py-3 px-4 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold text-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Back to login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
