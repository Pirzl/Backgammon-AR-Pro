import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { getLearningStats } from '../api';

export function WisdomWidget() {
  const [stats, setStats] = useState({ count: 0, wisdomScore: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLearningStats().then((data) => {
      setStats(data);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  // Determine label based on score (Now on 100k scale)
  let levelLabel = 'Novato';
  if (stats.wisdomScore >= 5) levelLabel = 'Aprendiz';
  if (stats.wisdomScore >= 15) levelLabel = 'Analítico';
  if (stats.wisdomScore >= 40) levelLabel = 'Avanzado';
  if (stats.wisdomScore >= 70) levelLabel = 'Experto';
  if (stats.wisdomScore >= 95) levelLabel = 'Gran Maestro';

  return (
    <div className="flex flex-col items-center p-4 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 w-full max-w-xs mx-auto animate-in fade-in duration-700">
      <div className="flex items-center gap-2 mb-2">
        <Brain className={`w-5 h-5 ${stats.wisdomScore > 0 ? 'text-indigo-400' : 'text-gray-500'}`} />
        <span className="text-sm font-medium text-indigo-100/90 uppercase tracking-widest text-[10px]">
          Sabiduría IA
        </span>
      </div>

      <div className="w-full mb-1 flex justify-between items-end">
        <span className="text-2xl font-bold text-white leading-none">
          {stats.wisdomScore}%
        </span>
        <span className="text-xs text-indigo-300 font-medium mb-1">
          {levelLabel}
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out"
          style={{ width: `${stats.wisdomScore}%` }}
        />
      </div>

      <div className="mt-2 text-[10px] text-gray-400 font-mono">
        {stats.count.toLocaleString()} / 500.000 Patrones
      </div>

    </div>
  );
}
