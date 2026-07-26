import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Check } from 'lucide-react';
import { authApi } from '../api/client';
import LogoMark from '../components/LogoMark';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await authApi.requestPasswordReset(email);
      setSuccess('If that email is registered, a password reset link has been sent.');
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

      <Link to="/login" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors z-10">
        <ArrowLeft size={20} /> Back to login
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl shadow-indigo-600/10 dark:shadow-[0_20px_60px_rgba(2,6,23,0.5)] border border-white/20 dark:border-slate-800/50 relative z-10"
      >
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <Link to="/" className="group inline-flex items-center justify-center gap-3">
              <LogoMark size="md" className="shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" />
              <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white transition-all duration-300 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-cyan-400">
                LevelNLearn
              </span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Forgot Your Password?
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {submitted ? 'Check your email for a reset link' : 'Enter your email to receive a password reset link'}
          </p>
        </div>

        {success && submitted && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center gap-2"
          >
            <Check size={18} /> {success}
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-xl mb-6 text-sm font-semibold text-center"
          >
            {error}
          </motion.div>
        )}

        {!submitted ? (
          <form onSubmit={handleSendReset} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                placeholder="you@example.com"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">We'll send a password reset link to this email address.</p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={loading}
              type="submit"
              className="w-full py-4 px-6 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin text-white w-6 h-6" />
                  Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </motion.button>

            <div className="text-center text-sm">
              <Link to="/login" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                Back to login
              </Link>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl text-sm text-blue-800 dark:text-blue-300"
            >
              <p className="font-semibold mb-2">📧 Reset link sent!</p>
              <p>Check your inbox at <span className="font-semibold">{email}</span> for a link to reset your password. The link expires in 1 hour.</p>
              <p className="mt-3 text-xs">Didn't receive it? Check your spam folder or try entering a different email.</p>
            </motion.div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSubmitted(false)}
                className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Try another email
              </motion.button>
              <Link
                to="/login"
                className="block w-full py-3 px-4 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white rounded-xl font-bold text-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Back to login
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

