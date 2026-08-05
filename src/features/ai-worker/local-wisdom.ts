/**
 * Local-first wisdom stats/cache for offline mode.
 *
 * Total wisdom = Supabase remote positions + local trained positions stored here.
 * This avoids depending on online state for the WisdomWidget.
 */

const STORAGE_KEY = 'vivo_local_wisdom';

export interface LocalWisdom {
  count: number;
  gamesPlayed: number;
  updatedAt: string;
}

export function readLocalWisdom(): LocalWisdom {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, gamesPlayed: 0, updatedAt: '' };
    const parsed = JSON.parse(raw);
    if (typeof parsed?.count !== 'number') return { count: 0, gamesPlayed: 0, updatedAt: '' };
    return {
      count: Number(parsed.count) || 0,
      gamesPlayed: Number(parsed.gamesPlayed) || 0,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return { count: 0, gamesPlayed: 0, updatedAt: '' };
  }
}

export function writeLocalWisdom(partial: Partial<LocalWisdom>): LocalWisdom {
  const current = readLocalWisdom();
  const next: LocalWisdom = {
    count: typeof partial.count === 'number' ? partial.count : current.count,
    gamesPlayed: typeof partial.gamesPlayed === 'number' ? partial.gamesPlayed : current.gamesPlayed,
    updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota/private mode errors
  }
  return next;
}
