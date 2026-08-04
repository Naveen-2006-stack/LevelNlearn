import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { OAuth2Client } from 'google-auth-library';
import { requireAuth } from '../middleware/auth.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.js';
import { DbUser } from '../types/index.js';

const router = Router();

// Institution-domain restriction removed: allow any valid email address

// In-memory rate limiting for resend-verification (email -> [timestamps])
const resendAttempts = new Map<string, number[]>();
// In-memory login throttle (ip:email -> failed attempt metadata)
const loginFailures = new Map<string, { count: number; firstAttemptAt: number; blockedUntil?: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

function isAllowedEmail(_email: string): boolean {
  // Kept for backwards-compatibility in code paths but no longer enforces a domain
  return true;
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

type SupabaseGoogleUser = {
  id: string;
  name: string | null;
  email: string | null;
  regNo: string | null;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
  image: string | null;
  emailVerified: string | null;
};

function hasSupabaseRestConfig(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

async function supabaseRest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!hasSupabaseRestConfig()) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set for Google sign-in.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function findGoogleUserByEmail(email: string): Promise<SupabaseGoogleUser | null> {
  const rows = await supabaseRest<SupabaseGoogleUser[]>(
    `/rest/v1/User?email=eq.${encodeURIComponent(email)}&select=id,name,email,regNo,role,image,emailVerified`
  );
  return rows[0] || null;
}

async function createGoogleUser(input: { id: string; name: string; email: string; image: string | null }): Promise<SupabaseGoogleUser> {
  const rows = await supabaseRest<SupabaseGoogleUser[]>(`/rest/v1/User`, {
    method: 'POST',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: input.id,
      name: input.name,
      email: input.email,
      role: 'TEACHER',
      image: input.image,
      emailVerified: new Date().toISOString(),
    }),
  });
  const user = rows[0];
  if (!user) {
    throw new Error('Supabase did not return the created user.');
  }
  return user;
}

