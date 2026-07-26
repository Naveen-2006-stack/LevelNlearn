import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  try {
    const { rating, message } = req.body;
    
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating' });
    }
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const id = crypto.randomUUID();
    const userId = req.user?.userId;

    await pool.query(
      'INSERT INTO Feedback (id, userId, rating, message) VALUES (?, ?, ?, ?)',
      [id, userId, rating, message]
    );

    res.status(201).json({ success: true, feedbackId: id });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

export default router;
