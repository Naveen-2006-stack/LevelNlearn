import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { ProtectedRoute } from './components/ProtectedRoute';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const VerifyEmailPendingPage = lazy(() => import('./pages/VerifyEmailPendingPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const PlayPage = lazy(() => import('./pages/PlayPage'));
const StudentResultsPage = lazy(() => import('./pages/StudentResultsPage'));
const HostPage = lazy(() => import('./pages/HostPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const QuizEditorPage = lazy(() => import('./pages/QuizEditorPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const SessionReportPage = lazy(() => import('./pages/reports/SessionReportPage'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminSessions = lazy(() => import('./pages/admin/AdminSessions'));
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'));
const Navbar = lazy(() => import('./components/Navbar'));

function RouteLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-slate-400">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <Suspense fallback={<RouteLoading />}>
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
        </Suspense>
      </ThemeProvider>
    </BrowserRouter>
  );
}
