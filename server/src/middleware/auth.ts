import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types/index.js';
import { pool } from '../db/pool.js';

export interface JWTPayload extends AuthUser {
  iat?: number;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    
    // Check if password was changed after token was issued
    const [rows] = await pool.query<{ passwordChangedAt: Date | string | null }>(
      'SELECT passwordChangedAt FROM User WHERE id = ?',
      [decoded.userId]
    );
    
    if (rows && rows.length > 0) {
      const user = rows[0];
      if (user.passwordChangedAt) {
        const passwordChangedAtMs = new Date(user.passwordChangedAt).getTime();
        const tokenIssuedAtMs = (decoded.iat || 0) * 1000;
        
        if (passwordChangedAtMs > tokenIssuedAtMs) {
          res.status(401).json({ error: 'Token invalidated after password change. Please log in again.' });
          return;
        }
      }
    }
    
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  // First run requireAuth
  await requireAuth(req, res, () => {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
      return;
    }
    next();
  });
}
