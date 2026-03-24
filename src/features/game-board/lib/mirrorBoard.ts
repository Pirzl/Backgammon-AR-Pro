import { BAR_WHITE, BAR_BLACK, OFF_WHITE, OFF_BLACK } from '../../../entities/game/constants';

/**
 * mirrorBoardForPlayer
 * 
 * Transforms the board array so that Black sees the board from their perspective.
 * White always sees the default layout (points 1-6 at bottom-right = home).
 * Black sees the board mirrored (points 19-24 at bottom-right = their home).
 * 
 * The transformation remaps:
 *  - Points 1-24: index X → index (25 - X)
 *  - BAR_WHITE(26) ↔ BAR_BLACK(27)
 *  - OFF_WHITE(28) ↔ OFF_BLACK(29)
 *  - All checker values are negated (so "my" pieces are always positive)
 * 
 * This is a RENDERING-ONLY transform. Game rules stay in logical coordinates.
 */
export function mirrorBoardForPlayer(
  board: number[],
  myColor: 'white' | 'black' | null
): number[] {
  // White or null: no transformation needed
  if (myColor !== 'black') return board;

  const mirrored = new Array(board.length).fill(0);

  // Mirror points 1-24: swap index X with (25 - X)
  for (let i = 1; i <= 24; i++) {
    mirrored[25 - i] = board[i] ?? 0;
  }

  // Swap bars: BAR_WHITE(26) ↔ BAR_BLACK(27)
  mirrored[BAR_WHITE] = board[BAR_BLACK] ?? 0;  // Their bar → "opponent bar" position
  mirrored[BAR_BLACK] = board[BAR_WHITE] ?? 0;  // My bar → "my bar" position

  // Swap off trays: OFF_WHITE(28) ↔ OFF_BLACK(29)
  mirrored[OFF_WHITE] = board[OFF_BLACK] ?? 0;  // Their off → "opponent off" position
  mirrored[OFF_BLACK] = board[OFF_WHITE] ?? 0;  // My off → "my off" position

  // Preserve index 0 (unused) and index 25 (unused)
  mirrored[0] = board[0] ?? 0;

  return mirrored;
}

/**
 * mirrorPointId
 * 
 * Converts a visual point ID back to logical coordinates for game rules.
 * Used when the player taps on a point — the tap handler receives visual IDs
 * which must be converted back to logical IDs before dispatching to the reducer.
 */
export function mirrorPointId(
  visualPointId: number,
  myColor: 'white' | 'black' | null
): number {
  if (myColor !== 'black') return visualPointId;

  // Standard points: visual → logical = 25 - visual
  if (visualPointId >= 1 && visualPointId <= 24) {
    return 25 - visualPointId;
  }

  // Swap bar IDs
  if (visualPointId === BAR_WHITE) return BAR_BLACK;
  if (visualPointId === BAR_BLACK) return BAR_WHITE;

  // Swap off IDs
  if (visualPointId === OFF_WHITE) return OFF_BLACK;
  if (visualPointId === OFF_BLACK) return OFF_WHITE;

  return visualPointId;
}
