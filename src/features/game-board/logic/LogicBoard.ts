import {
  BAR_WHITE,
  BAR_BLACK,
  OFF_WHITE,
  OFF_BLACK,
} from "../../../entities/game/constants";

/**
 * Logical Board Coordinate System
 *
 * Grid Definition (15x14 nominal grid for aspect ratio calculation):
 * - Width: 13 units (6 points left + 1 bar + 6 points right) + 2 units (margins/off) = ~15 units
 * - Height: 12 units (5 stackable + 2 center gap + 5 stackable) + 2 units (borders) = ~14 units
 *
 * We use a normalized coordinate system (0.0 to 1.0) for resolution independence.
 */

export interface NormalizedPoint {
  x: number; // 0.0 - 1.0 (Left to Right)
  y: number; // 0.0 - 1.0 (Top to Bottom)
}

export class LogicBoard {
  // Logical Constants
  static readonly POINTS_PER_QUADRANT = 6;
  static readonly MAX_STACK_VISIBLE = 5;

  // Normalized Constants (Tunable for visual feel)
  // These represent the % position of the board centers relative to the container
  private static readonly MARGIN_X = 0.055; // Left/Right margin
  private static readonly MARGIN_Y = 0.06; // Top/Bottom margin
  private static readonly BAR_WIDTH = 0.08; // Central Bar width

  /**
   * getPointCenter
   * Returns the normalized center coordinates for a specific point and checker index (stack height)
   */
  static getPointCenter(
    pointId: number,
    stackIdx: number = 0,
  ): NormalizedPoint {
    // 0. Handle Special Zones
    if (pointId === BAR_WHITE) return this.getBarPosition("white", stackIdx);
    if (pointId === BAR_BLACK) return this.getBarPosition("black", stackIdx);
    if (pointId === OFF_WHITE) return this.getOffPosition("white");
    if (pointId === OFF_BLACK) return this.getOffPosition("black");

    // 1. Determine Quadrant and Base Coordinates
    // Points 1-6: Bottom Right (Right to Left) -> actually 1 is far right in standard view?
    // Standard Backgammon:
    // White Home Board (Inner): 1-6.
    // Black Home Board (Inner): 19-24.
    // Usually:
    // Bottom Right: 1-6 (moving Left)
    // Bottom Left: 7-12 (moving Left)
    // Top Left: 13-18 (moving Right)
    // Top Right: 19-24 (moving Right)

    // However, let's verify visual layout from Board.tsx:
    // Bottom-Right (6-1) -> Point 1 is far right? Or Point 6?
    // "renderPointGroup([6, 5, 4, 3, 2, 1], true)" in Bottom-Right div.
    // So 6 is leftmost of that group, 1 is rightmost.

    const isTop = pointId >= 13 && pointId <= 24;
    // const isBottom = !isTop; // Unused

    // 2. Calculate Horizontal Position
    // We have two banks of 6 points separated by a bar.
    // Left Bank: 13-18 (Top), 12-7 (Bottom)
    // Right Bank: 19-24 (Top), 6-1 (Bottom)

    let columnFromLeft: number; // 0-based index in the bank
    let isLeftBank: boolean;

    if (isTop) {
      // 13-18 (Left Bank), 19-24 (Right Bank)
      if (pointId <= 18) {
        isLeftBank = true;
        columnFromLeft = pointId - 13; // 13->0, 18->5
      } else {
        isLeftBank = false;
        columnFromLeft = pointId - 19; // 19->0, 24->5
      }
    } else {
      // 12-7 (Left Bank), 6-1 (Right Bank)
      if (pointId >= 7) {
        isLeftBank = true;
        columnFromLeft = 12 - pointId; // 12->0, 7->5
      } else {
        isLeftBank = false;
        columnFromLeft = 6 - pointId; // 6->0, 1->5
      }
    }

    // 3. Map to Normalized X
    const playAreaWidth = 1.0 - this.MARGIN_X * 2 - this.BAR_WIDTH;
    const bankWidth = playAreaWidth / 2;
    const pointWidth = bankWidth / 6;

    let xBase = this.MARGIN_X;

    if (!isLeftBank) {
      xBase += bankWidth + this.BAR_WIDTH;
    }

    // Center of the point column
    const x = xBase + columnFromLeft * pointWidth + pointWidth / 2;

    // 4. Map to Normalized Y
    // Top Row: y starts at MARGIN_Y and goes down
    // Bottom Row: y starts at (1.0 - MARGIN_Y) and goes up
    const playAreaHeight = 1.0 - this.MARGIN_Y * 2;
    // Rough checker height approximation relative to board height
    // In a square-ish aspect ratio, 12 checkers fit vertically?
    // Let's assume a checker takes up roughly 1/13th of height
    const checkerHeight = playAreaHeight / 14;

    // Stack Offset
    // If stack > 5, we compress (overlap)
    let yOffset = stackIdx * checkerHeight;

    if (stackIdx >= 5) {
      // Compressed visual for tall stacks
      // First 5 take normal space
      // Remaining take compressed space
      
      // Logarithmic compression or simple clamping?
      // Simple overlap for now:
      yOffset =
        Math.min(stackIdx, 4) * checkerHeight +
        Math.max(0, stackIdx - 4) * (checkerHeight * 0.3);
    }

    const y = isTop
      ? this.MARGIN_Y + checkerHeight / 2 + yOffset
      : 1.0 - this.MARGIN_Y - checkerHeight / 2 - yOffset;

    return { x, y };
  }

