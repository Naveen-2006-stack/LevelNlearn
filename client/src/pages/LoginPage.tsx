import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import LogoMark from '../components/LogoMark';
import { useGoogleClientId } from '../hooks/useGoogleClientId';

export default function LoginPage() {
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);

  const requestedNext = searchParams.get('next') ?? '/dashboard';
  const safeNext = requestedNext.startsWith('/') ? requestedNext : '/dashboard';

  const googleClientId = useGoogleClientId();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

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
          callback: handleCredentialResponse,
        });
        if (googleButtonRef.current) {
          (window as any).google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'filled_black',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            logo_alignment: 'left',
          });
        }
      } catch (e) {
        console.error('GSI init error', e);
      }
    }
  }, [googleClientId]);

  async function handleCredentialResponse(response: any) {
    if (!response?.credential) {
      setError('Google sign-in failed');
      return;
    }
    try {
      const res = await authApi.loginWithGoogle(response.credential);
      login(res.data.token, res.data.user as Parameters<typeof login>[1]);
      navigate(safeNext, { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Google sign-in failed');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/10 blur-[100px] rounded-full pointer-events-none" />

      <Link to="/" className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors z-10">
        <ArrowLeft size={20} /> Back to home
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
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
        </div>

        {searchParams.get('registered') === 'true' && (
          <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 rounded-xl mb-6 text-sm font-semibold text-center">
            Account created successfully! Sign in below.
          </div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20 rounded-xl mb-6 text-sm font-semibold flex items-center justify-center text-center"
          >
            {error}
          </motion.div>
        )}

        {googleClientId && (
          <div className="space-y-4 mb-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-950/70 p-3 shadow-lg shadow-black/20 ring-1 ring-white/5">
                <div ref={googleButtonRef} className="flex justify-center" />
              </div>
              <div className="text-sm text-slate-400">Continue with your Google account</div>
            </div>
          </div>
        )}

        {!googleClientId && (
          <div className="p-4 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20 rounded-xl mb-6 text-sm font-semibold text-center">
            Google sign-in is not configured on this deployment yet.
          </div>
        )}

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Sign in is handled only through Google.
        </div>
      </motion.div>
    </div>
  );
}
