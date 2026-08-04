import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Eye, EyeOff, Check, X } from 'lucide-react';
import { authApi } from '../api/client';
import LogoMark from '../components/LogoMark';

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('No reset token provided. Please request a new password reset link.');
    }
  }, [token]);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 8) errors.push('At least 8 characters');
    if (!/[A-Z]/.test(pwd)) errors.push('1 uppercase letter');
    if (!/[0-9]/.test(pwd)) errors.push('1 number');
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) errors.push('1 special character');
    return errors;
  };

  const handlePasswordChange = (value: string) => {
    setNewPassword(value);
    setValidationErrors(validatePassword(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (!token) {
      setError('Reset token is missing.');
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (validationErrors.length > 0) {
      setError('Password does not meet all requirements.');
      setLoading(false);
      return;
    }

    try {
      await authApi.resetPassword(token, newPassword);
      setSuccess('Password reset successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.error || 'Password reset failed. Please try again.';
      setError(errorMsg);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset Your Password</h1>
          <p className="text-slate-600 dark:text-slate-400">Enter a new secure password for your account</p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center gap-2"
          >
            <X size={18} /> {error}
          </motion.div>
        )}

        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center gap-2"
          >
            <Check size={18} /> {success}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all pr-12"
                placeholder="Enter your new password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>

            {/* Password strength indicator */}
            <div className="mt-3 space-y-2">
              <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Password must contain:</div>
              <div className="space-y-1">
                <div className={`flex items-center gap-2 text-xs ${newPassword.length >= 8 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {newPassword.length >= 8 ? <Check size={14} /> : <X size={14} />}
                  At least 8 characters
                </div>
                <div className={`flex items-center gap-2 text-xs ${/[A-Z]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {/[A-Z]/.test(newPassword) ? <Check size={14} /> : <X size={14} />}
                  1 uppercase letter
                </div>
                <div className={`flex items-center gap-2 text-xs ${/[0-9]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {/[0-9]/.test(newPassword) ? <Check size={14} /> : <X size={14} />}
                  1 number
                </div>
                <div className={`flex items-center gap-2 text-xs ${/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {/[!@#$%^&*(),.?":{}|<>]/.test(newPassword) ? <Check size={14} /> : <X size={14} />}
                  1 special character
                </div>
              </div>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all pr-12"
                placeholder="Confirm your new password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Passwords do not match</p>
            )}
            {confirmPassword && newPassword === confirmPassword && validationErrors.length === 0 && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check size={14} /> Passwords match
              </p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={loading || validationErrors.length > 0 || !confirmPassword || newPassword !== confirmPassword}
            type="submit"
            className="w-full py-4 px-6 mt-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin text-white w-6 h-6" />
                Resetting Password...
              </>
            ) : (
              'Reset Password'
            )}
          </motion.button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link to="/login" className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
            Back to login
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
