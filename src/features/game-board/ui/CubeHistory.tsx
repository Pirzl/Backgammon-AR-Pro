/**
 * Cube History Component
 * Shows history of doubling cube actions in a vertical column
 */

interface CubeHistoryEntry {
  id: string;
  actor: 'white' | 'black';
  accion: 'offer' | 'accept' | 'deny';
  valor_cubo: number;
  timestamp: Date;
}

interface CubeHistoryProps {
  entries: CubeHistoryEntry[];
  myColor: 'white' | 'black' | null;
}

export function CubeHistory({ entries, myColor }: CubeHistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-amber-300/40">
        Sin historial
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto space-y-2 pr-2">
      {entries.map((entry) => {
        const actorName = entry.actor === 'white' ? 'BLANCAS' : 'ROJAS';
        const isMyAction = entry.actor === myColor;
        
        let actionText = '';
        let bgColor = '';
        
        switch (entry.accion) {
          case 'offer':
            actionText = `x${entry.valor_cubo} ofrecido por ${actorName}`;
            bgColor = isMyAction ? 'bg-amber-600/30' : 'bg-amber-800/20';
            break;
          case 'accept':
            actionText = `x${entry.valor_cubo} aceptado por ${actorName}`;
            bgColor = isMyAction ? 'bg-emerald-600/30' : 'bg-emerald-800/20';
            break;
          case 'deny':
            actionText = `x${entry.valor_cubo} rechazado por ${actorName}`;
            bgColor = isMyAction ? 'bg-rose-600/30' : 'bg-rose-800/20';
            break;
        }

        return (
          <div
            key={entry.id}
            className={`${bgColor} rounded-lg p-2 text-xs border border-amber-700/20 backdrop-blur-sm animate-in fade-in slide-in-from-right-2 duration-300`}
          >
            <div className="font-medium text-amber-200/90">{actionText}</div>
            <div className="text-[10px] text-amber-300/50 mt-1">
              {new Date(entry.timestamp).toLocaleTimeString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
