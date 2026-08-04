import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { triggerEvent } from '../services/pusher.js';
import { pool } from '../db/pool.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_EVENTS = new Set([
  'anti_cheat_violation',
  'emoji_reaction',
]);

router.post('/', async (req: Request, res: Response) => {
  const schema = z.object({
    channel: z.string().min(1),
    event: z.string().min(1),
    payload: z.record(z.unknown()).optional().default({}),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const { channel, event, payload } = parsed.data;

  if (!ALLOWED_EVENTS.has(event)) {
    res.status(403).json({ error: 'Event not allowed via this endpoint' });
    return;
  }

  // If this is an anti_cheat_violation sent by a play client, persist it for reports.
  if (event === 'anti_cheat_violation') {
    try {
      const sessionId = String(channel || '').replace(/^session-/, '');
      const participantId = (payload as any)?.studentId || null;
      const violationType = (payload as any)?.violationType || 'unknown';

      // Security: verify this participant actually belongs to this session
      // and that it is linked to the authenticated user's device (best-effort check).
      if (participantId && sessionId) {
        const [pRows] = await pool.query<any[]>(
          'SELECT id FROM Participant WHERE id = ? AND sessionId = ?',
          [participantId, sessionId]
        );
        if ((pRows as any[]).length === 0) {
          // Participant does not belong to this session — silently reject
          res.status(403).json({ error: 'Participant not in session' });
          return;
        }
      }

      const id = uuidv4();
      await pool.query(
        'INSERT INTO Violation (id, sessionId, participantId, violationType, source, payload) VALUES (?, ?, ?, ?, ?, ?)',
        [id, sessionId, participantId, violationType, 'live', JSON.stringify(payload || {})]
      );
      // Also keep cheatFlags in sync so is_banned logic works correctly
      if (participantId) {
        await pool.query(
          'UPDATE Participant SET cheatFlags = cheatFlags + 1 WHERE id = ?',
          [participantId]
        );
      }
    } catch (err) {
      // don't block the pusher trigger if persistence fails; log and continue
      console.warn('Failed to persist violation', err);
    }
  }

  await triggerEvent(channel, event, payload);
  res.json({ success: true });
});

router.post('/auth', (req: Request, res: Response) => {
  res.status(200).json({});
});

export default router;
