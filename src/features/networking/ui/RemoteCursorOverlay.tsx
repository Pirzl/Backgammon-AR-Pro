import { Hand } from 'lucide-react';

interface RemoteCursorProps {
  x: number;
  y: number;
  gesture: 'open' | 'pinch';
  isActive: boolean;
}

export function RemoteCursorOverlay({ x, y, gesture, isActive }: RemoteCursorProps) {
  if (!isActive) return null;

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-40 overflow-hidden"
      style={{ perspective: '1000px' }}
    >
      <div 
        className="absolute transition-all duration-100 ease-out will-change-transform"
        style={{
          left: 0,
          top: 0,
          transform: `translate3d(${x}px, ${y}px, 0) scale(${gesture === 'pinch' ? 0.9 : 1})`,
        }}
      >
        <div className={`p-2 rounded-full ${gesture === 'pinch' ? 'bg-cyan-500/50' : 'bg-cyan-500/20'} backdrop-blur-sm border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]`}>
          <Hand 
            size={32} 
            className={`text-cyan-200 ${gesture === 'pinch' ? 'scale-90 fill-cyan-500/50' : ''} transition-transform`} 
          />
        </div>
        <div className="mt-1 ml-2 px-2 py-0.5 bg-black/50 rounded text-[10px] text-cyan-400 font-mono tracking-widest backdrop-blur-md">
          OPPONENT
        </div>
      </div>
    </div>
  );
}
