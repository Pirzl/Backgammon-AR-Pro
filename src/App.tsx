import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthProvider';
import { GameSettingsProvider } from './features/admin/GameSettingsContext';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { AdminRoute } from './features/auth/AdminRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { RegisterBenefitsPage } from './pages/auth/RegisterBenefitsPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { UpdatePasswordPage } from './pages/auth/UpdatePasswordPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { GameRouteGuard } from './pages/GameRouteGuard';
import { HumanVsHumanIntro } from './pages/HumanVsHumanIntro';
import './index.css';

// Lazy load route components for code splitting
const LandingPage = lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));

// User Components
const UserDashboard = lazy(() => import('./features/client/components/UserDashboard').then(module => ({ default: module.UserDashboard })));

// Admin Components
const AdminLayout = lazy(() => import('./features/admin/components/AdminLayout').then(module => ({ default: module.AdminLayout })));
const AdminDashboard = lazy(() => import('./features/admin/components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const PlayerDirectory = lazy(() => import('./features/admin/components/PlayerDirectory').then(module => ({ default: module.PlayerDirectory })));
const SettingsPanel = lazy(() => import('./features/admin/components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const OctagonSettingsPanel = lazy(() => import('./features/admin/components/OctagonSettingsPanel').then(module => ({ default: module.OctagonSettingsPanel })));

// Minigames
const PongGame = lazy(() => import('./features/minigames/pong/ui/PongGame').then(module => ({ default: module.PongGame })));

// Loading Component
function LoadingScreen() {
  return (
    <div className="w-full h-screen flex items-center justify-center bg-black text-cyan-400">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        <p className="font-mono animate-pulse">LOADING VIVO...</p>
      </div>
    </div>
  );
}

/**
 * Main Application Entry Point
 * Now uses React Router for navigation
 */
import { ThemeProvider } from './features/theme/ThemeProvider';

import { InvitationInbox } from './features/matchmaking/components/InvitationInbox';

import { CookieBanner } from './shared/components/CookieBanner';

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <BrowserRouter>
          <GameSettingsProvider>
            <AuthProvider>
              <InvitationInbox />
              <CookieBanner />
              <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth/login" element={<LoginPage />} />
              <Route path="/auth/register-benefits" element={<RegisterBenefitsPage />} />
              <Route path="/auth/register" element={<RegisterPage />} />
              <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/auth/update-password" element={<UpdatePasswordPage />} />
              
              {/* Human vs Human Intro */}
              <Route path="/human-vs-human-intro" element={<HumanVsHumanIntro />} />
              
              {/* Game Route - Protected by GameRouteGuard for per-mode maintenance */}
              <Route path="/game" element={<GameRouteGuard />} />
              
              {/* Minigames Component Route */}
              <Route path="/minigames/pong" element={<PongGame />} />
              
              {/* Maintenance Page */}
              <Route path="/maintenance" element={<MaintenancePage />} />

              {/* Protected Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<UserDashboard />} />
              </Route>

              {/* Admin Routes */}
              <Route path="/admin" element={<AdminRoute />}>
                  <Route element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="players" element={<PlayerDirectory />} />
                      <Route path="octagon" element={<OctagonSettingsPanel />} />
                      <Route path="settings" element={<SettingsPanel />} />
                  </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </GameSettingsProvider>
      </BrowserRouter>
      </ThemeProvider>
    </Suspense>
  );
}

export default App;
