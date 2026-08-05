import React, { useState, useEffect, useRef } from 'react';
import { getLearningStats } from '../../features/ai-worker/api';
import { 
  Bot, 
  Settings, 
  Trophy, 
  ShoppingCart, 
  Camera, 
  LogIn, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  Monitor,
  Gamepad2,
  Hand,
  Users
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/api/supabase';
import { HandTrackingSwitch } from '../../shared/ui/HandTrackingSwitch/HandTrackingSwitch';
import styles from './OctagonMenu.module.css';

const SIDES = 9;
const ANGLE = 360 / SIDES;

interface MenuItem {
  id: number;
  title: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  action: () => void;
  renderExtra?: () => React.ReactNode; // For stats or options
}

interface OctagonMenuProps {
  onClose: () => void;
  onCalibrate?: () => void;
  initialIndex?: number;
}

export const OctagonMenu: React.FC<OctagonMenuProps> = ({ onClose, onCalibrate, initialIndex = 0 }) => {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [dimensions, setDimensions] = useState({ width: 320, height: 480, radius: 0 });
  const navigate = useNavigate();
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Read hand tracking from localStorage; changes are synced via the
  // `board-settings-changed` event so GameBoard can keep the camera aligned.
  const handTrackingFromStorage = typeof window !== 'undefined'
    ? localStorage.getItem('vivo_hand_tracking_enabled') === 'true'
    : false;
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(handTrackingFromStorage);

  useEffect(() => {
    const sync = () => {
      const saved = localStorage.getItem('vivo_hand_tracking_enabled');
      if (saved !== null) setIsHandTrackingEnabled(saved === 'true');
    };
    window.addEventListener('board-settings-changed', sync);
    return () => window.removeEventListener('board-settings-changed', sync);
  }, []);

  // Options states
  const [translucency, setTranslucency] = useState(() => {
    const saved = localStorage.getItem('board_translucency');
    return saved ? parseInt(saved, 10) : 80;
  });
  // 'playerColor' stores the game-engine color ('white' or 'black').
  // 'Rojo' in the UI = 'black' internally (the AI/engine always calls the opponent 'black').
  const [playerColor, setPlayerColor] = useState<'black'|'white'>(() => {
    return (localStorage.getItem('selected_team') as 'black' | 'white') || 'white';
  });
  // 'orientation' stores the exit direction: 'right' (White exits right) or 'left' (Black/Red exits left).
  // These map 1-to-1 with the game engine's perspective: right=white, left=black.
  const [orientation, setOrientation] = useState<'left'|'right'>(() => {
    return (localStorage.getItem('board_orientation') as 'left' | 'right') || 'right';
  });
  const [use3DStyle, setUse3DStyle] = useState(true);
  // 1..10 dificultad IA (1 básico .. 10 master). Persistida en localStorage.
  const [aiDifficulty, setAiDifficulty] = useState<number>(() => {
    const saved = localStorage.getItem('vivo_ai_difficulty');
    return saved ? parseInt(saved, 10) : 5;
  });
  const clampDifficulty = (value: number) => Math.max(1, Math.min(10, Math.round(value)));

  const [leaderboardData, setLeaderboardData] = useState<{name: string, points: number}[]>([]);
  const [dynamicContent, setDynamicContent] = useState<Record<number, string>>({});
  const [aiTrainingStats, setAiTrainingStats] = useState<{ count: number; wisdomScore: number } | null>(null);

  // Persist settings to localStorage when changed
  useEffect(() => {
    localStorage.setItem('vivo_hand_tracking_enabled', isHandTrackingEnabled.toString());
    window.dispatchEvent(new CustomEvent('board-settings-changed'));
  }, [isHandTrackingEnabled]);

  useEffect(() => {
    localStorage.setItem('board_translucency', translucency.toString());
    window.dispatchEvent(new CustomEvent('board-settings-changed'));
  }, [translucency]);

  useEffect(() => {
    // Store the internal game-engine color ('white' or 'black').
    localStorage.setItem('selected_team', playerColor);
    window.dispatchEvent(new CustomEvent('board-settings-changed'));
  }, [playerColor]);

  useEffect(() => {
    localStorage.setItem('board_orientation', orientation);
    // Keep selected_team in sync with orientation so both settings agree.
    // 'right' exit direction = White player. 'left' exit direction = Black/Red player.
    const colorFromOrientation: 'white' | 'black' = orientation === 'right' ? 'white' : 'black';
    if (colorFromOrientation !== playerColor) {
      setPlayerColor(colorFromOrientation);
    }
    window.dispatchEvent(new CustomEvent('board-settings-changed'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation]);

  useEffect(() => {
    localStorage.setItem('vivo_ai_difficulty', aiDifficulty.toString());
  }, [aiDifficulty]);


  // Fetch real CRM Leaderboard data
  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const { data: result, error } = await supabase.rpc('get_king_of_the_hill');
        if (!error && result && result.length > 0) {
          setLeaderboardData(result[0].top_points?.slice(0, 3) || []);
        }
      } catch (err) {
        console.error('Leaderboard fetch failed:', err);
      }
    };
    fetchLeaderboard();
  }, []);

  // Fetch real AI training stats from Supabase
  useEffect(() => {
    getLearningStats().then(stats => setAiTrainingStats(stats));
  }, []);

  // Fetch dynamic content from Admin CRM
  useEffect(() => {
    const fetchDynamicContent = async () => {
      try {
        const { data, error } = await supabase
          .from('octagon_settings')
          .select('section_id, content');
        
        if (!error && data) {
          const contentMap = data.reduce((acc, item) => {
            acc[item.section_id] = item.content;
            return acc;
          }, {} as Record<number, string>);
          setDynamicContent(contentMap);
        }
      } catch (err) {
        console.error('Dynamic content fetch failed:', err);
      }
    };
    fetchDynamicContent();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;
      
      let panelWidth = 320;
      let panelHeight = 480;
      const isLowHeight = winHeight < 500;

      if (winWidth < 640) {
        panelWidth = Math.min(winWidth - 60, 300);
        panelHeight = isLowHeight ? Math.min(winHeight * 0.85, 340) : Math.min(winHeight * 0.6, 420);
      } else if (winWidth < 1024) {
        panelWidth = isLowHeight ? 340 : 380;
        panelHeight = isLowHeight ? Math.min(winHeight * 0.85, 360) : 520;
      } else {
        panelWidth = isLowHeight ? 380 : 420;
        panelHeight = isLowHeight ? Math.min(winHeight * 0.85, 400) : 580;
      }

      const gap = winWidth < 640 ? 20 : 40;
      const effectiveWidth = panelWidth + gap;
      const radius = Math.round((effectiveWidth / 2) / Math.tan(Math.PI / SIDES));
      
      setDimensions({ width: panelWidth, height: panelHeight, radius });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const next = () => setSelectedIndex(prev => prev + 1);
  const prev = () => setSelectedIndex(prev => prev - 1);

  const handleTouchStart = (e: React.TouchEvent) => { 
    if (e.targetTouches[0]) {
      touchStartX.current = e.targetTouches[0].clientX; 
      touchEndX.current = e.targetTouches[0].clientX; // Prevenir "swipes fantasmas" en toques
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => { 
    if (e.targetTouches[0]) touchEndX.current = e.targetTouches[0].clientX; 
  };
  const handleTouchEnd = () => {
    const distance = touchStartX.current - touchEndX.current;
    if (Math.abs(distance) > 50) {
      if (distance > 0) next();
      else prev();
    }
    touchStartX.current = 0; touchEndX.current = 0;
  };

  const menuItems: MenuItem[] = [
    { 
      id: 0, 
      title: 'JUGAR VS IA', 
      icon: <Bot size={64} className="text-cyan-400" />, 
      color: 'cyan',
      description: 'Duelos estratégicos contra el CPU.',
      action: () => {
        const saved = localStorage.getItem('vivo_ai_difficulty');
        const difficulty = saved ? parseInt(saved, 10) : 5;
        navigate(`/game?mode=ai&difficulty=${clampDifficulty(difficulty)}`);
      },
      renderExtra: () => {
        // Determine real level label from actual data
        const score = aiTrainingStats?.wisdomScore ?? 0;
        const count = aiTrainingStats?.count ?? 0;
        let levelLabel = 'Novato';
        if (score >= 5) levelLabel = 'Aprendiz';
        if (score >= 15) levelLabel = 'Analítico';
        if (score >= 40) levelLabel = 'Avanzado';
        if (score >= 70) levelLabel = 'Experto';
        if (score >= 95) levelLabel = 'Gran Maestro';

        // Color shifts as training progresses
        const barColor = score < 20 ? '#22d3ee' : score < 50 ? '#6366f1' : score < 80 ? '#a855f7' : '#f59e0b';

        return (
          <div className="flex flex-col gap-3 mt-4 bg-cyan-900/20 p-3 rounded-lg border border-cyan-500/20 w-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-widest">Entrenamiento IA</span>
              <span className="text-[10px] font-mono text-white/50">REAL</span>
            </div>

            {/* Score + Level */}
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-black text-white leading-none">{score}%</span>
                <span className="text-[10px] font-mono text-white/50">
                  {aiTrainingStats ? `${count.toLocaleString()} / 500.000` : 'Cargando datos...'}
                </span>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                style={{ color: barColor, borderColor: barColor + '50', backgroundColor: barColor + '15' }}
              >
                {levelLabel}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${score}%`,
                  background: `linear-gradient(to right, #22d3ee, ${barColor})`,
                  boxShadow: `0 0 8px ${barColor}80`
                }}
              />
            </div>

            {/* Pattern count */}
            <div className="flex justify-between items-center text-[10px] text-white/40 font-mono border-t border-cyan-500/10 pt-2">
              <span>{aiTrainingStats ? `${count.toLocaleString()} posiciones aprendidas` : 'Cargando datos...'}</span>
              <span className="text-white/25">/ 100.000</span>
            </div>

            {/* Difficulty selector */}
            <div className="flex flex-col gap-2 border-t border-cyan-500/10 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-cyan-400">Dificultad IA</span>
                <span className="text-[10px] font-mono text-white/80">{aiDifficulty}/10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={aiDifficulty}
                onChange={(e) => setAiDifficulty(parseInt(e.target.value, 10))}
                className="accent-cyan-400 h-1 w-full"
              />
              <div className="flex justify-between text-[8px] text-white/30 font-mono">
                <span>BÁSICO</span>
                <span>AVANZADO</span>
                <span>MASTER</span>
              </div>
            </div>
          </div>
        );
      }
    },
    { 
      id: 1, 
      title: 'ENTRE HUMANOS', 
      icon: <Users size={64} className="text-rose-400" />, 
      color: 'rose',
      description: 'Partidas 1vs1 contra otros humanos.',
      action: () => navigate('/dashboard?tab=my_tournaments'),
      renderExtra: () => (
        <div className="flex flex-col gap-2 mt-4 bg-rose-900/20 p-3 rounded-lg border border-rose-500/20 w-full text-center">
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-widest">MULTIJUGADOR ONLINE</span>
            <p className="text-[10px] text-white/60">Crea salas privadas con videochat integrado o únete al emparejamiento global.</p>
        </div>
      )
    },
    { 
      id: 2, 
      title: 'OPCIONES', 
      icon: <Settings size={64} className="text-slate-400" />, 
      color: 'slate',
      description: 'Personaliza tu experiencia visual.',
      action: () => {
        // Options are handled via inline controls
      },
      renderExtra: () => (
        <div className="flex flex-col gap-4 mt-2 w-full">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-400">Traslucidez: {translucency}%</label>
            <input type="range" min="20" max="100" value={translucency} onChange={(e) => setTranslucency(parseInt(e.target.value))} className="accent-gold-soft h-1" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Color de Fichas</span>
            <div className="flex gap-2">
              {/* 'white' and 'black' are the internal game-engine values */}
              <button
                onClick={() => { setPlayerColor('white'); setOrientation('right'); }}
                className={`flex-1 py-1 rounded border transition-all duration-300 cursor-pointer ${
                  playerColor === 'white' ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/20'
                }`}
              >
                Blanco
              </button>
              <button
                onClick={() => { setPlayerColor('black'); setOrientation('left'); }}
                className={`flex-1 py-1 rounded border transition-all duration-300 cursor-pointer ${
                  playerColor === 'black' ? 'bg-rose-600 text-white border-rose-600' : 'bg-transparent text-white border-white/20'
                }`}
              >
                Rojo
              </button>
            </div>
            <p className="text-[9px] text-slate-500 text-center">
              {playerColor === 'white' ? 'Fichas blancas · Salida por la derecha' : 'Fichas rojas · Salida por la izquierda'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Dirección de Salida</span>
            <div className="flex gap-2">
              <button
                onClick={() => setOrientation('left')}
                className={`flex-1 py-1 rounded border transition-all duration-300 cursor-pointer ${
                  orientation === 'left' ? 'bg-gold-soft/20 border-gold-soft text-white' : 'bg-transparent border-white/20 text-white/60'
                }`}
              >
                Izquierda
              </button>
              <button
                onClick={() => setOrientation('right')}
                className={`flex-1 py-1 rounded border transition-all duration-300 cursor-pointer ${
                  orientation === 'right' ? 'bg-gold-soft/20 border-gold-soft text-white' : 'bg-transparent border-white/20 text-white/60'
                }`}
              >
                Derecha
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-500/10 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-amber-500">Diseño 3D (BETA)</span>
              <button 
                onClick={() => setUse3DStyle(!use3DStyle)}
                className={`w-10 h-5 rounded-full relative transition-colors ${use3DStyle ? 'bg-amber-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${use3DStyle ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
            <p className="text-[8px] text-slate-500 italic">Habilita el nuevo switch industrial para la cámara.</p>
          </div>
        </div>
      )
    },
    { 
      id: 5, 
      title: 'CÁMARA AR', 
      icon: <Camera size={64} className={isHandTrackingEnabled ? 'text-violet-400' : 'text-slate-500'} />, 
      color: 'violet',
      description: 'Controla el juego con tus manos.',
      action: () => {
        setIsHandTrackingEnabled(prev => !prev);
      },
      renderExtra: () => (
        <div className="flex flex-col gap-2 mt-2 w-full">
          <div className="flex items-center justify-between bg-violet-900/20 p-2 rounded-lg border border-violet-500/20">
            <span className="text-xs font-bold uppercase">{isHandTrackingEnabled ? 'ACTIVO' : 'INACTIVO'}</span>
            {use3DStyle ? (
              <HandTrackingSwitch 
                checked={isHandTrackingEnabled} 
                onChange={setIsHandTrackingEnabled} 
                scale={0.25} 
              />
            ) : (
              <button 
                onClick={() => setIsHandTrackingEnabled(!isHandTrackingEnabled)}
                className={`w-12 h-6 rounded-full relative transition-colors ${isHandTrackingEnabled ? 'bg-violet-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isHandTrackingEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            )}
          </div>
            <div className="grid grid-cols-3 gap-1 text-[8px] text-center text-violet-300/60 uppercase mb-2">
                <div className="flex flex-col items-center gap-1"><Monitor size={14} /> Ratón</div>
                <div className="flex flex-col items-center gap-1"><Gamepad2 size={14} /> Táctil</div>
                <div className="flex flex-col items-center gap-1"><Hand size={14} /> Manos</div>
            </div>
            
            {onCalibrate && (
              <button 
                onClick={(e) => {
                   e.stopPropagation();
                   onClose();
                   onCalibrate();
                }}
                className="w-full py-2 bg-violet-500/20 hover:bg-violet-500/40 border border-violet-500/30 rounded-lg text-[10px] font-black text-violet-300 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <Settings size={12} />
                AJUSTAR CALIBRACIÓN
              </button>
            )}
        </div>
      )
    },
    { 
      id: 3, 
      title: 'LIDERAZGO', 
      icon: <Trophy size={64} className="text-amber-400" />, 
      color: 'amber',
      description: 'Ranking global de los mejores jugadores.',
      action: () => {
        // Dashboard or specific leaderboard page
        navigate('/dashboard');
      },
      renderExtra: () => (
        <div className="flex flex-col gap-2 mt-4 bg-amber-900/20 p-4 rounded-xl border border-amber-500/30 w-full overflow-hidden items-center text-center">
            {leaderboardData.length > 0 ? (
                <div className="flex flex-col items-center gap-2">
                    <div className="relative">
                      <Trophy size={32} className="text-amber-400 mb-1" />
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black">1</span>
                    </div>
                    <span className="text-sm font-bold text-amber-100 truncate w-full px-2">{leaderboardData[0]?.name || 'Anónimo'}</span>
                    <div className="bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
                      <span className="text-[10px] font-bold text-amber-400">{leaderboardData[0]?.points?.toLocaleString()} PTS</span>
                    </div>
                </div>
            ) : (
                <p className="text-[10px] text-white/40 italic text-center py-4">Cargando líder actual...</p>
            )}
        </div>
      )
    },
    { 
      id: 4, 
      title: 'TIENDA VIVO', 
      icon: <ShoppingCart size={64} className="text-emerald-400" />, 
      color: 'emerald',
      description: 'Accesorios y tableros premium.',
      action: () => window.open('https://amazon.es', '_blank'),
      renderExtra: () => {
        let products: Record<string, string>[] = [];
        try {
          if (dynamicContent[4]) {
            const parsed = JSON.parse(dynamicContent[4]);
            if (Array.isArray(parsed)) products = parsed;
          }
        } catch {
          // Ignore parse errors silently
        }

        if (products.length > 0) {
          return (
            <div className="mt-4 w-full max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-500/20 pr-1 pb-1">
              <div className="grid grid-cols-2 gap-2">
                {products.map((p, idx) => (
                  <a 
                    key={idx} 
                    href={p.affiliateUrl || `https://www.amazon.es/dp/${p.asin}/?tag=thomaspirzl-21`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="bg-slate-900 border border-emerald-500/20 rounded-lg p-2 flex flex-col items-center text-center hover:border-emerald-500/50 hover:bg-slate-800 transition-all group shadow-sm shadow-emerald-900/10"
                  >
                    <div className="w-full h-16 bg-white/5 rounded flex items-center justify-center mb-2 overflow-hidden relative">
                       {p.imageUrl ? (
                         <img src={p.imageUrl} alt={p.title} className="h-full object-contain" />
                       ) : (
                         <ShoppingCart className="text-slate-500" />
                       )}
                       {p.rating && (
                         <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] font-bold text-amber-400 py-[2px] backdrop-blur-sm">
                           ★ {p.rating}
                         </span>
                       )}
                    </div>
                    <span className="text-[9px] font-bold text-slate-300 line-clamp-2 w-full leading-tight mb-1 group-hover:text-emerald-400 transition-colors">
                      {p.title || `Producto ${p.asin}`}
                    </span>
                    <span className="text-[10px] font-black text-emerald-400 mt-auto bg-emerald-500/10 px-2 py-0.5 rounded-sm">
                      {p.price || 'Ver en Amazon'}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div className="mt-4 p-3 bg-emerald-900/20 rounded-lg border border-emerald-500/20 text-center text-[10px] text-emerald-400 animate-pulse w-full">
            Próximamente: Tableros exclusivos en Amazon.
          </div>
        );
      }
    },
    { 
      id: 6, 
      title: 'CRM / REGISTRO', 
      icon: <LogIn size={64} className="text-blue-400" />, 
      color: 'blue',
      description: 'Únete a la comunidad de VIVO.',
      action: () => navigate('/auth/register'),
      renderExtra: () => (
        <div className="mt-4 flex flex-col gap-2 w-full">
             <button onClick={() => navigate('/auth/login')} className="bg-blue-600/20 border border-blue-500 text-blue-400 py-2 rounded text-xs font-bold">INICIAR SESIÓN</button>
             <button onClick={() => navigate('/auth/register')} className="bg-white text-blue-900 py-2 rounded text-xs font-bold">CREAR CUENTA</button>
        </div>
      )
    },
    { 
      id: 7, 
      title: 'EXIT PARTIDA', 
      icon: <LogOut size={64} className="text-red-500" />, 
      color: 'red',
      description: 'Abandona el juego y sal a la arena.',
      action: () => onClose(),
      renderExtra: () => (
        <div className="mt-8 text-center text-red-400/60 text-[10px] uppercase font-bold tracking-widest">
           ¿Seguro que quieres salir?
        </div>
      )
    },
    { 
      id: 8, 
      title: 'MINIJUEGOS', 
      icon: <Gamepad2 size={64} className="text-fuchsia-400" />, 
      color: 'fuchsia',
      description: 'Arcade VIVO - Pong Retro.',
      action: () => navigate('/minigames/pong'),
      renderExtra: () => (
        <div className="mt-4 flex flex-col gap-2 w-full text-center">
             <div className="bg-fuchsia-900/20 p-3 rounded-lg border border-fuchsia-500/20">
                <span className="text-[10px] text-fuchsia-300 font-mono tracking-widest uppercase">1 Jugador VS CPU</span>
             </div>
        </div>
      )
    },
  ];

  const currentRotation = -selectedIndex * ANGLE;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-md transition-all duration-700 animate-in fade-in"
      onTouchStart={handleTouchStart} 
      onTouchMove={handleTouchMove} 
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className={styles.scene} 
        style={{ height: dimensions.height, perspective: '1200px' }}
      >
        <div 
          className={styles.carousel} 
          style={{ 
            width: dimensions.width, 
            height: dimensions.height, 
            transform: `translateZ(-${dimensions.radius}px) rotateY(${currentRotation}deg)`,
            '--panel-width': `${dimensions.width}px`,
            '--panel-height': `${dimensions.height}px`
          } as React.CSSProperties}
        >
          {menuItems.map((item, index) => {
            // Calculate if item is "active" (facing the front)
            const normalizedRotation = ((selectedIndex % SIDES) + SIDES) % SIDES;
            const isActive = normalizedRotation === index;
            
            const isLowHeight = window.innerHeight < 500;
            const cardClass = `${styles.carouselCell} ${isLowHeight ? styles.compact : ''}`;
            const boxClass = `${styles.contextBox} ${isActive ? styles.activeBox : ''}`;

            return (
              <div 
                key={item.id} 
                className={cardClass}
                style={{ 
                  transform: `rotateY(${index * ANGLE}deg) translateZ(${dimensions.radius}px)`,
                  opacity: isActive ? 1 : 0.3,
                  scale: isActive ? 1 : 0.9,
                  filter: isActive ? 'none' : 'blur(2px)',
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 10 : 1
                }}
              >
                <div className={boxClass}>
                  <div className={styles.menuIcon} style={{ color: `var(--${item.color}-400)` }}>
                    {item.icon}
                  </div>
                  <div className="flex flex-col items-center gap-1 mb-3">
                    <span className={styles.menuTitle} style={{ color: `var(--${item.color}-color)` }}>{item.title}</span>
                    <p className={styles.menuDescription}>{item.description}</p>
                  </div>
                  
                  {item.renderExtra?.()}

                  {/* Dynamic Admin Content */}
                  {dynamicContent[item.id] && item.id !== 4 && (
                    <div className="mt-4 w-full p-4 bg-black/40 border border-gold-soft/40 rounded-lg max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-gold-soft/20 text-[10px] text-white/80 leading-relaxed font-sans text-left">
                      {dynamicContent[item.id]}
                    </div>
                  )}
                </div>

                {/* Only show bottom buttons for IDs 0, 1, 7, and 8 */}
                {[0, 1, 7, 8].includes(item.id) && (
                  <button 
                    className={`${styles.accessButton} w-full mt-4`}
                    style={{ backgroundColor: `var(--${item.color}-color)` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isActive) {
                        setSelectedIndex(index);
                      } else {
                        item.action();
                      }
                    }}
                  >
                    {item.id === 7 ? 'SALIR' : 'ACCEDER'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Indicators */}
      <div className="flex gap-2 mt-12">
        {menuItems.map((_, i) => (
          <div 
            key={i} 
            className={`w-2 h-2 rounded-full transition-all duration-500 ${(((selectedIndex % SIDES) + SIDES) % SIDES) === i ? 'bg-gold-soft w-8' : 'bg-white/20'}`}
          />
        ))}
      </div>

      {/* Manual Buttons for Desktop */}
      <button className={`${styles.navButton} ${styles.prevButton}`} onClick={prev} aria-label="Anterior"><ChevronLeft size={32} /></button>
      <button className={`${styles.navButton} ${styles.nextButton}`} onClick={next} aria-label="Siguiente"><ChevronRight size={32} /></button>
      
      {/* Legend / Tip */}
      <p className="fixed bottom-8 text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold">
        Desliza para explorar el menú VIVO
      </p>
    </div>
  );
};
