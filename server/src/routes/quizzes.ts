import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { DbQuiz } from '../types/index.js';

const router = Router();
router.use(requireAuth);

// List teacher's quizzes
router.get('/', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    console.error('[Quiz Route Error - List]', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch quizzes' });
  }
});

function parseToggleToInt(val: any, defaultVal: number = 0): number {
  if (val === true || val === 'true' || val === 1 || val === '1') return 1;
  if (val === false || val === 'false' || val === 0 || val === '0') return 0;
  return defaultVal;
}

// Create quiz
router.post('/', async (req: Request, res: Response) => {
  try {
    const rawTimerValue = req.body?.timer_based_scoring ?? req.body?.timer_based_marking ?? req.body?.timerBasedMarking;
    const rawTestModeValue = req.body?.test_mode ?? req.body?.testMode;

    const mappedBody = {
      ...req.body,
      timer_based_marking: parseToggleToInt(rawTimerValue, 1),
      test_mode: parseToggleToInt(rawTestModeValue, 0),
    };

    const schema = z.object({
      title: z.string().min(1).default('Untitled Quiz'),
      description: z.string().nullable().optional(),
      timer_based_marking: z.union([z.boolean(), z.number(), z.string()]).transform(v => parseToggleToInt(v, 1)).default(1),
      test_mode: z.union([z.boolean(), z.number(), z.string()]).transform(v => parseToggleToInt(v, 0)).default(0),
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
    const data = schema.parse(mappedBody);
    const id = uuidv4();
    const teacherId = req.user!.userId;
    await pool.query(
      'INSERT INTO Quiz (id, teacherId, title, description, timerBasedMarking, testMode) VALUES (?, ?, ?, ?, ?, ?)',
      [id, teacherId, data.title, data.description || '', data.timer_based_marking, data.test_mode]
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
          console.error('Failed to insert starter question (imageUrl column may be missing):', e);
          await pool.query(
            `INSERT INTO Question (id, quizId, questionText, questionType, options, timeLimit, basePoints, orderIndex)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [qId, id, q.question_text, q.question_type, options, q.time_limit, q.base_points, q.order_index]
          );
        }
      }
    }

    res.status(201).json({ id });
  } catch (err: any) {
    console.error('[Quiz Route Error - Create]', err);
    res.status(500).json({ error: err?.message || 'Failed to save quiz' });
  }
});

// Get quiz with questions
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [quizRows] = await pool.query<DbQuiz>('SELECT * FROM Quiz WHERE id = ?', [id]);
    if (quizRows.length === 0) {
      res.status(404).json({ error: 'Quiz not found' });
      return;
    }
    const quiz = quizRows[0];

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
  } catch (err: any) {
    console.error('[Quiz Route Error - Get]', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch quiz' });
  }
});

// Update quiz + upsert questions
router.put('/:id', async (req: Request, res: Response) => {
  try {
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

    const rawTimerValue = req.body?.timer_based_scoring ?? req.body?.timer_based_marking ?? req.body?.timerBasedMarking;
    const rawTestModeValue = req.body?.test_mode ?? req.body?.testMode;

    const mappedBody = {
      ...req.body,
      timer_based_marking: parseToggleToInt(rawTimerValue, 1),
      test_mode: parseToggleToInt(rawTestModeValue, 0),
    };

    const schema = z.object({
      title: z.string().min(1),
      description: z.string().nullable().optional(),
      timer_based_marking: z.union([z.boolean(), z.number(), z.string()]).transform(v => parseToggleToInt(v, 1)).default(1),
      test_mode: z.union([z.boolean(), z.number(), z.string()]).transform(v => parseToggleToInt(v, 0)).default(0),
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

    const data = schema.parse(mappedBody);
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      res.status(400).json({ error: 'Quiz must have at least one question' });
      return;
    }
    await pool.query(
      'UPDATE Quiz SET title = ?, description = ?, timerBasedMarking = ?, testMode = ? WHERE id = ?',
      [data.title, data.description || '', data.timer_based_marking, data.test_mode, id]
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
            console.error('Failed to insert question (imageUrl column may be missing):', e);
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
  } catch (err: any) {
    console.error('[Quiz Route Error - Update]', err);
    res.status(500).json({ error: err?.message || 'Failed to save quiz' });
  }
});

// Delete quiz
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
    if ((rows as any[]).length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    if ((rows as any[])[0].teacherId !== req.user!.userId) { res.status(403).json({ error: 'Unauthorized' }); return; }
    await pool.query('DELETE FROM Quiz WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Quiz Route Error - Delete Quiz]', err);
    res.status(500).json({ error: err?.message || 'Failed to delete quiz' });
  }
});

// Delete specific question
router.delete('/:id/questions/:qId', async (req: Request, res: Response) => {
  try {
    const { id, qId } = req.params;
    const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
    if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
      res.status(403).json({ error: 'Unauthorized' }); return;
    }
    await pool.query('DELETE FROM Question WHERE id = ? AND quizId = ?', [qId, id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('[Quiz Route Error - Delete Question]', err);
    res.status(500).json({ error: err?.message || 'Failed to delete question' });
  }
});

async function uploadToSupabaseStorage(
  bucketName: string,
  filePath: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase Storage environment variables (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) are missing.');
  }

  const endpoint = `${supabaseUrl}/storage/v1/object/${bucketName}/${filePath}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detailMsg = errorText;
    try {
      const parsed = JSON.parse(errorText);
      detailMsg = parsed.message || parsed.error || errorText;
    } catch { /* use raw text */ }
    throw new Error(`Supabase Storage Error: ${detailMsg}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucketName}/${filePath}`;
}

// Upload question image
router.post('/:id/questions/:qId/image', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const qId = String(req.params.qId || '');
    const schema = z.object({ base64Data: z.string(), mimeType: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid request body.' }); return; }

    const [rows] = await pool.query<any[]>('SELECT teacherId FROM Quiz WHERE id = ?', [id]);
    if ((rows as any[]).length === 0 || (rows as any[])[0].teacherId !== req.user!.userId) {
      res.status(403).json({ error: 'Unauthorized.' }); return;
    }

    const { base64Data, mimeType } = parsed.data;
    const ext = mimeType.split('/')[1] || 'png';
    const fileName = `${qId}-${Date.now()}.${ext}`;
    const base64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const fileBuffer = Buffer.from(base64, 'base64');

    const hasStorageVars = Boolean(
      (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)
    );

    let url: string | null = null;

    if (hasStorageVars) {
      try {
        url = await uploadToSupabaseStorage('quiz-images', `${id}/${fileName}`, fileBuffer, mimeType);
      } catch (error: any) {
        console.error("Supabase Storage Error:", error);
        if (process.env.VERCEL) {
          return res.status(500).json({ error: error?.message || "Storage upload failed" });
        }
        console.warn('[Image Upload] Local file system fallback engaged because Supabase Storage threw an error.');
      }
    }

    // 2. Fall back to local file storage if Supabase Storage is not configured or failed locally
    if (!url) {
      if (process.env.VERCEL) {
        return res.status(500).json({ error: "Storage environment variables (SUPABASE_URL/SUPABASE_ANON_KEY) or Supabase bucket ('quiz-images') not properly configured." });
      }

      try {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'quizzes', id);
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, fileName), fileBuffer);
        url = `/uploads/quizzes/${id}/${fileName}`;
      } catch (fsErr: any) {
        console.error('[Image Upload] Local file system write error:', fsErr);
        return res.status(500).json({ error: 'Failed to save image file to disk.' });
      }
    }

    try {
      await pool.query('UPDATE Question SET imageUrl = ? WHERE id = ? AND quizId = ?', [url, qId, id]);
    } catch (e) {
      // ignore DB update errors but still return the file URL
    }

    res.json({ url });
  } catch (error: any) {
    console.error("Supabase Storage Error:", error);
    return res.status(500).json({ error: error?.message || "Storage upload failed" });
  }
});

export default router;
