import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { triggerEvent } from '../services/pusher.js';
import { computeScore } from '../services/scoring.js';
import { DbQuestion, DbLiveSession, DbParticipant } from '../types/index.js';

const router = Router();
router.use(requireAuth);

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// GET /api/sessions/reports — teacher's session list
router.get('/reports', async (req: Request, res: Response) => {
  const teacherId = req.user!.userId;
  const [rows] = await pool.query<any[]>(
    `SELECT ls.*, q.title AS quizTitle
     FROM LiveSession ls
     LEFT JOIN Quiz q ON q.id = ls.quizId
     WHERE ls.teacherId = ? AND ls.deletedAt IS NULL
     ORDER BY ls.startedAt DESC`,
    [teacherId]
  );
  const sessionIds = (rows as any[]).map((r) => r.id);
  let participantMap: Record<string, any[]> = {};
  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(',');
    const [pRows] = await pool.query<any[]>(
      `SELECT id, sessionId, displayName, score, cheatFlags FROM Participant WHERE sessionId IN (${placeholders})`,
      sessionIds
    );
    // Fetch actual violation counts from Violation table — accurate source of truth.
    // cheatFlags is inflated by +10 for kick penalties, so we don't use it for display.
    const [vRows] = await pool.query<any[]>(
      `SELECT participantId, COUNT(*) as violationCount FROM Violation WHERE sessionId IN (${placeholders}) GROUP BY participantId`,
      sessionIds
    );
    const violationCountMap: Record<string, number> = {};
    for (const v of vRows as any[]) {
      violationCountMap[v.participantId] = Number(v.violationCount);
    }
    for (const p of pRows as any[]) {
      if (!participantMap[p.sessionId]) participantMap[p.sessionId] = [];
      participantMap[p.sessionId].push({
        id: p.id, displayName: p.displayName, display_name: p.displayName,
        score: p.score,
        cheatFlags: violationCountMap[p.id] || 0,
        cheat_flags: violationCountMap[p.id] || 0,
      });
    }
  }

  const sessions = (rows as any[]).map((s) => ({
    id: s.id,
    status: s.status,
    started_at: s.startedAt,
    finished_at: s.finishedAt,
    join_code: s.joinCode,
    quizzes: s.quizTitle ? { title: s.quizTitle } : null,
    participants: participantMap[s.id] || [],
  }));
  res.json(sessions);
});

// GET /api/sessions/history — student game history
router.get('/history', async (req: Request, res: Response) => {
  const { deviceUuid } = req.query as { deviceUuid?: string };
  const userId = req.user!.userId;
  let rows: any[] = [];

  if (deviceUuid) {
    const [r] = await pool.query<any[]>(
      `SELECT p.*, ls.quizId, q.title AS quizTitle
       FROM Participant p
       JOIN LiveSession ls ON ls.id = p.sessionId
       JOIN Quiz q ON q.id = ls.quizId
       WHERE p.deviceUuid = ?
       ORDER BY p.joinedAt DESC LIMIT 20`,
      [deviceUuid]
    );
    rows = r as any[];
  }

  if (rows.length === 0) {
    const [userRows] = await pool.query<any[]>('SELECT name FROM User WHERE id = ?', [userId]);
    const userName = (userRows as any[])[0]?.name;
    if (userName) {
      const [r] = await pool.query<any[]>(
        `SELECT p.*, ls.quizId, q.title AS quizTitle
         FROM Participant p
         JOIN LiveSession ls ON ls.id = p.sessionId
         JOIN Quiz q ON q.id = ls.quizId
         WHERE p.displayName = ?
         ORDER BY p.joinedAt DESC LIMIT 20`,
        [userName]
      );
      rows = r as any[];
    }
  }

  if (rows.length === 0) { res.json([]); return; }

  const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
  const placeholders = sessionIds.map(() => '?').join(',');
  const [allParticipants] = await pool.query<any[]>(
    `SELECT id, sessionId, score FROM Participant WHERE sessionId IN (${placeholders})`,
    sessionIds
  );

  const rankBySession: Record<string, Record<string, number>> = {};
  const grouped: Record<string, { id: string; score: number }[]> = {};
  for (const p of allParticipants as any[]) {
    if (!grouped[p.sessionId]) grouped[p.sessionId] = [];
    grouped[p.sessionId].push({ id: p.id, score: p.score });
  }
  for (const [sid, players] of Object.entries(grouped)) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    rankBySession[sid] = {};
    sorted.forEach((p, i) => { rankBySession[sid][p.id] = i + 1; });
  }

  const history = rows.map((p) => ({
    id: p.id,
    score: p.score,
    session_id: p.sessionId,
    joined_at: p.joinedAt,
    device_uuid: p.deviceUuid,
    display_name: p.displayName,
    live_sessions: p.quizTitle ? { quizzes: { title: p.quizTitle } } : null,
    rank: rankBySession[p.sessionId]?.[p.id],
  }));
  res.json(history);
});

