import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { Eye, EyeOff, Loader2, Home } from 'lucide-react';
import { supabase } from '../../shared/api/supabase';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  // We can access global auth state if needed, but sign in is usually direct
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : authError.message);
      setLoading(false);
      return;
    }

    // Login successful - Check Role for Redirect
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user?.id)
        .single();
      
      if (profile?.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Role check failed', err);
      navigate('/dashboard'); // Fallback to safe zone
    }
  };

  return (
    <AuthLayout title="Bienvenido de nuevo" subtitle="Inicia sesión para jugar">
      <Link to="/" className="absolute top-8 left-8 text-slate-400 hover:text-white transition-colors flex items-center gap-2">
         <Home size={20} />
         <span className="text-sm">Volver</span>
      </Link>
      <form onSubmit={handleLogin} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-white transition-all placeholder:text-slate-600"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-white transition-all placeholder:text-slate-600"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="flex justify-end mt-2">
            <Link to="/auth/forgot-password" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-purple-500/25 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Iniciar Sesión'}
        </button>

        <p className="text-center text-slate-400 text-sm">
          ¿No tienes cuenta?{' '}
          <Link to="/auth/register" className="text-purple-400 hover:text-purple-300 font-medium">
            Regístrate
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};
