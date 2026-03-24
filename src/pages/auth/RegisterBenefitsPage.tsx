import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Shield, TrendingUp, Users, MessageSquare, Notebook, Home, ArrowRight } from 'lucide-react';

export const RegisterBenefitsPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const benefits = [
    {
      icon: <TrendingUp className="w-8 h-8 text-cyan-400" />,
      title: "1. Transparencia y Control Total",
      description: "Visualiza tus beneficios, audita cada apuesta y analiza tus rachas con gráficos interactivos. Tú tienes el control absoluto de tus datos."
    },
    {
      icon: <Users className="w-8 h-8 text-purple-400" />,
      title: "2. Desafíos PvP y Juegos Sociales",
      description: "Reta a amigos o rivales, gestiona invitaciones y compite en entornos seguros donde el sistema garantiza el cumplimiento de lo pactado."
    },
    {
      icon: <MessageSquare className="w-8 h-8 text-pink-400" />,
      title: "3. Soporte Directo y Privado",
      description: "Canal directo con administradores y alertas de mensajes importantes sin salir de la plataforma."
    },
    {
      icon: <Notebook className="w-8 h-8 text-yellow-400" />,
      title: "4. Herramientas Estratégicas",
      description: "Cuaderno privado de notas para estrategias y personalización visual (Modo Claro/Oscuro) para reducir la fatiga."
    },
    {
      icon: <Shield className="w-8 h-8 text-green-400" />,
      title: "5. Seguridad Máxima",
      description: "Gestión autónoma del perfil, cambio de contraseñas seguro y 'Zona de peligro' para el control total de tus datos."
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen animate-pulse-slow" />
        <div className="absolute top-[40%] -right-[10%] w-[500px] h-[500px] bg-cyan-600/10 blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-4xl w-full z-10 space-y-10">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            ¿Por qué registrarte en VIVO?
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            El registro no es solo un trámite: es tu pasaporte a un entorno de juego <span className="text-cyan-300 font-medium">seguro, transparente y profesional</span>.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((item, idx) => (
                <div key={idx} className={`bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-all duration-300 group ${idx >= 3 ? 'lg:col-span-1 md:col-span-1' : ''} ${idx === 4 ? 'md:col-span-2 lg:col-span-1' : ''}`}>
                    <div className="mb-4 p-3 bg-white/5 w-fit rounded-xl group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-black/20">
                        {item.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-slate-100 group-hover:text-white transition-colors">
                        {item.title}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed group-hover:text-slate-300 transition-colors">
                        {item.description}
                    </p>
                </div>
            ))}
        </div>

        {/* Call to Action Section */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 pt-8 pb-12">
            <button 
                onClick={() => navigate('/')}
                className="px-8 py-4 rounded-xl text-slate-400 hover:text-white font-medium flex items-center gap-2 hover:bg-white/5 transition-all text-sm md:text-base"
            >
                <Home size={18} />
                Volver al Inicio
            </button>

            <button 
                onClick={() => navigate('/auth/register')}
                className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-lg rounded-xl transition-all shadow-xl hover:shadow-purple-500/30 flex items-center gap-3 overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 blur-md" />
                <span>Crear mi Cuenta Ahora</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>

        <p className="text-center text-xs text-slate-600 max-w-md mx-auto">
            Únete a miles de jugadores que ya compiten con transparencia y seguridad garantizada.
        </p>

      </div>
    </div>
  );
};