// POST /api/sessions — teacher creates session
router.post('/', async (req: Request, res: Response) => {
  const schema = z.object({
    quizId: z.string().uuid(),
    mode: z.enum(['NORMAL', 'UNANIMOUS']).optional().default('NORMAL'),
    timedScoring: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const [quizRows] = await pool.query<any[]>('SELECT id FROM Quiz WHERE id = ? AND teacherId = ?', [parsed.data.quizId, req.user!.userId]);
  if ((quizRows as any[]).length === 0) { res.status(403).json({ error: 'Quiz not found or unauthorized' }); return; }

  const id = uuidv4();
  const joinCode = generateJoinCode();
  await pool.query(
    'INSERT INTO LiveSession (id, joinCode, quizId, teacherId, status, currentQuestionIndex, mode, timedScoring) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, joinCode, parsed.data.quizId, req.user!.userId, 'WAITING', 0, parsed.data.mode, parsed.data.timedScoring ? 1 : 0]
  );
  res.status(201).json({ id, joinCode });
});

// GET /api/sessions/by-code/:joinCode — get session by join code (for student join)
router.get('/by-code/:joinCode', async (req: Request, res: Response) => {
  const joinCode = String(req.params.joinCode || '');
  const [rows] = await pool.query<any[]>(
    'SELECT id, joinCode, status, currentQuestionIndex, timedScoring FROM LiveSession WHERE joinCode = ?',
    [joinCode.toUpperCase()]
  );
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Invalid room code' }); return; }
  const session = (rows as any[])[0];
  res.json({
    ...session,
    timedScoring: session.timedScoring !== 0
  });
});

// GET /api/sessions/:id — get full session (teacher view)
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<any[]>(
    `SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ? AND ls.deletedAt IS NULL`,
    [id]
  );
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = (rows as any[])[0];
  if (session.teacherId !== req.user!.userId) { res.status(403).json({ error: 'Unauthorized' }); return; }

  const [qRows] = await pool.query<any[]>(
    'SELECT * FROM Question WHERE quizId = ? ORDER BY orderIndex ASC',
    [session.quizId]
  );
  const questions = (qRows as any[]).map((q) => ({
    id: q.id,
    question_text: q.questionText,
    questionText: q.questionText,
    question_type: q.questionType,
    questionType: q.questionType,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    time_limit: q.timeLimit,
    timeLimit: q.timeLimit,
    base_points: q.basePoints,
    basePoints: q.basePoints,
    order_index: q.orderIndex,
    orderIndex: q.orderIndex,
    image_url: q.imageUrl || null,
    imageUrl: q.imageUrl || null,
  }));

  const [pRows] = await pool.query<any[]>(
    'SELECT * FROM Participant WHERE sessionId = ?',
    [id]
  );

  res.json({
    id: session.id, joinCode: session.joinCode, quizId: session.quizId,
    teacherId: session.teacherId, status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    mode: session.mode ?? 'NORMAL',
    timedScoring: session.timedScoring !== 0,
    startedAt: session.startedAt, finishedAt: session.finishedAt,
    quiz: { title: session.quizTitle, questions },
    participants: (pRows as any[]).map((p) => ({
      id: p.id, sessionId: p.sessionId, deviceUuid: p.deviceUuid,
      displayName: p.displayName, regNo: p.regNo, score: p.score, streak: p.streak,
      cheatFlags: p.cheatFlags, lastActive: p.lastActive, joinedAt: p.joinedAt,
    })),
  });
});

