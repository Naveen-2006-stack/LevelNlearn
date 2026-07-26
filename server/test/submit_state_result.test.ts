import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db/pool.js', () => ({ pool: { query: mockQuery } }));
vi.mock('../src/services/pusher.js', () => ({ triggerEvent: vi.fn() }));
vi.mock('../src/middleware/auth.js', () => ({
  requireAuth: (req: any, res: any, next: any) => { req.user = { userId: 'teacher-1', role: 'TEACHER' }; return next(); },
  requireAdmin: (req: any, res: any, next: any) => { req.user = { userId: 'admin-1', role: 'ADMIN' }; return next(); }
}));

import app from '../src/index.js';

beforeEach(() => { mockQuery.mockReset(); });

describe('Submit / State / Result endpoints', () => {
  it('allows a student to submit and then retrieve state/result', async () => {
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const participantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const questionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    // Setup: participant exists
    mockQuery.mockResolvedValueOnce([[{ id: participantId, sessionId, status: 'IN_PROGRESS', score: 0, streak: 0 }]]); // Participant select
    mockQuery.mockResolvedValueOnce([[{ id: questionId, questionText: 'Q', options: JSON.stringify([{text:'A',is_correct:true}]), questionType: 'mcq', basePoints: 100 }]]); // Question select
    mockQuery.mockResolvedValueOnce([[{ id: 'quiz-1' }]]); // Quiz select

    // Duplicate check returns empty
    mockQuery.mockResolvedValueOnce([[]]);

    // Insert StudentResponse
    mockQuery.mockResolvedValueOnce([{}]);
    // Update Participant
    mockQuery.mockResolvedValueOnce([{}]);
    // Select updated participant
    mockQuery.mockResolvedValueOnce([[{ id: participantId, score: 100, streak: 1, displayName: 'Stu' }]]);
    // Unanimous mode check query
    mockQuery.mockResolvedValueOnce([[{ mode: 'NORMAL', currentQuestionIndex: 0, quizId: 'quiz-1' }]]);

    const res = await request(app)
      .post(`/api/sessions/${sessionId}/submit`)
      .send({ participantId, questionId, reactionTimeMs: 500, selectedTexts: ['A'] })
      .set('Authorization', 'Bearer faketoken');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isCorrect', true);

    // State endpoint
    mockQuery.mockResolvedValueOnce([[{ id: participantId, status: 'IN_PROGRESS' }]]); // participant
    mockQuery.mockResolvedValueOnce([[{ id: sessionId, currentQuestionIndex: 0, status: 'ACTIVE' }]]); // session
    mockQuery.mockResolvedValueOnce([[{ questionId }]]); // answered

    const stateRes = await request(app).get(`/api/sessions/${sessionId}/state`).query({ participantId }).set('Authorization', 'Bearer faketoken');
    expect(stateRes.status).toBe(200);
    expect(stateRes.body).toHaveProperty('participantStatus');

    // Result endpoint
    mockQuery.mockResolvedValueOnce([[{ id: participantId, submittedAt: new Date().toISOString(), finalScore: 100 }]]); // participant
    mockQuery.mockResolvedValueOnce([[{ id: sessionId, quizTitle: 'Quiz', status: 'FINISHED' }]]); // session
    mockQuery.mockResolvedValueOnce([[{ questionId, participantId, isCorrect: 1, selectedTexts: JSON.stringify(['A']), pointsAwarded: 100 }]]); // responses
    mockQuery.mockResolvedValueOnce([[{ id: participantId, displayName: 'Stu', score: 100, finalScore: 100 }]]); // participants list

    const resultRes = await request(app).get(`/api/sessions/${sessionId}/result`).query({ participantId }).set('Authorization', 'Bearer faketoken');
    expect(resultRes.status).toBe(200);
    expect(resultRes.body).toHaveProperty('participant');
    expect(Array.isArray(resultRes.body.responses)).toBe(true);
  });
});
