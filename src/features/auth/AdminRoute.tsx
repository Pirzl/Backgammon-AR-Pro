import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';

export const AdminRoute = () => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />; // or to home
  }

  return <Outlet />;
};
