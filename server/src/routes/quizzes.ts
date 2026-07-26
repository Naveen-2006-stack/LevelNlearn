import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { DbQuestion, DbQuiz } from '../types/index.js';

const router = Router();
router.use(requireAuth);

// List teacher's quizzes
router.get('/', async (req: Request, res: Response) => {
  const teacherId = req.user!.userId;
  const [rows] = await pool.query<any[]>(
    `SELECT q.*, COUNT(qu.id) AS questionCount
     FROM Quiz q
     LEFT JOIN Question qu ON qu.quizId = q.id
     WHERE q.teacherId = ?
     GROUP BY q.id
     ORDER BY q.createdAt DESC`,
    [teacherId]
  );
  const quizzes = (rows as any[]).map((q) => ({
    id: q.id,
    title: q.title,
    description: q.description || '',
    created_at: q.createdAt,
    _count: { questions: Number(q.questionCount) },
  }));
  res.json(quizzes);
});

// Create quiz
router.post('/', async (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(1).default('Untitled Quiz'),
    description: z.string().nullable().optional(),
    timer_based_marking: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    test_mode: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    questions: z.array(z.object({
      id: z.string(),
      question_text: z.string(),
      question_type: z.string().default('mcq'),
      time_limit: z.number().int().min(5).max(120),
      base_points: z.number().int().min(10).max(1000),
      image_url: z.string().nullable().optional(),
      options: z.array(z.object({ text: z.string(), is_correct: z.boolean() })),
      order_index: z.number().int(),
      _isNew: z.boolean().optional(),
    })).optional(),
  });
  const data = schema.parse(req.body);
  const id = uuidv4();
  const teacherId = req.user!.userId;
  await pool.query(
    'INSERT INTO Quiz (id, teacherId, title, description, timerBasedMarking, testMode) VALUES (?, ?, ?, ?, ?, ?)',
    [id, teacherId, data.title, data.description || '', data.timer_based_marking ?? 1, data.test_mode ?? 0]
  );

  if (data.questions?.length) {
    for (const q of data.questions) {
      const qId = q._isNew ? uuidv4() : q.id;
      const options = JSON.stringify(q.options);
      try {
        await pool.query(
          `INSERT INTO Question (id, quizId, questionText, imageUrl, questionType, options, timeLimit, basePoints, orderIndex)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [qId, id, q.question_text, q.image_url || null, q.question_type, options, q.time_limit, q.base_points, q.order_index]
        );
      } catch (e) {
        console.error('Failed to insert starter question (imageUrl may be missing):', e);
        await pool.query(
          `INSERT INTO Question (id, quizId, questionText, questionType, options, timeLimit, basePoints, orderIndex)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [qId, id, q.question_text, q.question_type, options, q.time_limit, q.base_points, q.order_index]
        );
      }
    }
  }

  res.status(201).json({ id });
});

// Get quiz with questions
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [quizRows] = await pool.query<any[]>('SELECT * FROM Quiz WHERE id = ?', [id]);
  if ((quizRows as any[]).length === 0) {
    res.status(404).json({ error: 'Quiz not found' });
    return;
  }
  const quiz = (quizRows as DbQuiz[])[0];

  if (quiz.teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const [qRows] = await pool.query<any[]>(
    'SELECT * FROM Question WHERE quizId = ? ORDER BY orderIndex ASC',
    [id]
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
    createdAt: q.createdAt,
  }));

  res.json({ ...quiz, questions });
});

