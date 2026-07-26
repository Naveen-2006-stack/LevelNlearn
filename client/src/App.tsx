import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import Navbar from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import RegisterPage from './pages/RegisterPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import VerifyEmailPendingPage from './pages/VerifyEmailPendingPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import JoinPage from './pages/JoinPage';
import PlayPage from './pages/PlayPage';
import StudentResultsPage from './pages/StudentResultsPage';
import HostPage from './pages/HostPage';
import ProfilePage from './pages/ProfilePage';
import FeedbackPage from './pages/FeedbackPage';
import QuizEditorPage from './pages/QuizEditorPage';
import ReportsPage from './pages/reports/ReportsPage';
import SessionReportPage from './pages/reports/SessionReportPage';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminSessions from './pages/admin/AdminSessions';
import AdminFeedback from './pages/admin/AdminFeedback';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/verify-email-pending" element={<VerifyEmailPendingPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/join" element={<ProtectedRoute><JoinPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />

          <Route path="/quiz/:id/edit" element={<ProtectedRoute requireRole="TEACHER"><QuizEditorPage /></ProtectedRoute>} />
          <Route path="/host/:sessionId" element={<ProtectedRoute requireRole="TEACHER"><HostPage /></ProtectedRoute>} />

          <Route path="/play/:sessionId" element={<ProtectedRoute><PlayPage /></ProtectedRoute>} />
          <Route path="/play/:sessionId/results" element={<ProtectedRoute><StudentResultsPage /></ProtectedRoute>} />

          <Route path="/dashboard/reports" element={<ProtectedRoute requireRole="TEACHER"><ReportsPage /></ProtectedRoute>} />
          <Route path="/dashboard/reports/:sessionId" element={<ProtectedRoute requireRole="TEACHER"><SessionReportPage /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requireRole="ADMIN"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="sessions" element={<AdminSessions />} />
            <Route path="feedback" element={<AdminFeedback />} />
          </Route>
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}