async function promoteGoogleUserToTeacher(id: string): Promise<void> {
  await supabaseRest(`/rest/v1/User?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ role: 'TEACHER' }),
  });
}

function loginKey(ip: string | undefined, email: string): string {
  return `${ip || 'unknown'}:${email.toLowerCase()}`;
}

function markFailedLogin(key: string, now: number): void {
  const current = loginFailures.get(key);
  if (!current || now - current.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAttemptAt: now });
    return;
  }
  const next = { ...current, count: current.count + 1 };
  if (next.count >= LOGIN_MAX_FAILS) next.blockedUntil = now + LOGIN_BLOCK_MS;
  loginFailures.set(key, next);
}

function clearLoginFailures(key: string): void {
  loginFailures.delete(key);
}

async function findUserByEmail(email: string): Promise<DbUser | null> {
  const [rows] = await pool.query<DbUser>(
    'SELECT id, name, email, password, role, image, emailVerified FROM User WHERE email = ?',
    [email]
  );
  return rows[0] || null;
}

async function findUserByVerificationToken(token: string): Promise<DbUser | null> {
  const [rows] = await pool.query<DbUser>(
    'SELECT id, name, email, password, role, image, emailVerified FROM User WHERE email = ?',
    [token]
  );
  return rows[0] || null;
}

async function findUserByResetToken(token: string): Promise<DbUser | null> {
  const [rows] = await pool.query<DbUser>(
    'SELECT id, name, email, password, role, image, emailVerified FROM User WHERE email = ?',
    [token]
  );
  return rows[0] || null;
}

const RegisterSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  regNo: z.string().regex(/^RA[0-9]{13}$/i, 'Invalid registration number format').optional().or(z.literal('')).transform(v => v || null),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least 1 uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least 1 number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least 1 special character'),
});

// ─────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
    return;
  }

  const { name, password } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  // No institution-domain restriction: allow registration for any valid email

  // Check if user already exists
  const existing = await findUserByEmail(email);
  if (existing) {
    res.status(409).json({ error: 'User already exists' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const verificationToken = generateSecureToken();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  try {
    // Create unverified user
    await pool.query(
      'INSERT INTO User (id, name, email, password, role, regNo, verificationToken, verificationTokenExpiry) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, email, hashedPassword, 'TEACHER', parsed.data.regNo ?? null, verificationToken, verificationTokenExpiry]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (emailError) {
      console.error('[Register] Failed to send verification email:', emailError);
      // Delete the just-created user since email failed
      await pool.query('DELETE FROM User WHERE id = ?', [id]);
      res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      return;
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email to verify your account.',
    });
  } catch (error) {
    console.error('[Register] Error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// VERIFY EMAIL
// ─────────────────────────────────────────────────────────────
router.get('/verify-email', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Invalid verification link.' });
    return;
  }

  try {
    const user = await findUserByVerificationToken(token);

    if (!user) {
      res.status(400).json({ error: 'Invalid verification link.' });
      return;
    }

    // Check if token has expired
    if (!user.verificationTokenExpiry || new Date(user.verificationTokenExpiry) < new Date()) {
      // Delete unverified user to allow re-registration
      await pool.query('DELETE FROM User WHERE id = ?', [user.id]);
      res.status(400).json({ error: 'Verification link has expired. Please register again.' });
      return;
    }

    // Mark email as verified
    const now = new Date();
    await pool.query(
      'UPDATE User SET emailVerified = ?, verificationToken = NULL, verificationTokenExpiry = NULL WHERE id = ?',
      [now, user.id]
    );

    res.json({
      success: true,
      message: 'Email verified successfully! You can now log in.',
    });
  } catch (error) {
    console.error('[Verify Email] Error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// RESEND VERIFICATION EMAIL
// ─────────────────────────────────────────────────────────────
router.post('/resend-verification', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  // Rate limiting: max 3 attempts per hour
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const attempts = resendAttempts.get(email) || [];
  const recentAttempts = attempts.filter((t) => t > hourAgo);

  if (recentAttempts.length >= 3) {
    // Always return 200 to not leak user existence
    res.json({
      success: true,
      message: 'If that email is registered and unverified, a new verification link has been sent.',
    });
    return;
  }

  try {
    const user = await findUserByEmail(email);

    // Always return 200 (don't leak user existence)
    if (!user || user.emailVerified) {
      res.json({
        success: true,
        message: 'If that email is registered and unverified, a new verification link has been sent.',
      });
      return;
    }

    // Generate new token
    const verificationToken = generateSecureToken();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE User SET verificationToken = ?, verificationTokenExpiry = ? WHERE id = ?',
      [verificationToken, verificationTokenExpiry, user.id]
    );

    // Send verification email
    try {
      await sendVerificationEmail(email, verificationToken);

      // Track attempt
      recentAttempts.push(now);
      resendAttempts.set(email, recentAttempts);
    } catch (emailError) {
      console.error('[Resend Verification] Failed to send email:', emailError);
      res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      return;
    }

    res.json({
      success: true,
      message: 'If that email is registered and unverified, a new verification link has been sent.',
    });
  } catch (error) {
    console.error('[Resend Verification] Error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const { password } = parsed.data;
  const attemptKey = loginKey(req.ip, email);
  const now = Date.now();

  const existingAttempts = loginFailures.get(attemptKey);
  if (existingAttempts?.blockedUntil && now < existingAttempts.blockedUntil) {
    const waitMinutes = Math.ceil((existingAttempts.blockedUntil - now) / 60000);
    res.status(429).json({ error: `Too many failed login attempts. Try again in ${waitMinutes} minute(s).` });
    return;
  }

  // No institution-domain restriction: allow login attempts for any email

  try {
    const user = await findUserByEmail(email);
    if (!user || !user.password) {
      markFailedLogin(attemptKey, now);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if email is verified
    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Please verify your email before logging in. Check your email inbox.',
      });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      markFailedLogin(attemptKey, now);
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    clearLoginFailures(attemptKey);

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.name, email: user.email, image: user.image },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, regNo: null, role: user.role, image: user.image, isGhost: false },
    });
  } catch (error) {
    console.error('[Login] Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET USER (protected)
// ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const [rows] = await pool.query<Pick<DbUser, 'id' | 'name' | 'email' | 'role' | 'image'>>(
    'SELECT id, name, email, role, image FROM User WHERE id = ?',
    [userId]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const u = rows[0];
  res.json({ id: u.id, name: u.name, email: u.email, regNo: null, role: u.role, image: u.image, isGhost: false });
});

// ─────────────────────────────────────────────────────────────
// UPDATE PROFILE (protected)
// ─────────────────────────────────────────────────────────────
router.put('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ 
    name: z.string().min(1).max(100),
    image: z.string().url().optional(),
    regNo: z.string().regex(/^RA[0-9]{13}$/i, 'Invalid registration number format').optional().or(z.literal('')).transform((v) => v || null),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }
  await pool.query(
    'UPDATE User SET name = ?, image = COALESCE(?, image), regNo = ? WHERE id = ?', 
    [parsed.data.name, parsed.data.image || null, parsed.data.regNo ?? null, req.user!.userId]
  );
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// FORGOT PASSWORD
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email' });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();

  // No institution-domain restriction: allow password reset requests for any email

  try {
    const user = await findUserByEmail(email);

    // Always return 200 (don't leak user existence)
    if (!user) {
      res.status(200).json({
        success: true,
        message: 'If that email is registered, a password reset link has been sent.',
      });
      return;
    }

    // Generate reset token
    const resetToken = generateSecureToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE User SET resetToken = ?, resetTokenExpiry = ? WHERE id = ?',
      [resetToken, resetTokenExpiry, user.id]
    );

    // Send reset email
    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch (emailError) {
      console.error('[Forgot Password] Failed to send email:', emailError);
      res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
      return;
    }

    res.json({
      success: true,
      message: 'If that email is registered, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('[Forgot Password] Error:', error);
    res.status(500).json({ error: 'Failed to process forgot password request' });
  }
});

// ─────────────────────────────────────────────────────────────
// RESET PASSWORD
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = ResetPasswordSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid password',
      details: parsed.error.issues.map((i) => i.message),
    });
    return;
  }

  const { token, newPassword } = parsed.data;

  try {
    const user = await findUserByResetToken(token);

    if (!user) {
      res.status(400).json({ error: 'Invalid reset link.' });
      return;
    }

    // Check if token has expired
    if (!user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
      res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    // Update user: password, passwordChangedAt, and clear reset token
    await pool.query(
      'UPDATE User SET password = ?, passwordChangedAt = ?, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ?',
      [hashedPassword, now, user.id]
    );

    res.json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    console.error('[Reset Password] Error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

export default router;

// ─────────────────────────────────────────────────────────────
// GOOGLE SIGN-IN (ID token flow)
// Client obtains Google ID token and posts it here to create/lookup user and receive app JWT
// ─────────────────────────────────────────────────────────────
router.post('/google', async (req: Request, res: Response): Promise<void> => {
  const { idToken } = req.body || {};
  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'Missing idToken' });
    return;
  }

  try {
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID || undefined });
    } catch (verifyError) {
      console.error('[Google Sign-In] Token verification error:', verifyError);
      res.status(401).json({ error: 'Google token verification failed. Check your OAuth client ID and authorized origin.' });
      return;
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    const email = String(payload.email).toLowerCase();
    const name = String(payload.name || payload.email.split('@')[0]);
    const image = payload.picture || null;

    // Find or create user through Supabase REST
    let user = await findGoogleUserByEmail(email);
    if (!user) {
      const id = uuidv4();
      try {
        user = await createGoogleUser({ id, name, email, image });
      } catch (insertError) {
        console.error('[Google Sign-In] User insert error:', insertError);
        res.status(500).json({ error: 'Google sign-in failed while creating the user record.' });
        return;
      }
    } else if (user.role !== 'TEACHER') {
      try {
        await promoteGoogleUserToTeacher(user.id);
        user = { ...user, role: 'TEACHER' };
      } catch (promoteError) {
        console.error('[Google Sign-In] Failed to promote user to teacher:', promoteError);
      }
    }

    if (!user) {
      res.status(500).json({ error: 'Failed to create or fetch user' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, name: user.name, email: user.email, image: user.image },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, regNo: null, role: user.role, image: user.image, isGhost: false } });
  } catch (error) {
    console.error('[Google Sign-In] Error:', error);
    res.status(500).json({
      error: 'Google sign-in failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});
