import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './useAuth';

export const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    // You might want a better loading spinner here
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  return <Outlet />;
};
