import type { GameState, PlayerColor } from '../../entities/game/types';
import { OFF_WHITE, OFF_BLACK } from '../../entities/game/constants';
import { getValidMoves } from '../../entities/game/rules';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function formatPositionSummary(state: GameState, perspective: PlayerColor): string {
  const board = state.board;
  const turn = state.turn;
  const aiColor = perspective;
  const oppColor: PlayerColor = perspective === 'white' ? 'black' : 'white';
  const sign = (color: PlayerColor) => (color === 'white' ? 1 : -1);

  const aiBar = clamp(Math.abs(board[sign(aiColor) === 1 ? 26 : 27] ?? 0), 0, 99);
  const oppBar = clamp(Math.abs(board[sign(oppColor) === 1 ? 26 : 27] ?? 0), 0, 99);
  const aiOff = clamp(Math.abs((board[sign(aiColor) === 1 ? OFF_WHITE : OFF_BLACK] ?? 0)), 0, 99);
  const oppOff = clamp(Math.abs((board[sign(oppColor) === 1 ? OFF_WHITE : OFF_BLACK] ?? 0)), 0, 99);

  const aiHome = rangeCount(board, aiColor, homeRange(aiColor));
  const oppHome = rangeCount(board, oppColor, homeRange(oppColor));

  const aiExposed = exposedBlots(board, aiColor);
  const oppExposed = exposedBlots(board, oppColor);

  const seq = getValidMoves(state).length;

  const lines: string[] = [];
  lines.push(`[POSICIÓN] Turno: ${turn === 'white' ? 'Blancas' : 'Negras'} | Perspectiva IA: ${aiColor === 'white' ? 'Blancas' : 'Negras'}`);
  lines.push(`Dados: ${(state.dice || []).join(', ')} | Jugadas legales ahora: ${seq}`);
  lines.push(`Barra -> IA: ${aiBar} | Rival: ${oppBar}`);
  lines.push(`Fichas fuera -> IA: ${aiOff} | Rival: ${oppOff}`);
  lines.push(`Fichas en casa (último cuadrante) -> IA: ${aiHome} | Rival: ${oppHome}`);
  lines.push(`Blots expuestos -> IA: ${aiExposed} | Rival: ${oppExposed}`);
  lines.push(`Cubo: ${state.cube}x${state.cubeOwner ? (state.cubeOwner === 'white' ? ' blancas' : ' negras') : ' neutral'}`);
  lines.push(`Marcador -> ${perspective === 'white' ? 'IA' : 'Rival'}: ${state.matchScore[perspective]} | ${perspective === 'white' ? 'Rival' : 'IA'}: ${state.matchScore[perspective === 'white' ? 'black' : 'white']}`);

  return lines.join('\n');
}

export function formatLegalMovesSummary(state: GameState, _perspective: PlayerColor): string {
  const moves = getValidMoves(state).filter(m => m.from >= 1 && m.from <= 24 && m.to >= 1 && m.to <= 24);
  if (!moves.length) {
    return `[JUGADAS] 0 movimientos legales en tablero.`;
  }

  const lines: string[] = [`[JUGADAS] Legales en tablero: ${moves.length}`];
  for (const m of moves) {
    lines.push(`- ${m.from} -> ${m.to} (dado ${m.die})`);
  }
  return lines.join('\n');
}

function homeRange(color: PlayerColor): number[] {
  if (color === 'white') return [19, 20, 21, 22, 23, 24];
  return [1, 2, 3, 4, 5, 6];
}

function rangeCount(board: number[], color: PlayerColor, range: number[]): number {
  const s = color === 'white' ? 1 : -1;
  return range.reduce((acc, idx) => acc + clamp(s * (board[idx] ?? 0), 0, 99), 0);
}

function exposedBlots(board: number[], color: PlayerColor): number {
  const s = color === 'white' ? 1 : -1;
  let count = 0;
  for (let i = 1; i <= 24; i++) {
    const v = board[i] ?? 0;
    if (s * v === 1) count++;
  }
  return count;
}
