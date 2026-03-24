import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../../shared/api/supabase';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage('Si el email existe en nuestra base de datos, recibirás un enlace de recuperación en breve.');
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Recuperar Contraseña" subtitle="Te enviaremos un enlace para restablecerla">
      <form onSubmit={handleReset} className="space-y-6">
        {!message ? (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Registrado</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
                placeholder="tu@email.com"
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
              {loading ? <Loader2 className="animate-spin" /> : 'Enviar Enlace'}
            </button>
          </>
        ) : (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-center">
            {message}
          </div>
        )}

        <div className="flex justify-center">
          <Link to="/auth/login" className="flex items-center text-slate-400 hover:text-white transition-colors text-sm font-medium">
            <ArrowLeft size={16} className="mr-2" />
            Volver a Iniciar Sesión
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
};
