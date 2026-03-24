import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../shared/api/supabase';

export const UpdatePasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      navigate('/dashboard');
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Nueva Contraseña" subtitle="Establece tu nueva contraseña segura">
      <form onSubmit={handleUpdate} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Nueva Contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Confirmar Nueva Contraseña</label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-purple-500/25 flex items-center justify-center disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Actualizar Contraseña'}
        </button>
      </form>
    </AuthLayout>
  );
};
