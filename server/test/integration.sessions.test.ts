import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB pool to control query responses
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { query: mockQuery } }));

// Mock pusher trigger to avoid network calls
vi.mock('../src/services/pusher.js', () => ({ triggerEvent: vi.fn() }));

// Mock auth middleware to inject a test user
vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => { req.user = { userId: 'teacher-1', role: 'TEACHER' }; return next(); },
  requireAdmin: (req: any, res: any, next: any) => { req.user = { userId: 'admin-1', role: 'ADMIN' }; return next(); }
}));

import app from '../src/index.js';

beforeEach(() => { mockQuery.mockReset(); });

describe('Sessions lifecycle (mocked DB)', () => {
  it('creates a session (POST /api/sessions)', async () => {
    const quizId = '11111111-1111-4111-8111-111111111111';
    // Mock quiz exists check
    mockQuery.mockResolvedValueOnce([[{ id: 'quiz-1' }]]);
    // Mock insert
    mockQuery.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/sessions')
      .send({ quizId, mode: 'NORMAL' })
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('joinCode');
  });

  it('starts and advances a session (start -> next -> finish)', async () => {
    // start: return teacherId
    mockQuery.mockResolvedValueOnce([[{ teacherId: 'teacher-1', quizId: 'quiz-1' }]]);
    const startRes = await request(app).post('/api/sessions/abc/start').set('Authorization', 'Bearer faketoken');
    expect(startRes.status).toBe(200);

    // next: select teacher check
    mockQuery.mockResolvedValueOnce([[{ teacherId: 'teacher-1', quizId: 'quiz-1' }]]);
    // next: select question timeLimit
    mockQuery.mockResolvedValueOnce([[{ timeLimit: 25 }]]);
    const nextRes = await request(app).post('/api/sessions/abc/next').send({ nextQuestionIndex: 1, isLast: false }).set('Authorization', 'Bearer faketoken');
    expect(nextRes.status).toBe(200);

    // finish: teacher check and transaction queries
    mockQuery.mockResolvedValueOnce([[{ teacherId: 'teacher-1' }]]);
    mockQuery.mockResolvedValueOnce([{}]); // START TRANSACTION
    mockQuery.mockResolvedValueOnce([{}]); // UPDATE LiveSession
    mockQuery.mockResolvedValueOnce([{}]); // UPDATE Participant
    mockQuery.mockResolvedValueOnce([{}]); // COMMIT

    const finishRes = await request(app).post('/api/sessions/abc/finish').set('Authorization', 'Bearer faketoken');
    expect(finishRes.status).toBe(200);
  });
});
