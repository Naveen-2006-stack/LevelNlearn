import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRouter from './routes/auth.js';
import quizzesRouter from './routes/quizzes.js';
import sessionsRouter from './routes/sessions.js';
import pusherRouter from './routes/pusher.js';
import adminRouter from './routes/admin.js';
import feedbackRouter from './routes/feedback.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

// ── Startup environment validation ──────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[startup] FATAL: Missing env vars: ${missingEnv.join(', ')}`);
  process.exit(1);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[startup] FATAL: JWT_SECRET must be at least 32 characters long.');
  process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const isDev = (process.env.NODE_ENV || 'development') !== 'production';

app.disable('x-powered-by');

const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);

const localhostLikeRegex = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const privateLanRegex = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)[^/:]+(?::\d+)?$/i;

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Auth routes: strict — 10 requests per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes and try again.' },
  skip: () => isDev, // allow unlimited in dev
});

// General API: 150 requests per minute per IP
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: () => isDev,
});

// ── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin(origin, callback) {
    if (!origin) { callback(null, true); return; }
    if (configuredOrigins.includes(origin)) { callback(null, true); return; }
    if (isDev && (localhostLikeRegex.test(origin) || privateLanRegex.test(origin))) {
      callback(null, true); return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '2mb' })); // 2mb is sufficient; images are uploaded by URL
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// Apply rate limiters before routes
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/quizzes', quizzesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/pusher', pusherRouter);
app.use('/api/admin', adminRouter);
app.use('/api/feedback', feedbackRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, env: isDev ? 'development' : 'production' }));

app.use(errorHandler);

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT} (${isDev ? 'dev' : 'production'})`);
  });
}

// Export app for testing
export default app;
