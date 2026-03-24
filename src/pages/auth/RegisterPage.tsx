import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../features/auth/AuthLayout';
import { Eye, EyeOff, Loader2, Home, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase } from '../../shared/api/supabase';

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false); // New success state
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev: typeof formData) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      setLoading(false);
      return;
    }

    try {
        const { data, error } = await supabase.auth.signUp({
            email: formData.email.trim(),
            password: formData.password,
            options: {
                // Dynamic redirect URL for Localhost/Production compatibility
                emailRedirectTo: window.location.origin + '/dashboard', 
                data: {
                    first_name: formData.firstName,
                    last_name: formData.lastName,
                    phone: formData.phone,
                },
            },
        });

        if (error) throw error;

        // Check if session is null (which means email confirmation is required)
        if (data.user && !data.session) {
             setSuccess(true);
        } else if (data.user && data.session) {
             // If for some reason email confirmation is disabled in Supabase, just redirect
             navigate('/dashboard');
        }

    } catch (err: unknown) {
        // Friendly error handling for existing users
        const message = err instanceof Error ? err.message : 'An unknown error occurred';
        
        if (message.includes('already registered') || message.includes('User already registered')) {
            setError('Este correo ya está registrado. Por favor, inicia sesión.');
        } else {
            setError(message || 'Error al registrarse. Inténtalo de nuevo.');
        }
    } finally {
        setLoading(false);
    }
  };

  if (success) {
      return (
          <AuthLayout title="¡Verifica tu Correo!" subtitle="Solo un paso más para empezar a jugar">
              <div className="flex flex-col items-center justify-center space-y-6 text-center animate-in fade-in duration-500">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                      <Mail className="w-10 h-10 text-green-400 animate-pulse" />
                  </div>
                  
                  <div className="space-y-2">
                       <h3 className="text-xl font-bold text-white">Hemos enviado un enlace a:</h3>
                       <p className="text-cyan-400 font-mono text-lg bg-cyan-950/30 py-1 px-3 rounded inline-block border border-cyan-500/20">
                           {formData.email}
                       </p>
                  </div>

                  <p className="text-slate-400 leading-relaxed max-w-sm">
                      Por favor, revisa tu bandeja de entrada (y spam) y haz clic en el enlace para activar tu cuenta y acceder al Dashboard.
                  </p>

                  <div className="pt-4 w-full space-y-3">
                      <Link 
                          to="/auth/login"
                          className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 group"
                      >
                          <span>Volver al Inicio de Sesión</span>
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Link>
                  </div>
              </div>
          </AuthLayout>
      )
  }

  return (
    <AuthLayout title="Crear Cuenta" subtitle="Únete a la comunidad de Backgammon VIVO">
      <Link to="/" className="absolute top-8 left-8 text-slate-400 hover:text-white transition-colors flex items-center gap-2">
         <Home size={20} />
         <span className="text-sm">Volver</span>
      </Link>
      <form onSubmit={handleRegister} className="space-y-4">
        {/* ... existing form fields ... */}
        {/* I'm keeping the exact same form fields layout */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
            <input
              type="text"
              name="firstName"
              required
              value={formData.firstName}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
              placeholder="Juan"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Apellido</label>
            <input
              type="text"
              name="lastName"
              required
              value={formData.lastName}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
              placeholder="Pérez"
            />
          </div>
        </div>

        <div>
           <label className="block text-sm font-medium text-slate-300 mb-1">Teléfono</label>
           <input
             type="tel"
             name="phone"
             required
             value={formData.phone}
             onChange={handleChange}
             className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
             placeholder="+34 600 000 000"
           />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
          <input
            type="email"
            name="email"
            required
            value={formData.email}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white placeholder:text-slate-600"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white"
              placeholder="Min. 6 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Confirmar Contraseña</label>
          <input
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            required
            value={formData.confirmPassword}
            onChange={handleChange}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-white border-transparent focus:border-transparent"
             placeholder="Repite la contraseña"
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 mt-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-purple-500/25 flex items-center justify-center disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Crear Cuenta'}
        </button>

        <p className="text-center text-slate-400 text-sm">
          ¿Ya tienes cuenta?{' '}
          <Link to="/auth/login" className="text-purple-400 hover:text-purple-300 font-medium">
            Inicia Sesión
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
};