// POST /api/sessions/:id/join — student joins session
router.post('/:id/join', async (req: Request, res: Response) => {
  const schema = z.object({ joinCode: z.string(), displayName: z.string().min(1).max(50), regNo: z.string().optional().nullable(), deviceUuid: z.string(), consentAt: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const { joinCode, displayName, regNo, deviceUuid, consentAt } = parsed.data;
  const [rows] = await pool.query<DbLiveSession>(
    'SELECT * FROM LiveSession WHERE joinCode = ?',
    [joinCode.toUpperCase()]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Invalid room code' }); return; }
  const session = rows[0];
  if (session.status === 'FINISHED') { res.status(400).json({ error: 'Session has already ended' }); return; }

  const [existing] = await pool.query<DbParticipant>(
    'SELECT * FROM Participant WHERE sessionId = ? AND deviceUuid = ?',
    [session.id, deviceUuid]
  );

  let participant: DbParticipant;
  const consentDate = consentAt ? new Date(consentAt) : null;
  const normalizedRegNo = regNo?.trim().toUpperCase() || null;

  if (existing.length > 0) {
    await pool.query(
      'UPDATE Participant SET displayName = ?, regNo = ?, lastActive = NOW(), consentAt = ? WHERE id = ?',
      [displayName, normalizedRegNo, consentDate, existing[0].id]
    );
    const [updated] = await pool.query<DbParticipant>('SELECT * FROM Participant WHERE id = ?', [existing[0].id]);
    participant = updated[0];
  } else {
    const pId = uuidv4();
    await pool.query(
      'INSERT INTO Participant (id, sessionId, deviceUuid, displayName, regNo, consentAt) VALUES (?, ?, ?, ?, ?, ?)',
      [pId, session.id, deviceUuid, displayName, normalizedRegNo, consentDate]
    );
    const [inserted] = await pool.query<DbParticipant>('SELECT * FROM Participant WHERE id = ?', [pId]);
    participant = inserted[0];
  }

  await triggerEvent(`session-${session.id}`, 'participant-join', {
    id: participant.id, display_name: participant.displayName, regNo: participant.regNo,
    score: participant.score, streak: participant.streak,
    cheat_flags: participant.cheatFlags, device_uuid: participant.deviceUuid,
  });

  res.json({ sessionId: session.id, participantId: participant.id });
});

// GET /api/sessions/:id/play-data — student's view of session
router.get('/:id/play-data', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { deviceUuid } = req.query as { deviceUuid: string };

  const [sessionRows] = await pool.query<any>(
    `SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ?`,
    [id]
  );
  if (sessionRows.length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = sessionRows[0];

  const [pRows] = await pool.query<DbParticipant>(
    'SELECT * FROM Participant WHERE sessionId = ? AND deviceUuid = ?',
    [id, deviceUuid]
  );
  if (pRows.length === 0) { res.status(404).json({ error: 'Participant not found' }); return; }
  const participant = pRows[0];

  const [qRows] = await pool.query<any>(
    'SELECT * FROM Question WHERE quizId = ? ORDER BY orderIndex ASC',
    [session.quizId]
  );
  const questions = qRows.map((q) => ({
    id: q.id, questionText: q.questionText, question_text: q.questionText,
    questionType: q.questionType, question_type: q.questionType,
    options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
    timeLimit: q.timeLimit, time_limit: q.timeLimit,
    basePoints: q.basePoints, base_points: q.basePoints,
    orderIndex: q.orderIndex, order_index: q.orderIndex,
    image_url: q.imageUrl || null, imageUrl: q.imageUrl || null,
  }));

  await triggerEvent(`session-${id}`, 'participant-join', {
    id: participant.id, display_name: participant.displayName,
    score: participant.score, streak: participant.streak,
    cheat_flags: participant.cheatFlags, device_uuid: participant.deviceUuid,
  });

  res.json({
    liveSession: {
      id: session.id, joinCode: session.joinCode, quizId: session.quizId,
      status: session.status, currentQuestionIndex: session.currentQuestionIndex,
      join_code: session.joinCode, current_question_index: session.currentQuestionIndex,
      timedScoring: session.timedScoring !== 0,
      mode: session.mode ?? 'NORMAL',
      quiz: { title: session.quizTitle, questions },
    },
    participant: {
      id: participant.id, displayName: participant.displayName,
      score: participant.score, streak: participant.streak, cheatFlags: participant.cheatFlags,
    },
  });
});

// POST /api/sessions/:id/start
router.post('/:id/start', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<DbLiveSession & { timedScoring: number }>('SELECT teacherId, quizId, timedScoring FROM LiveSession WHERE id = ?', [id]);
  if (rows.length === 0 || rows[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }
  await pool.query(
    "UPDATE LiveSession SET status='ACTIVE', startedAt=NOW() WHERE id = ?",
    [id]
  );
  const timedScoring = rows[0].timedScoring !== 0;
  await triggerEvent(`session-${id}`, 'session-update', { status: 'ACTIVE', timedScoring });
  res.json({ success: true });
});

// POST /api/sessions/:id/next — advance question or finish
router.post('/:id/next', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({ nextQuestionIndex: z.number().int().min(0), isLast: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const [rows] = await pool.query<DbLiveSession & { timedScoring: number }>('SELECT teacherId, quizId, timedScoring FROM LiveSession WHERE id = ?', [id]);
  if (rows.length === 0 || rows[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }
  const timedScoring = rows[0].timedScoring !== 0;

  const { nextQuestionIndex, isLast } = parsed.data;

  try {
    await triggerEvent(`session-${id}`, 'reveal_answer', { questionIndex: nextQuestionIndex - 1 });
    await new Promise((r) => setTimeout(r, 1400));

    if (isLast) {
      await pool.query("UPDATE LiveSession SET status='FINISHED', finishedAt=NOW() WHERE id = ?", [id]);
      await triggerEvent(`session-${id}`, 'session-update', { status: 'FINISHED' });
    } else {
      // fetch the question's time limit for the next question
      const [qRow] = await pool.query<{ timeLimit: number }>('SELECT timeLimit FROM Question WHERE quizId = ? ORDER BY orderIndex ASC LIMIT 1 OFFSET ?', [rows[0].quizId, nextQuestionIndex]);
      const timeLimitVal = qRow[0]?.timeLimit ?? 30;

      const startedAt = new Date();
      await pool.query('UPDATE LiveSession SET currentQuestionIndex = ?, currentQuestionStartedAt = ? WHERE id = ?', [nextQuestionIndex, startedAt, id]);
      await triggerEvent(`session-${id}`, 'session-update', {
        status: 'ACTIVE', current_question_index: nextQuestionIndex, questionStartedAt: startedAt.toISOString(), timeLimitSeconds: timeLimitVal, timedScoring,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Next] Failed to advance question:', err);
    // Always respond so the host client can reset its loading state.
    if (!res.headersSent) res.status(500).json({ error: 'Failed to advance question' });
  }
});

// POST /api/sessions/:id/finish
router.post('/:id/finish', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<any[]>('SELECT teacherId FROM LiveSession WHERE id = ?', [id]);
  if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }
  // Finalize session: mark live session finished and persist participant final scores.
  try {
    await pool.query('START TRANSACTION');
    await pool.query("UPDATE LiveSession SET status='FINISHED', finishedAt=NOW() WHERE id = ?", [id]);
    // Persist final scores and mark participants as SUBMITTED
    await pool.query("UPDATE Participant SET status = 'SUBMITTED', submittedAt = NOW(), finalScore = score WHERE sessionId = ?", [id]);
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    console.error('[Finish] Transaction error:', e);
    res.status(500).json({ error: 'Failed to finalize session' });
    return;
  }
  await triggerEvent(`session-${id}`, 'terminate_session', {});
  await triggerEvent(`session-${id}`, 'session-update', { status: 'FINISHED' });
  res.json({ success: true });
});

// POST /api/sessions/:id/submit — student submits answer
router.post('/:id/submit', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({
    participantId: z.string().uuid(),
    questionId: z.string().uuid(),
    reactionTimeMs: z.number().int().min(0),
    selectedTexts: z.array(z.string()),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const { participantId, questionId, reactionTimeMs, selectedTexts } = parsed.data;

  const [pRows] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ? AND sessionId = ?', [participantId, id]);
  if ((pRows as any[]).length === 0) { res.status(404).json({ error: 'Participant not found' }); return; }
  const participant = (pRows as any[])[0];

  // Prevent re-attempts if participant has already submitted or is disqualified
  if (participant.status === 'SUBMITTED' || participant.status === 'DISQUALIFIED') {
    res.status(403).json({ error: 'Participant has already submitted or is disqualified' });
    return;
  }

  const [qRows] = await pool.query<any[]>('SELECT * FROM Question WHERE id = ?', [questionId]);
  if ((qRows as any[]).length === 0) { res.status(404).json({ error: 'Question not found' }); return; }
  const question = (qRows as any[])[0];
  const options = typeof question.options === 'string' ? JSON.parse(question.options) : question.options;

  // Enforce server-side time limit only when timed scoring is active
  try {
    const [sessRows] = await pool.query<any[]>('SELECT currentQuestionStartedAt, timedScoring FROM LiveSession WHERE id = ?', [id]);
    const sessionRow = (sessRows as any[])[0];
    const isTimedScoring = sessionRow?.timedScoring !== 0;
    if (isTimedScoring && sessionRow?.currentQuestionStartedAt) {
      const started = new Date(sessionRow.currentQuestionStartedAt).getTime();
      const now = Date.now();
      const timeLimit = Number(question.timeLimit) || 30;
      if ((now - started) / 1000 > timeLimit + 1) { // allow 1s grace
        res.status(410).json({ error: 'Time limit exceeded for this question' });
        return;
      }
    }
  } catch (e) { /* non-fatal: continue */ }

  // Check for duplicate submission
  const [dupRows] = await pool.query<any[]>(
    'SELECT id FROM StudentResponse WHERE participantId = ? AND questionId = ?',
    [participantId, questionId]
  );
  if ((dupRows as any[]).length > 0) { res.status(400).json({ error: 'Already submitted' }); return; }

  const { isCorrect, pointsAwarded, streakBonus } = computeScore(
    selectedTexts,
    options,
    question.basePoints || 100,
    participant.streak || 0,
    question.questionType || question.question_type || 'mcq'
  );

  const responseId = uuidv4();
  await pool.query(
    `INSERT INTO StudentResponse (id, sessionId, participantId, questionId, reactionTimeMs, selectedTexts, isCorrect, pointsAwarded, streakBonus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [responseId, id, participantId, questionId, reactionTimeMs, JSON.stringify(selectedTexts || []), isCorrect ? 1 : 0, pointsAwarded, streakBonus]
  );

  await pool.query(
    `UPDATE Participant SET
       score = score + ?,
       streak = IF(?, streak + 1, 0),
       lastActive = NOW()
     WHERE id = ?`,
    [pointsAwarded + streakBonus, isCorrect ? 1 : 0, participantId]
  );

  // If participant has answered all questions, they'll submit later explicitly; we don't auto-mark SUBMITTED here.

  const [updated] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ?', [participantId]);
  const updatedP = (updated as any[])[0];

  await triggerEvent(`session-${id}`, 'participant-update', {
    id: updatedP.id, display_name: updatedP.displayName,
    score: updatedP.score, streak: updatedP.streak, cheat_flags: updatedP.cheatFlags,
  });
  await triggerEvent(`session-${id}`, 'student-submission', { questionId });

  // ── UNANIMOUS MODE AUTO-ADVANCE ──────────────────────────────────────────────
  // If the session is in UNANIMOUS mode, check whether ALL active participants
  // have now submitted an answer for the current question. If so, automatically
  // advance to the next question (or end the session if it's the last one).
  try {
    const [sessionCheckRows] = await pool.query<any[]>(
      'SELECT mode, currentQuestionIndex, quizId FROM LiveSession WHERE id = ? AND status = \'ACTIVE\'',
      [id]
    );
    const currentSession = (sessionCheckRows as any[])[0];
    if (currentSession?.mode === 'UNANIMOUS') {
      const [totalParticipantsRows] = await pool.query<any[]>(
        'SELECT COUNT(*) AS cnt FROM Participant WHERE sessionId = ? AND cheatFlags < 10',
        [id]
      );
      const totalParticipants = Number((totalParticipantsRows as any[])[0].cnt);

      const [submissionsRows] = await pool.query<any[]>(
        'SELECT COUNT(*) AS cnt FROM StudentResponse WHERE sessionId = ? AND questionId = ?',
        [id, questionId]
      );
      const submissionsForQ = Number((submissionsRows as any[])[0].cnt);

      if (totalParticipants > 0 && submissionsForQ >= totalParticipants) {
        // All players answered — auto-advance
        const [qCountRows] = await pool.query<any[]>(
          'SELECT COUNT(*) AS cnt FROM Question WHERE quizId = ?',
          [currentSession.quizId]
        );
        const totalQuestions = Number((qCountRows as any[])[0].cnt);
        const nextIndex = currentSession.currentQuestionIndex + 1;
        const isLast = nextIndex >= totalQuestions;

        // Brief delay for answer reveal animation
        await new Promise((r) => setTimeout(r, 1400));
        await triggerEvent(`session-${id}`, 'reveal_answer', { questionIndex: currentSession.currentQuestionIndex });
        await new Promise((r) => setTimeout(r, 1400));

        if (isLast) {
          await pool.query("UPDATE LiveSession SET status='FINISHED', finishedAt=NOW() WHERE id = ?", [id]);
          await triggerEvent(`session-${id}`, 'session-update', { status: 'FINISHED' });
        } else {
          // fetch next question time limit and broadcast start timestamp
          const [qRow2] = await pool.query<any[]>('SELECT timeLimit FROM Question WHERE quizId = ? ORDER BY orderIndex ASC LIMIT 1 OFFSET ?', [currentSession.quizId, nextIndex]);
          const tl = (qRow2 as any[])[0]?.timeLimit ?? 30;
          await pool.query('UPDATE LiveSession SET currentQuestionIndex = ? WHERE id = ?', [nextIndex, id]);
          const startedAt2 = new Date().toISOString();
          await triggerEvent(`session-${id}`, 'session-update', { status: 'ACTIVE', current_question_index: nextIndex, questionStartedAt: startedAt2, timeLimitSeconds: tl });
        }
      }
    }
  } catch (unanimousErr) {
    // Non-fatal: log and continue. We never want the submit response to fail because of unanimous logic.
    console.error('[Unanimous] Auto-advance error:', unanimousErr);
  }
  // ── END UNANIMOUS ────────────────────────────────────────────────────────────

  res.json({ isCorrect, pointsAwarded, streakBonus, newScore: updatedP.score, newStreak: updatedP.streak });
});

// POST /api/sessions/:id/flag-cheat
router.post('/:id/flag-cheat', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({ participantId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  await pool.query('UPDATE Participant SET cheatFlags = cheatFlags + 1 WHERE id = ?', [parsed.data.participantId]);
  const [rows] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ?', [parsed.data.participantId]);
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  const p = (rows as any[])[0];

  await triggerEvent(`session-${id}`, 'participant-update', {
    id: p.id, display_name: p.displayName, score: p.score, streak: p.streak, cheat_flags: p.cheatFlags,
  });
  res.json({ success: true });
});

// POST /api/sessions/:id/kick
router.post('/:id/kick', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({ participantId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const [rows] = await pool.query<any[]>('SELECT teacherId FROM LiveSession WHERE id = ?', [id]);
  if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }

  await pool.query('UPDATE Participant SET cheatFlags = cheatFlags + 10 WHERE id = ?', [parsed.data.participantId]);
  await triggerEvent(`session-${id}`, 'kick_player', { targetId: parsed.data.participantId });
  await triggerEvent(`session-${id}`, 'participant-leave', { id: parsed.data.participantId });
  res.json({ success: true });
});

// DELETE /api/sessions/:id/leave
router.delete('/:id/leave', async (req: Request, res: Response) => {
  const { id } = req.params;
  const schema = z.object({ participantId: z.string().uuid(), reason: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const [rows] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ?', [parsed.data.participantId]);
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Participant not found' }); return; }
  const p = (rows as any[])[0];

  if (parsed.data.reason) {
    await triggerEvent(`session-${id}`, 'anti_cheat_violation', {
      studentName: p.displayName, studentId: p.id, violationType: parsed.data.reason,
    });
  }
  await pool.query('DELETE FROM Participant WHERE id = ?', [parsed.data.participantId]);
  await triggerEvent(`session-${id}`, 'participant-leave', { id: parsed.data.participantId });
  res.json({ success: true });
});

// GET /api/sessions/:id/submission-count
router.get('/:id/submission-count', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { questionId } = req.query as { questionId: string };
  if (!questionId) { res.status(400).json({ error: 'questionId required' }); return; }
  const [rows] = await pool.query<any[]>(
    'SELECT COUNT(*) AS cnt FROM StudentResponse WHERE sessionId = ? AND questionId = ?',
    [id, questionId]
  );
  res.json({ count: Number((rows as any[])[0].cnt) });
});

// GET /api/sessions/:id/answered — student's already-answered question IDs (for reload safety)
router.get('/:id/answered', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantId } = req.query as { participantId: string };
  if (!participantId) { res.status(400).json({ error: 'participantId required' }); return; }

  // Verify the participant belongs to this session (ownership check)
  const [pRows] = await pool.query<any[]>(
    'SELECT id FROM Participant WHERE id = ? AND sessionId = ?',
    [participantId, id]
  );
  if ((pRows as any[]).length === 0) { res.status(403).json({ error: 'Participant not found in this session' }); return; }

  const [rows] = await pool.query<any[]>(
    'SELECT questionId FROM StudentResponse WHERE sessionId = ? AND participantId = ?',
    [id, participantId]
  );
  res.json({ questionIds: (rows as any[]).map((r) => r.questionId) });
});

// GET /api/sessions/:id/state — single source of truth for participant on reload
router.get('/:id/state', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantId } = req.query as { participantId?: string };
  if (!participantId) { res.status(400).json({ error: 'participantId required' }); return; }

  const [pRows] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ? AND sessionId = ?', [participantId, id]);
  if ((pRows as any[]).length === 0) { res.status(404).json({ error: 'Participant not found in this session' }); return; }
  const participant = (pRows as any[])[0];

  const [sRows] = await pool.query<any[]>('SELECT * FROM LiveSession WHERE id = ?', [id]);
  if ((sRows as any[]).length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = (sRows as any[])[0];

  const [answered] = await pool.query<any[]>('SELECT questionId FROM StudentResponse WHERE sessionId = ? AND participantId = ?', [id, participantId]);
  const questionIds = (answered as any[]).map((r) => r.questionId);

  res.json({
    sessionStatus: session.status,
    participantStatus: participant.status,
    currentQuestionIndex: session.currentQuestionIndex,
    answeredQuestionIds: questionIds,
    timeRemaining: null,
    submittedAt: participant.submittedAt || null,
  });
});

// DELETE /api/sessions/:id — teacher deletes a finished session report
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<any[]>('SELECT teacherId, status FROM LiveSession WHERE id = ?', [id]);
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = (rows as any[])[0];
  if (session.teacherId !== req.user!.userId) { res.status(403).json({ error: 'Unauthorized' }); return; }
  if (session.status === 'ACTIVE') { res.status(400).json({ error: 'Cannot delete an active session. End the session first.' }); return; }
  // Soft-delete: set deletedAt timestamp so analytics remain auditable but hidden
  await pool.query('UPDATE LiveSession SET deletedAt = NOW() WHERE id = ?', [id]);
  res.json({ success: true });
});

// GET /api/sessions/:id/report — full analytics
router.get('/:id/report', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [sessionRows] = await pool.query<any[]>(
    'SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ? AND ls.deletedAt IS NULL',
    [id]
  );
  if ((sessionRows as any[]).length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = (sessionRows as any[])[0];
  if (session.teacherId !== req.user!.userId) { res.status(403).json({ error: 'Unauthorized' }); return; }

  const [[participants], [responses], [questions]] = await Promise.all([
    pool.query<any[]>('SELECT * FROM Participant WHERE sessionId = ?', [id]),
    pool.query<any[]>(
      'SELECT questionId, participantId, isCorrect FROM StudentResponse WHERE sessionId = ?', [id]
    ),
    pool.query<any[]>(
      'SELECT id, questionText, orderIndex FROM Question WHERE quizId = ? ORDER BY orderIndex ASC',
      [session.quizId]
    ),
  ]);

  // Fetch persisted violation logs for session and attach to participants
  const [violationRows] = await pool.query<any[]>(
    'SELECT id, participantId, violationType, createdAt FROM Violation WHERE sessionId = ? ORDER BY createdAt DESC',
    [id]
  );

  const displayNames = (participants as any[]).map(p => p.displayName);
  let usersMap: Record<string, any> = {};
  if (displayNames.length > 0) {
    const placeholders = displayNames.map(() => '?').join(',');
    const [userRows] = await pool.query<any[]>(
      `SELECT name, email, regNo FROM User WHERE name IN (${placeholders})`,
      displayNames
    );
    for (const u of userRows as any[]) {
      usersMap[u.name] = u;
    }
  }

  res.json({
    session: { id: session.id, quiz: { title: session.quizTitle }, finishedAt: session.finishedAt },
    participants: (participants as any[]).map((p) => {
      const matchedUser = usersMap[p.displayName] || {};
      return {
        id: p.id, displayName: p.displayName, regNo: p.regNo || matchedUser.regNo || null, score: p.score,
        cheatFlags: p.cheatFlags, isBanned: p.cheatFlags >= 10,
        violationLogs: (violationRows as any[])
          .filter((v) => v.participantId === p.id)
          .map((v) => ({ type: v.violationType, timestamp: v.createdAt })),
      };
    }),
    responses: (responses as any[]).map((r) => ({
      questionId: r.questionId, participantId: r.participantId, isCorrect: r.isCorrect === 1,
    })),
    questions: (questions as any[]).map((q) => ({
      id: q.id, questionText: q.questionText, orderIndex: q.orderIndex,
    })),
  });
});

// GET /api/sessions/:id/result — participant-facing final result view
router.get('/:id/result', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { participantId } = req.query as { participantId?: string };
  if (!participantId) { res.status(400).json({ error: 'participantId required' }); return; }

  const [pRows] = await pool.query<any[]>('SELECT * FROM Participant WHERE id = ? AND sessionId = ?', [participantId, id]);
  if ((pRows as any[]).length === 0) { res.status(404).json({ error: 'Participant not found in this session' }); return; }
  const participant = (pRows as any[])[0];

  const [sessionRows] = await pool.query<any[]>('SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ?', [id]);
  if ((sessionRows as any[]).length === 0) { res.status(404).json({ error: 'Session not found' }); return; }
  const session = (sessionRows as any[])[0];

  const [responses] = await pool.query<any[]>('SELECT * FROM StudentResponse WHERE sessionId = ? AND participantId = ?', [id, participantId]);
  const [participants] = await pool.query<any[]>('SELECT id, displayName, score, finalScore FROM Participant WHERE sessionId = ? ORDER BY score DESC', [id]);

  // compute rank
  const rank = (participants as any[]).findIndex((p) => p.id === participantId) + 1;

  res.json({
    session: { id: session.id, quizTitle: session.quizTitle, status: session.status, finishedAt: session.finishedAt },
    participant: { id: participant.id, displayName: participant.displayName, score: participant.score, finalScore: participant.finalScore, submittedAt: participant.submittedAt, status: participant.status, rank },
    responses: (responses as any[]).map((r) => ({ questionId: r.questionId, selectedTexts: r.selectedTexts ? JSON.parse(r.selectedTexts) : [], isCorrect: r.isCorrect === 1, pointsAwarded: r.pointsAwarded })),
    leaderboard: (participants as any[]).map((p, i) => ({ rank: i + 1, id: p.id, displayName: p.displayName, score: p.score, finalScore: p.finalScore })),
  });
});

// GET /api/sessions/:id/leaderboard
router.get('/:id/leaderboard', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<any[]>(
    'SELECT id, displayName, score, streak, cheatFlags FROM Participant WHERE sessionId = ? ORDER BY score DESC',
    [id]
  );
  res.json((rows as any[]).map((p) => ({
    id: p.id, display_name: p.displayName, score: p.score, streak: p.streak, cheat_flags: p.cheatFlags,
  })));
});

// GET /api/sessions/:id/report.xlsx — Export full analytics as Excel
router.get('/:id/report.xlsx', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [sessionRows] = await pool.query<any[]>(
    'SELECT ls.*, q.title AS quizTitle FROM LiveSession ls JOIN Quiz q ON q.id = ls.quizId WHERE ls.id = ? AND ls.deletedAt IS NULL',
    [id]
  );
  if ((sessionRows as any[]).length === 0) { res.status(404).send('Session not found'); return; }
  const session = (sessionRows as any[])[0];
  if (session.teacherId !== req.user!.userId) { res.status(403).send('Unauthorized'); return; }

  const [[participants], [responses], [questions], [violations]] = await Promise.all([
    pool.query<any[]>('SELECT * FROM Participant WHERE sessionId = ?', [id]),
    pool.query<any[]>('SELECT * FROM StudentResponse WHERE sessionId = ?', [id]),
    pool.query<any[]>('SELECT id, questionText, orderIndex, options FROM Question WHERE quizId = ? ORDER BY orderIndex ASC', [session.quizId]),
    pool.query<any[]>('SELECT * FROM Violation WHERE sessionId = ? ORDER BY createdAt DESC', [id]),
  ]);

  const pRows = participants as any[];
  const rRows = responses as any[];
  const qRows = questions as any[];
  const vRows = violations as any[];

  const displayNames = pRows.map(p => p.displayName);
  let usersMap: Record<string, any> = {};
  if (displayNames.length > 0) {
    const placeholders = displayNames.map(() => '?').join(',');
    const [userRows] = await pool.query<any[]>(
      `SELECT name, email, regNo FROM User WHERE name IN (${placeholders})`,
      displayNames
    );
    for (const u of userRows as any[]) {
      usersMap[u.name] = u;
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LevelNLearn';
  workbook.created = new Date();

  // helper: style header row, freeze it, and autofit columns
  function styleHeaderAndFreeze(sheet: ExcelJS.Worksheet, headerFillColor = 'FFEEF2FF') {
    const header = sheet.getRow(1);
    header.font = { bold: true } as any;
    header.alignment = { vertical: 'middle', horizontal: 'left' } as any;
    header.height = 22;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerFillColor } } as any;
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
      } as any;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  function autofitColumns(sheet: ExcelJS.Worksheet) {
    sheet.columns!.forEach((col) => {
      let maxLength = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const val = cell.value;
        let text = '';
        if (val === null || val === undefined) text = '';
        else if (typeof val === 'string') text = val;
        else if (typeof val === 'number') text = String(val);
        else if (val instanceof Date) text = val.toLocaleString();
        else text = JSON.stringify(val).slice(0, 200);
        maxLength = Math.max(maxLength, Math.min(50, text.length + 2));
      });
      col.width = maxLength;
    });
  }

  // --- Sheet 1: Summary ---
  const summarySheet = workbook.addWorksheet('Summary');
  const totalParticipants = pRows.length;
  const scores = pRows.map(p => Number(p.score) || 0);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highestScore = scores.length ? Math.max(...scores) : 0;
  const lowestScore = scores.length ? Math.min(...scores) : 0;

  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 25 },
    { header: 'Value', key: 'value', width: 40 },
  ];
  summarySheet.addRows([
    { metric: 'Quiz Title', value: session.quizTitle },
    { metric: 'Date', value: session.startedAt ? new Date(session.startedAt).toLocaleString() : 'N/A' },
    { metric: 'Total Participants', value: totalParticipants },
    { metric: 'Average Score', value: avgScore.toFixed(2) },
    { metric: 'Highest Score', value: highestScore },
    { metric: 'Lowest Score', value: lowestScore },
  ]);
  styleHeaderAndFreeze(summarySheet, 'FFDDEEF8');
  autofitColumns(summarySheet);

  // --- Sheet 2: Participants ---
  const participantsSheet = workbook.addWorksheet('Participants');
  participantsSheet.columns = [
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Reg No', key: 'regNo', width: 15 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Score', key: 'score', width: 10 },
    { header: 'Correct/Total', key: 'correctTotal', width: 15 },
    { header: 'Violations', key: 'violations', width: 12 },
    { header: 'Violation Details', key: 'violationDetails', width: 50 },
  ];

  for (const p of pRows) {
    const pRes = rRows.filter(r => r.participantId === p.id);
    const correctCount = pRes.filter(r => r.isCorrect).length;
    const pViolations = vRows.filter(v => v.participantId === p.id);
    const violationCount = pViolations.length;
    const violationDetails = pViolations.map(v => v.violationType).join(', ');
    const matchedUser = usersMap[p.displayName] || {};

    participantsSheet.addRow({
      name: p.displayName,
      regNo: p.regNo || matchedUser.regNo || 'N/A',
      email: matchedUser.email || 'N/A',
      score: p.score,
      correctTotal: `${correctCount} / ${qRows.length}`,
      violations: violationCount,
      violationDetails: violationDetails,
    });
  }
  styleHeaderAndFreeze(participantsSheet, 'FFF6F9E9');
  autofitColumns(participantsSheet);

  // --- Sheet 3: Question Analysis ---
  const qAnalysisSheet = workbook.addWorksheet('Question Analysis');
  qAnalysisSheet.columns = [
    { header: 'Q#', key: 'qNum', width: 5 },
    { header: 'Question Text', key: 'qText', width: 50 },
    { header: '% Correct', key: 'pctCorrect', width: 12 },
    { header: 'Most Picked Wrong Answer', key: 'wrongAnswer', width: 40 },
  ];

  for (const q of qRows) {
    const qRes = rRows.filter(r => r.questionId === q.id);
    const attempts = qRes.length;
    const correctCount = qRes.filter(r => r.isCorrect).length;
    const pctCorrect = attempts > 0 ? ((correctCount / attempts) * 100).toFixed(2) + '%' : '0%';
    
    // Find most picked wrong answer
    const wrongRes = qRes.filter(r => !r.isCorrect);
    const wrongMap: Record<string, number> = {};
    for (const r of wrongRes) {
      const selected = r.selectedTexts ? JSON.parse(r.selectedTexts).join(', ') : 'No Answer';
      wrongMap[selected] = (wrongMap[selected] || 0) + 1;
    }
    let mostPickedWrong = 'N/A';
    let maxWrong = 0;
    for (const [ans, count] of Object.entries(wrongMap)) {
      if (count > maxWrong) { maxWrong = count; mostPickedWrong = ans; }
    }

    qAnalysisSheet.addRow({
      qNum: q.orderIndex + 1,
      qText: q.questionText,
      pctCorrect: pctCorrect,
      wrongAnswer: mostPickedWrong !== 'N/A' ? `${mostPickedWrong} (${maxWrong})` : 'None',
    });
  }
  styleHeaderAndFreeze(qAnalysisSheet, 'FFF0F7FF');
  autofitColumns(qAnalysisSheet);

  // --- Sheet 4: Raw Responses ---
  const rawSheet = workbook.addWorksheet('Raw Responses');
  rawSheet.columns = [
    { header: 'Participant', key: 'participant', width: 20 },
    { header: 'Q#', key: 'qNum', width: 5 },
    { header: 'Question Text', key: 'qText', width: 40 },
    { header: 'Answer Given', key: 'answer', width: 30 },
    { header: 'Is Correct', key: 'isCorrect', width: 12 },
    { header: 'Points Awarded', key: 'points', width: 15 },
  ];

  for (const r of rRows) {
    const p = pRows.find(x => x.id === r.participantId);
    const q = qRows.find(x => x.id === r.questionId);
    if (!p || !q) continue;

    let selected = '';
    try { selected = r.selectedTexts ? JSON.parse(r.selectedTexts).join(', ') : ''; } catch (e) { selected = r.selectedTexts; }

    rawSheet.addRow({
      participant: p.displayName,
      qNum: q.orderIndex + 1,
      qText: q.questionText,
      answer: selected,
      isCorrect: r.isCorrect ? 'Yes' : 'No',
      points: r.pointsAwarded || 0,
    });
  }
  styleHeaderAndFreeze(rawSheet, 'FFFFFFFF');
  autofitColumns(rawSheet);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=session-${id}-report.xlsx`);
  
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
