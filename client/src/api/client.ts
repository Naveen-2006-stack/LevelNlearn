import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({ baseURL: BASE });

// Attach JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('auth-storage');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const token: string | null = parsed?.state?.token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch { /* ignore */ }
  }
  return config;
});

// ─── Auth ──────────────────────────────────────────────
export const authApi = {
  register: (name: string, email: string, password: string, regNo?: string) =>
    api.post('/api/auth/register', { name, email, password, regNo }),

  login: (email: string, password: string) =>
    api.post<{ token: string; user: { id: string; name: string; email: string; regNo?: string | null; role: string; image?: string | null; isGhost?: boolean } }>(
      '/api/auth/login', { email, password }
    ),

  verifyEmail: (token: string) =>
    api.get('/api/auth/verify-email', { params: { token } }),

  resendVerification: (email: string) =>
    api.post('/api/auth/resend-verification', { email }),

  me: () => api.get('/api/auth/me'),

  updateProfile: (name: string, image?: string, regNo?: string | null) => api.put('/api/auth/profile', { name, image, regNo }),

  requestPasswordReset: (email: string) =>
    api.post('/api/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/api/auth/reset-password', { token, newPassword }),

  loginWithGoogle: (idToken: string) =>
    api.post<{ token: string; user: { id: string; name: string; email: string; regNo?: string | null; role: string; image?: string | null; isGhost?: boolean } }>(
      '/api/auth/google', { idToken }
    ),
};

// ─── Quizzes ────────────────────────────────────────────
export const quizApi = {
  list: () => api.get('/api/quizzes'),
  create: (data?: { title?: string; description?: string; timer_based_marking?: boolean; test_mode?: boolean; questions?: any[] }) =>
    api.post('/api/quizzes', {
      title: data?.title || 'Untitled Quiz',
      description: data?.description || '',
      timer_based_marking: data?.timer_based_marking,
      test_mode: data?.test_mode,
      questions: data?.questions,
    }),
  get: (id: string) => api.get(`/api/quizzes/${id}`),
  update: (id: string, data: { title: string; description?: string; timer_based_marking?: boolean; test_mode?: boolean; questions?: any[] }) =>
    api.put(`/api/quizzes/${id}`, data),
  remove: (id: string) => api.delete(`/api/quizzes/${id}`),
  deleteQuestion: (quizId: string, qId: string) =>
    api.delete(`/api/quizzes/${quizId}/questions/${qId}`),
  uploadImage: (quizId: string, qId: string, base64Data: string, mimeType: string) =>
    api.post<{ url: string }>(`/api/quizzes/${quizId}/questions/${qId}/image`, { base64Data, mimeType }),
};

// ─── Sessions ───────────────────────────────────────────
export const sessionApi = {
  create: (quizId: string, mode?: string, timedScoring?: boolean) => api.post<{ id: string; joinCode: string }>('/api/sessions', { quizId, mode, timedScoring }),
  getReports: () => api.get('/api/sessions/reports'),
  getHistory: (deviceUuid: string | null) =>
    api.get('/api/sessions/history', { params: { deviceUuid } }),
  getById: (id: string) => api.get(`/api/sessions/${id}`),
  getByCode: (joinCode: string) => api.get(`/api/sessions/by-code/${joinCode}`),
  getPlayData: (id: string, deviceUuid: string) =>
    api.get(`/api/sessions/${id}/play-data`, { params: { deviceUuid } }),
  join: (id: string, joinCode: string, displayName: string, deviceUuid: string, consentAt?: string, regNo?: string | null) =>
    api.post<{ sessionId: string; participantId: string }>(`/api/sessions/${id}/join`, {
      joinCode, displayName, deviceUuid, consentAt, regNo
    }),
  start: (id: string) => api.post(`/api/sessions/${id}/start`),
  next: (id: string, nextQuestionIndex: number, isLast: boolean) =>
    api.post(`/api/sessions/${id}/next`, { nextQuestionIndex, isLast }),
  finish: (id: string) => api.post(`/api/sessions/${id}/finish`),
  submit: (id: string, data: {
    participantId: string; questionId: string;
    reactionTimeMs: number; selectedTexts: string[];
  }) => api.post(`/api/sessions/${id}/submit`, data),
  flagCheat: (id: string, participantId: string) =>
    api.post(`/api/sessions/${id}/flag-cheat`, { participantId }),
  kick: (id: string, participantId: string) =>
    api.post(`/api/sessions/${id}/kick`, { participantId }),
  leave: (id: string, participantId: string, reason?: string) =>
    api.delete(`/api/sessions/${id}/leave`, { data: { participantId, reason } }),
  getSubmissionCount: (id: string, questionId: string) =>
    api.get<{ count: number }>(`/api/sessions/${id}/submission-count`, { params: { questionId } }),
  getReport: (id: string) => api.get(`/api/sessions/${id}/report`),
  getExcelReport: (id: string) => api.get(`/api/sessions/${id}/report.xlsx`, { responseType: 'blob' }),
  getLeaderboard: (id: string) => api.get(`/api/sessions/${id}/leaderboard`),
  getAnsweredQuestions: (sessionId: string, participantId: string) =>
    api.get<{ questionIds: string[] }>(`/api/sessions/${sessionId}/answered`, { params: { participantId } }),
  getState: (sessionId: string, participantId: string) =>
    api.get(`/api/sessions/${sessionId}/state`, { params: { participantId } }),
  getResult: (sessionId: string, participantId: string) =>
    api.get(`/api/sessions/${sessionId}/result`, { params: { participantId } }),
  deleteSession: (id: string) => api.delete(`/api/sessions/${id}`),
};

// ─── Pusher trigger (anti-cheat & emoji) ────────────────
export const pusherApi = {
  trigger: (channel: string, event: string, payload: object) =>
    api.post('/api/pusher', { channel, event, payload }),
};

// ─── Admin ──────────────────────────────────────────────
export const adminApi = {
  getMetrics: () => api.get('/api/admin/metrics'),
  getUsers: () => api.get('/api/admin/users'),
  deleteUser: (id: string) => api.delete(`/api/admin/users/${id}`),
  toggleGhost: (id: string, isGhost: boolean) => api.patch(`/api/admin/users/${id}/ghost`, { isGhost }),
  getSessions: () => api.get('/api/admin/sessions'),
  getExcelReport: (id: string) => api.get(`/api/admin/sessions/${id}/report.xlsx`, { responseType: 'blob' }),
  deleteSession: (id: string) => api.delete(`/api/admin/sessions/${id}`),
  forceEndSession: (id: string) => api.post(`/api/admin/sessions/${id}/end`),
  getFeedback: () => api.get('/api/admin/feedback'),
  deleteFeedback: (id: string) => api.delete(`/api/admin/feedback/${id}`),
};

// ─── Feedback ───────────────────────────────────────────
export const feedbackApi = {
  submit: (rating: number, message: string) => api.post('/api/feedback', { rating, message }),
};