// Update quiz + upsert questions
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [quizRows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
  if ((quizRows as any[]).length === 0) {
    res.status(404).json({ error: 'Quiz not found' });
    return;
  }
  if ((quizRows as any[])[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const schema = z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    timer_based_marking: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    test_mode: z.union([z.boolean(), z.number()]).transform(v => Boolean(v)).optional(),
    questions: z.array(z.object({
      id: z.string(),
      question_text: z.string(),
      question_type: z.string().default('mcq'),
      time_limit: z.number().int().min(5).max(120),
      base_points: z.number().int().min(10).max(1000),
      image_url: z.string().nullable().optional(),
      options: z.array(z.object({ text: z.string(), is_correct: z.boolean() })),
      order_index: z.number().int(),
      _isNew: z.boolean().optional(),
    })).optional(),
  });

  const data = schema.parse(req.body);
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    res.status(400).json({ error: 'Quiz must have at least one question' });
    return;
  }
  await pool.query(
    'UPDATE Quiz SET title = ?, description = ?, timerBasedMarking = ?, testMode = ? WHERE id = ?',
    [data.title, data.description || '', data.timer_based_marking ?? 1, data.test_mode ?? 0, id]
  );

  if (data.questions) {
    for (const q of data.questions) {
      const options = JSON.stringify(q.options);
      if (q._isNew) {
        const qId = uuidv4();
        try {
          await pool.query(
            `INSERT INTO Question (id, quizId, questionText, imageUrl, questionType, options, timeLimit, basePoints, orderIndex)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [qId, id, q.question_text, q.image_url || null, q.question_type, options, q.time_limit, q.base_points, q.order_index]
          );
        } catch (e) {
          console.error('Failed to insert question (imageUrl may be missing):', e);
          await pool.query(
            `INSERT INTO Question (id, quizId, questionText, questionType, options, timeLimit, basePoints, orderIndex)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [qId, id, q.question_text, q.question_type, options, q.time_limit, q.base_points, q.order_index]
          );
        }
      } else {
        try {
          await pool.query(
            `UPDATE Question SET questionText=?, imageUrl=?, questionType=?, options=?, timeLimit=?, basePoints=?, orderIndex=?
             WHERE id=? AND quizId=?`,
            [q.question_text, q.image_url || null, q.question_type, options, q.time_limit, q.base_points, q.order_index, q.id, id]
          );
        } catch (e) {
          console.error('Failed to update question imageUrl (column may be missing):', e);
          await pool.query(
            `UPDATE Question SET questionText=?, questionType=?, options=?, timeLimit=?, basePoints=?, orderIndex=?
             WHERE id=? AND quizId=?`,
            [q.question_text, q.question_type, options, q.time_limit, q.base_points, q.order_index, q.id, id]
          );
        }
      }
    }
  }

  res.json({ success: true });
});

// Delete quiz
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
  if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  if ((rows as any[])[0].teacherId !== req.user!.userId) { res.status(403).json({ error: 'Unauthorized' }); return; }
  await pool.query('DELETE FROM Quiz WHERE id = ?', [id]);
  res.json({ success: true });
});

// Delete specific question
router.delete('/:id/questions/:qId', async (req: Request, res: Response) => {
  const { id, qId } = req.params;
  const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
  if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }
  await pool.query('DELETE FROM Question WHERE id = ? AND quizId = ?', [qId, id]);
  res.json({ success: true });
});

// Upload question image
router.post('/:id/questions/:qId/image', async (req: Request, res: Response) => {
  const id = String(req.params.id || '');
  const qId = String(req.params.qId || '');
  const schema = z.object({ base64Data: z.string(), mimeType: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body' }); return; }

  const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
  if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
    res.status(403).json({ error: 'Unauthorized' }); return;
  }

  const { base64Data, mimeType } = parsed.data;
  const ext = mimeType.split('/')[1] || 'png';
  const fileName = `${qId}-${Date.now()}.${ext}`;
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'quizzes', id);
  fs.mkdirSync(uploadDir, { recursive: true });

  const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(base64, 'base64'));

  const url = `/uploads/quizzes/${id}/${fileName}`;
  try {
    await pool.query('UPDATE Question SET imageUrl = ? WHERE id = ? AND quizId = ?', [url, qId, id]);
  } catch (e) {
    // ignore DB update errors but still return the file URL
  }

  res.json({ url });
});

export default router;
