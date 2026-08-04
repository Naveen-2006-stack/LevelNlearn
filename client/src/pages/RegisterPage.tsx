import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowLeft, Check } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import LogoMark from '../components/LogoMark';

// Allow any email domain

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [regNo, setRegNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const navigate = useNavigate();

  // SRM registration number format: RA followed by digits (e.g., RA2211004050001)
  const REG_NO_REGEX = /^RA[0-9]{13}$/i;
  const isValidRegNo = regNo.trim() === '' || REG_NO_REGEX.test(regNo.trim().toUpperCase());

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const login = useAuthStore((s) => s.login);

  useEffect(() => {
    if (!googleClientId) return;
    const existing = (window as any).google;
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        initializeGSI();
      };
      document.head.appendChild(script);
    } else {
      initializeGSI();
    }

    function initializeGSI() {
      try {
        (window as any).google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp: any) => {
            // on register, use server to create user and return app token
            try {
              const res = await authApi.loginWithGoogle(resp.credential);
              login(res.data.token, res.data.user as Parameters<typeof login>[1]);
              window.location.href = '/dashboard';
            } catch (e) {
              console.error('Google register error', e);
            }
          },
        });
        if (googleButtonRef.current) {
          (window as any).google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large' });
        }
      } catch (e) {
        console.error('GSI init error', e);
      }
    }
  }, [googleClientId]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isValidEmail) {
      setError('Enter a valid email address.');
      setLoading(false);
      return;
    }

    if (regNo.trim() && !REG_NO_REGEX.test(regNo.trim().toUpperCase())) {
      setError('Registration number must be in the format: RA2211004050001 (RA + 13 digits).');
      setLoading(false);
      return;
    }

    try {
      await authApi.register(name, email, password, regNo.trim().toUpperCase() || undefined);
      setRegistrationSuccess(true);
      // Redirect to verify-email page after showing success message
      setTimeout(() => {
        navigate(`/verify-email-pending?email=${encodeURIComponent(email)}`);
      }, 2000);
    } catch (err: any) {
      if (err?.code === 'ERR_NETWORK') {
        setError('Cannot reach server. Start the backend API and try again.');
      } else {
        setError(err?.response?.data?.error || 'An error occurred during registration.');
      }
      setLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-[2rem] p-8 shadow-2xl shadow-indigo-600/10 dark:shadow-[0_20px_60px_rgba(2,6,23,0.5)] border border-white/20 dark:border-slate-800/50 relative z-10"
        >
          <div className="text-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="flex justify-center mb-6"
            >
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center">
                <Check size={32} className="text-emerald-600 dark:text-emerald-400" />
              </div>
            </motion.div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Registration Successful!</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-2">📧 Check your email inbox!</p>
            <p className="text-slate-600 dark:text-slate-400">We've sent a verification link to <span className="font-semibold text-slate-900 dark:text-white">{email}</span></p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">This link expires in 24 hours. Can't find it? Check your spam folder.</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-6">Redirecting...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors z-10">
        <ArrowLeft size={20} /> Back to home
      </Link>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
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
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Create an Account</h2>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center justify-center text-center">
            {error}
          </motion.div>
        )}

        {googleClientId && (
          <div className="space-y-4 mb-6">
            <div className="flex flex-col items-center gap-4">
              <div ref={googleButtonRef} />
              <div className="text-sm text-slate-500">Or create an account with your Google account</div>
            </div>
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
              <span className="flex-shrink mx-4 text-slate-400 text-xs uppercase tracking-wider">or register with email</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
            </div>
          </div>
        )}
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2 ${
                email && isValidEmail
                  ? 'border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 focus:ring-emerald-500'
                  : email && !isValidEmail
                  ? 'border-rose-300 dark:border-rose-600 bg-white dark:bg-slate-800 focus:ring-rose-500'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-indigo-500'
              } text-slate-900 dark:text-white`}
              placeholder="you@example.com"
            />
            {email && !isValidEmail && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">Enter a valid email address.</p>
            )}
            {email && isValidEmail && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                <Check size={14} /> Looks good
              </p>
            )}
            {!email && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Enter a valid email address.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
            <input
              type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Must be at least 6 characters long.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Registration Number <span className="text-slate-400 dark:text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())}
              maxLength={15}
              className={`w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2 font-mono uppercase ${
                regNo && !isValidRegNo
                  ? 'border-rose-300 dark:border-rose-600 bg-white dark:bg-slate-800 focus:ring-rose-500'
                  : regNo && isValidRegNo
                  ? 'border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-800 focus:ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-indigo-500'
              } text-slate-900 dark:text-white`}
              placeholder="RA2211004050001"
            />
            {regNo && !isValidRegNo && (
              <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">Must be RA + 13 digits (e.g. RA2211004050001).</p>
            )}
            {regNo && isValidRegNo && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1"><Check size={14} /> Valid Reg No</p>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={loading || !isValidEmail}
            type="submit"
            className="w-full py-4 px-6 mt-4 bg-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="animate-spin text-white w-6 h-6" /> : 'Register'}
          </motion.button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Already have an account? <Link to="/login" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Sign in here</Link>
        </div>
      </motion.div>
    </div>
  );
}
