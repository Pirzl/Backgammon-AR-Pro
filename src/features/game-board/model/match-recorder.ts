export type ReplayMove = {
  from: number;
  to: number;
  die: number;
};

export type ReplayTurn = {
  player: 'white' | 'black';
  dice: number[];
  moves: ReplayMove[];
};

export type MatchReplay = {
  game_id: string;
  started_at: string;
  finished_at: string;
  winner: 'white' | 'black' | null;
  method: 'normal' | 'gammon' | 'backgammon' | null;
  turns: ReplayTurn[];
};

const RECORDERS = new Map<string, MatchRecorder>();

export function getRecorder(gameId: string): MatchRecorder | null {
  return RECORDERS.get(gameId) ?? null;
}

export function ensureRecorder(gameId: string): MatchRecorder {
  const existing = RECORDERS.get(gameId);
  if (existing) return existing;
  const created = new MatchRecorder(gameId);
  RECORDERS.set(gameId, created);
  return created;
}

export function clearRecorder(gameId: string): void {
  RECORDERS.delete(gameId);
}

export class MatchRecorder {
  private readonly gameId: string;
  private readonly startedAt: string;
  private finishedAt = '';
  private winner: 'white' | 'black' | null = null;
  private method: 'normal' | 'gammon' | 'backgammon' | null = null;
  private readonly turns: ReplayTurn[] = [];
  private current: ReplayTurn | null = null;

  constructor(gameId: string) {
    this.gameId = gameId;
    this.startedAt = new Date().toISOString();
  }

  ensureTurn(player: 'white' | 'black', dice: number[]) {
    const last = this.turns[this.turns.length - 1];
    if (!last || last.player !== player || last.dice.join(',') !== dice.join(',')) {
      this.current = { player, dice, moves: [] };
      this.turns.push(this.current);
      return;
    }
    this.current = last;
  }

  addMove(move: ReplayMove) {
    if (!this.current) return;
    this.current.moves.push(move);
  }

  finish(winner: 'white' | 'black' | null, method: 'normal' | 'gammon' | 'backgammon' | null) {
    this.finishedAt = new Date().toISOString();
    this.winner = winner;
    this.method = method;
  }

  toJSON(): MatchReplay {
    return {
      game_id: this.gameId,
      started_at: this.startedAt,
      finished_at: this.finishedAt,
      winner: this.winner,
      method: this.method,
      turns: this.turns,
    };
  }
}
