import { useEffect, useState } from 'react';

export function ReplayDownloader() {
  const [replay, setReplay] = useState<{ game_id: string; replay: any } | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ game_id: string; replay: any }>).detail;
      if (detail?.replay) setReplay(detail);
    };
    window.addEventListener('vivo-match-finished', handler as EventListener);
    return () => window.removeEventListener('vivo-match-finished', handler as EventListener);
  }, []);

  if (!replay) return null;

  const blob = new Blob([JSON.stringify(replay.replay, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  return (
    <div className="fixed bottom-4 right-4 z-[200]">
      <a
        href={url}
        download={`${replay.game_id}.match-replay.json`}
        className="px-4 py-2 bg-foreground text-background rounded-lg text-sm font-bold shadow-lg"
        onClick={() => setTimeout(() => URL.revokeObjectURL(url), 1000)}
      >
        Descargar replay
      </a>
    </div>
  );
}
