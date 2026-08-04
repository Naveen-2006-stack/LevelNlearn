export interface AuthUser {
  userId: string;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
  name: string;
  email: string;
  image?: string | null;
  isGhost?: boolean;
  regNo?: string | null;
}

export interface DbUser {
  id: string;
  name: string | null;
  email: string | null;
  regNo?: string | null;
  password: string | null;
  role: 'TEACHER' | 'STUDENT' | 'ADMIN';
  isGhost?: boolean;
  emailVerified: Date | null;
  image: string | null;
  verificationToken?: string | null;
  verificationTokenExpiry?: Date | null;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  passwordChangedAt?: Date | null;
}

export interface DbQuiz {
  id: string;
  teacherId: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbQuestion {
  id: string;
  quizId: string;
  questionText: string;
  questionType: string;
  options: QuestionOption[];
  timeLimit: number;
  basePoints: number;
  orderIndex: number;
  createdAt: Date;
}

export interface QuestionOption {
  text: string;
  is_correct: boolean;
}

export interface DbLiveSession {
  id: string;
  joinCode: string;
  quizId: string;
  teacherId: string;
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  currentQuestionIndex: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface DbParticipant {
  id: string;
  sessionId: string;
  deviceUuid: string;
  displayName: string;
  regNo?: string | null;
  score: number;
  streak: number;
  cheatFlags: number;
  lastActive: Date;
  joinedAt: Date;
}

export interface DbStudentResponse {
  id: string;
  sessionId: string;
  participantId: string;
  questionId: string;
  reactionTimeMs: number;
  isCorrect: boolean;
  pointsAwarded: number;
  streakBonus: number;
  answeredAt: Date;
}

// Express global augmentation
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