  private static getBarPosition(
    color: "white" | "black",
    stackIdx: number,
  ): NormalizedPoint {
    const x = 0.5; // Center
    // White Bar is Top (usually), Black Bar is Bottom?
    // From Board.tsx: BAR_WHITE is Top, BAR_BLACK is Bottom

    const isTop = color === "white";
    const centerY = 0.5;
    const offset = 0.05 + stackIdx * 0.04;

    const y = isTop ? centerY - offset : centerY + offset;

    return { x, y };
  }

  private static getOffPosition(
    color: "white" | "black",
  ): NormalizedPoint {
    // Off Tray is usually to the right
    const x = 1.0 - this.MARGIN_X / 2;
    const isTop = color === "black"; // Black bears off to Top Right?
    // Board.tsx: Off Black is Top Tray, Off White is Bottom Tray.

    const y = isTop ? 0.2 : 0.8;
    return { x, y };
  }

  /**
   * getPointFromNormalized
   * Reverse mapping: Given normalized {x,y}, return the Point ID or Special Zone.
   * Returns:
   *  1-24: Board Points
   *  BAR_WHITE/BAR_BLACK: Bar Zones
   *  OFF_WHITE/OFF_BLACK: Off Zones
   *  -1: No valid hit
   */
  static getPointFromNormalized(p: NormalizedPoint): number {
    const { x, y } = p;
    
    // Bounds check
    if (x < 0 || x > 1 || y < 0 || y > 1) return -1;

    // 1. Check Off Trays (Right Margin)
    // Margin X is approx 0.055. Off tray is in that zone?
    // getOffPosition says x = 1.0 - MARGIN_X/2
    if (x > 1.0 - this.MARGIN_X) {
       // Right Margin - Off Tray
       if (y < 0.5) return OFF_BLACK; // Top Right
       return OFF_WHITE; // Bottom Right
    }

    // 2. Check Bar (Center)
    // Bar Width is 0.08
    const playAreaWidth = 1.0 - this.MARGIN_X * 2 - this.BAR_WIDTH;
    const bankWidth = playAreaWidth / 2;
    
    const barStart = this.MARGIN_X + bankWidth;
    const barEnd = barStart + this.BAR_WIDTH;

    if (x >= barStart && x <= barEnd) {
        // Center Bar
        if (y < 0.5) return BAR_WHITE; // Top Center
        return BAR_BLACK; // Bottom Center
    }

    // 3. Check Board Points
    // Determine Top/Bottom
    const isTop = y < 0.5;

    // Determine Bank (Left/Right)
    const isLeftBank = x < barStart;

    // Calculate Column Index within Bank
    const bankStart = isLeftBank ? this.MARGIN_X : barEnd;
    const relativeX = x - bankStart;
    const pointWidth = bankWidth / 6;
    
    // Clamp column index 0-5
    const colIdx = Math.floor(relativeX / pointWidth);
    if (colIdx < 0 || colIdx > 5) return -1; // Should be handled by bar/margin checks but safety first

    // Map back to ID
    // Top Row: 13-18 (Left), 19-24 (Right)
    // Bottom Row: 12-7 (Left), 6-1 (Right)

    if (isTop) {
        if (isLeftBank) {
            // 13 -> 18. colIdx 0 -> 13, 5 -> 18
            return 13 + colIdx;
        } else {
            // 19 -> 24. colIdx 0 -> 19, 5 -> 24
            return 19 + colIdx;
        }
    } else {
        if (isLeftBank) {
            // 12 -> 7. colIdx 0 -> 12, 5 -> 7
            return 12 - colIdx;
        } else {
            // 6 -> 1. colIdx 0 -> 6, 5 -> 1
            return 6 - colIdx;
        }
    }
  }
}
