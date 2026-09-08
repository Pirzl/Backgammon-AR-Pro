import { useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Point } from './Point';
import { Checker } from './Checker';
import type { GameState } from '../model/types';
import { BAR_WHITE, BAR_BLACK, OFF_WHITE, OFF_BLACK } from '../../../entities/game/constants';
import type { BoardDimensions } from '../lib/useBoardDimensions';
import type { BoardGeometry } from '../lib/useBoardGeometry';
import { useBoardGeometry } from '../lib/useBoardGeometry';
import { isFeatureEnabled } from '../../../shared/lib/featureFlags';
import { logTelemetry } from '../../../shared/lib/telemetry';
import { mirrorBoardForPlayer, mirrorPointId } from '../lib/mirrorBoard';
import { RollingDiceButton } from '../../../shared/ui/DiceButton/RollingDiceButton';
import { DiceOverlay } from './DiceOverlay';

export interface BoardGeometryEx {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

interface BoardProps {
  state: GameState;
  selectedPoint: number | null;
  validTargetPoints: number[];
  onPointTap: (pointId: number) => void;
  onCheckerTap: (pointId: number) => void;
  isPending: boolean;
  myColor: 'white' | 'black' | null; // H2H perspective
  onCubeClick?: () => void;
  onAcceptDouble?: () => void;
  onDenyDouble?: () => void;
  isTrainingMode?: boolean; // NEW: Disable cube if training mode is active

  // NEW: Roll dice button — rendered just below the centered doubling cube
  onRollDice?: () => void;
  canRoll?: boolean;

  // New Props for Lifted State
  containerRef: React.RefObject<HTMLDivElement | null>;
  dimensions: BoardDimensions;
  getPixelCoordinates: (x: number, y: number) => { x: number; y: number };
  boardOpacity: number;
  geometry?: BoardGeometry;
  animatingChecker?: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    color: 'white' | 'black';
    toPointId: number;
    fromPointId: number;
  } | null;
  isAnimating?: boolean;
}

/**
 * Board component - The primary game surface
 * Manages layout of points and checkers using DOM-based Geometry system (v2)
 */
export function Board({
  state,
  selectedPoint,
  validTargetPoints,
  onPointTap,
  onCheckerTap,
  isPending,
  myColor,
  onCubeClick,
  isTrainingMode = false,
  onRollDice,
  canRoll = false,
  containerRef,
  dimensions,
  boardOpacity,
  animatingChecker
}: BoardProps) {
  // Apply perspective mirror for H2H (Black player sees flipped board)
  const board = useMemo(() => mirrorBoardForPlayer(state.board, myColor), [state.board, myColor]);

  // Mirror selectedPoint and validTargetPoints for visual consistency
  const mirroredSelectedPoint = useMemo(
    () => selectedPoint !== null ? mirrorPointId(selectedPoint, myColor) : null,
    [selectedPoint, myColor]
  );
  const mirroredValidTargets = useMemo(
    () => validTargetPoints.map(id => mirrorPointId(id, myColor)),
    [validTargetPoints, myColor]
  );

  // Wrap tap handlers to reverse-map visual → logical coordinates
  const handlePointTap = useCallback(
    (visualId: number) => onPointTap(mirrorPointId(visualId, myColor)),
    [onPointTap, myColor]
  );
  const handleCheckerTap = useCallback(
    (visualId: number) => onCheckerTap(mirrorPointId(visualId, myColor)),
    [onCheckerTap, myColor]
  );

  // --- 1. Measure Board Elements (DOM Geometry) ---
  const { geometry, measureBoard } = useBoardGeometry(containerRef as React.RefObject<HTMLDivElement>, dimensions);

  // Re-measure when board structure/layout stabilizes
  useEffect(() => {
    // Small delay to allow layout to settle
    const t = setTimeout(measureBoard, 100);
    return () => clearTimeout(t);
  }, [dimensions, measureBoard]);


  const woodTexture = `
    radial-gradient(transparent, rgba(0,0,0,0.4)),
    repeating-linear-gradient(45deg, rgba(60,40,20,0.1) 0px, rgba(60,40,20,0.1) 2px, transparent 2px, transparent 4px),
    linear-gradient(to bottom, #2a2a2a, #1a1a1a)
  `;

  // --- 2. Checkers Rendering (Based on Geometry) ---
  const renderedCheckers = useMemo(() => {
    if (!geometry || Object.keys(geometry).length === 0) return [];

    const checkers: Array<{
      id: string;
      color: 'white' | 'black';
      x: number;
      y: number;
      width: number;
      height: number;
      pointId: number;
      index: number;
      isTop: boolean;
    }> = [];

    board.forEach((count: number, pointId: number) => {
      if (!count) return;

      const geom = geometry[pointId];
      if (!geom) return; // Point not measured yet?

      const color = count > 0 ? 'white' : 'black';
      const absCount = Math.abs(count);

      // Determine Stacking Logic based on Point Type
      const isBar = pointId === BAR_WHITE || pointId === BAR_BLACK;
      const isOff = pointId === OFF_WHITE || pointId === OFF_BLACK;

      // Base Size
      // Points: Fit within width (approx 90%)
      // Bar/Off: Fit nicely? Let's use specific logic.
      let checkerSize = geom.width * 0.9;

      if (isBar) {
        checkerSize = Math.min(geom.width * 0.8, geom.height * 0.2); // Limit height impact
      } else if (isOff) {
        // For Off Tray, we stack vertically usually? No, visually usually flat or stacked.
        // Review existing UI: Off trays are vertical bars.
        // We'll use width for size.
        checkerSize = geom.width * 0.8;
      }

      // Enforce max size for aesthetics (don't get HUGE on wide screens)
      // 48px is standard large checker
      // checkerSize = Math.min(checkerSize, 56); 


      // Stacking Calculation
      // Standard Points: Stack Vertically from Base
      // Top Row (13-24): Base is Top (y=0 relative to point). 
      // Bottom Row (1-12): Base is Bottom (y=height relative to point).

      const isTopRow = pointId >= 13 && pointId <= 24;
      // const isBottomRow = pointId >= 1 && pointId <= 12; // Unused

      for (let i = 0; i < absCount; i++) {
        const x = geom.x + (geom.width / 2); // Always center horizontally
        let y = 0;

        if (isBar) {
          // Stack Vertically centered in bar
          // const stackOffset = i * (checkerSize * 0.5); // Overlap
          // Bar White = Top, Bar Black = Bottom
          // Actually LogicBoard said White=Top. Let's assume Middle for now or check IDs.
          // Visual check: Bar White is top container. Bar Black is bottom.

          // Center vertically in the container
          // Simple stack from center?
          // Let's stack from center outwards or just stack down/up?
          // Default: Stack from center.

          const totalHeight = (absCount - 1) * (checkerSize * 0.5) + checkerSize;
          const startY = geom.y + (geom.height - totalHeight) / 2;
          y = startY + i * (checkerSize * 0.5) + checkerSize / 2;

        } else if (isOff) {
          // OFF TRAY STACKING (Side View / Coin Pile)
          const useSmartLayout = isFeatureEnabled('ENABLE_OFF_TRAY_FIX');

          // Base thickness - REDUCED SIZE (User Request: "Too Large")
          // Reduced from 0.25 to 0.18 for slimmer profile
          const thickness = geom.width * 0.18;
          let overlapY = thickness;

          if (useSmartLayout) {
            // Calculate available space
            const padding = 20; // 10px top + 10px bottom
            const availableHeight = geom.height - padding;

            // Calculate total height needed for 'strict' stacking
            const totalNeeded = absCount * thickness;

            if (totalNeeded > availableHeight) {
              // We need to squeeze
              // total = (n-1)*overlap + thickness
              // overlap = (available - thickness) / (n-1)
              if (absCount > 1) {
                overlapY = (availableHeight - thickness) / (absCount - 1);
              } else {
                overlapY = thickness; // Should fit if count is 1
              }

              // Log Telemetry for Squeeze
              if (i === 0) { // Log once per tray render
                logTelemetry('LAYOUT_CALCULATION', {
                  pointId,
                  count: absCount,
                  availableHeight,
                  totalNeeded,
                  squeeze: true,
                  overlapY,
                  originalThickness: thickness
                });
              }
            } else {
              // Fits comfortably
              overlapY = thickness;
            }
          }

          if (pointId === OFF_BLACK) {
            // Top Tray: Stack from Top Down
            const startY = geom.y + 10;
            y = startY + (i * overlapY) + (thickness / 2);
          } else {
            // Bottom Tray: Stack from Bottom Up
            const startY = geom.y + geom.height - 10;
            y = startY - (i * overlapY) - (thickness / 2);
          }

          // We'll pass the thickness as height later
          // Hack: We need to change how we push to `checkers` array to support distinct w/h.
          // See changes below in `.push`
        } else {
          // Standard Point
          // Calculate Y offset
          // Max visible stack before overlap adjustment
          // const overlapThreshold = 5;
          let yOffset = 0;

          // How much vertical space do we have?
          const availableHeight = geom.height * 0.9; // 90% of point height

          // If stack fits, use full diameter
          const pureStackHeight = absCount * checkerSize;

          if (pureStackHeight <= availableHeight) {
            yOffset = i * checkerSize;
          } else {
            // Optimization: Overlap to fit
            // available = (n-1)*offset + size
            // offset = (available - size) / (n-1)
            const overlapOffset = (availableHeight - checkerSize) / (absCount - 1);
            yOffset = i * overlapOffset;
          }

          if (isTopRow) {
            // 13-24: Grow Downwards from Top
            // Point Base is at Top? No, Top Points are triangles pointing DOWN.
            // The "Base" of the point (where checkers start) is the Top edge of the container.
            y = geom.y + (checkerSize / 2) + yOffset;
          } else {
            // 1-12: Grow Upwards from Bottom
            // Point Base is Bottom edge.
            y = geom.y + geom.height - (checkerSize / 2) - yOffset;
          }
        }

        // Final Width Check - REDUCED WIDTH for Off-Tray
        // Reduced from 0.9 to 0.75 for visual balance
        const finalHeight = isOff ? (geom.width * 0.18) : checkerSize;
        const finalWidth = isOff ? (geom.width * 0.75) : checkerSize;

        checkers.push({
          id: `${pointId}-${i}`,
          color,
          x,
          y,
          width: finalWidth,
          height: finalHeight,
          pointId,
          index: i,
          isTop: i === absCount - 1
        });
      }
    });

    return checkers;
  }, [board, geometry]);


  /**
   * Helper to render a group of 6 BACKGROUND points (Hit Targets)
   */
  const renderPointHitZones = (indices: number[], isBottom: boolean) => {
    return indices.map((idx) => {
      const isValid = mirroredValidTargets.includes(idx);

      return (
        <Point
          key={idx}
          id={idx}
          isValidTarget={isValid}
          isBottom={isBottom}
          onTap={() => handlePointTap(idx)}
          data-point-id={idx}
          boardOpacity={boardOpacity}
          className="flex-1 h-full"
        >
          {/* No children - Checkers are now overlayed */}
        </Point>
      );
    });
  };

  /**
   * Helper to render Special Zones (Bar) - Hit Targets Only
   */
  const renderBarHitZone = (id: number, label: string) => {
    const isValid = mirroredValidTargets.includes(id);
    return (
      <div
        key={id}
        className={`flex-1 w-full flex items-center justify-center rounded cursor-pointer transition-colors
                ${isValid ? 'bg-cyan-500/20 shadow-[0_0_10px_cyan]' : ''}
            `}
        onClick={() => handlePointTap(id)}
        data-point-id={id}
        title={label}
      />
    );
  }

  const boardOrientation = localStorage.getItem('board_orientation') || 'right';
  const isLeft = boardOrientation === 'left';
  const flexRowClass = isLeft ? 'flex-row-reverse' : 'flex-row';

  return (
    /* CONTENEDOR UNIFICADO */
    <div
      ref={containerRef}
      className={`flex ${flexRowClass} items-stretch justify-center gap-1 md:gap-2 w-[calc(100%-2.5rem)] md:w-[calc(100%-6rem)] mx-auto max-w-7xl h-auto max-h-full aspect-[4/3] md:aspect-[1.4] @container relative`}
    >

      {/* 1. EL TABLERO (BACKGROUND & HIT ZONES) */}
      <div
        className={`
          flex-1 min-w-0 relative 
          rounded-lg md:rounded-xl shadow-2xl
          flex ${flexRowClass} gap-0 pt-1 pb-1 px-1 md:pt-4 md:pb-4 md:px-2 select-none
          transition-all duration-300
          overflow-hidden
          border-[4px] md:border-[12px] border-[#4a3c31] /* BORDERS MOVED HERE (Always Visible) */
          ${isPending ? 'pointer-events-none' : ''}
        `}
        style={{
          boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.8)'
        }}
      >
        {/* --- DYNAMIC BACKGROUND LAYER (Wood Texture ONLY) --- */}
        <div className="absolute inset-0 pointer-events-none z-0"
          style={{
            opacity: boardOpacity, // ONLY background fades
            transition: 'opacity 0.3s ease'
          }}
        >
          {/* Wood Base (frame/background) */}
          <div className="absolute inset-0"
            style={{
              background: woodTexture,
              boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)'
            }}
          />

          {/* Felt Texture Overlay - Green tabletop */}
          <div
            className="absolute inset-0 opacity-80"
            style={{
              backgroundColor: '#064e3b', // deep green felt base
              // CSP-safe inline SVG noise pattern (replaces external transparenttextures.com URL)
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)' opacity='0.08'/%3E%3C/svg%3E")`
            }}
          />
        </div>

        {/* --- GAME CONTENT LAYER (Above Background) --- */}
        <div className="absolute inset-0 z-0 flex rounded-lg md:rounded-xl overflow-hidden">
          {/* This container mirrors the flex layout below but for the background lines/borders if needed.
                 Actually, we can just let the content sit on top. 
                 The Point Hit Zones need to be z-10.
             */}
        </div>

        {/* --- LEFT QUADRANTS (Hit Zones) --- */}
        <div className="flex-1 flex flex-col h-full border-r-2 md:border-r-4 border-[#3a2c21]/50 relative z-10">
          {/* Top-Left (13-18) */}
          <div className={`flex-1 flex ${flexRowClass} justify-between items-start px-1 relative`}>
            {renderPointHitZones([13, 14, 15, 16, 17, 18], false)}
          </div>
          {/* Bottom-Left (12-7) */}
          <div className={`flex-1 flex ${flexRowClass} justify-between items-end px-1 relative`}>
            {renderPointHitZones([12, 11, 10, 9, 8, 7], true)}
          </div>
        </div>

        {/* --- CENTRAL BAR (Hit Zones) --- */}
        <div className="w-[8%] md:w-16 h-full shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center border-x border-[#3a2c21]/50 relative z-20"
          style={{ backgroundColor: `rgba(21, 16, 13, ${boardOpacity})` }}>
          {/* Top Bar (White) */}
          <div className="flex-1 w-full flex flex-col items-center justify-start gap-1 py-4">
            {renderBarHitZone(BAR_WHITE, "White Bar")}
          </div>

          {/* DOUBLING CUBE */}
          {(() => {
            // Determine cube display value and position
            // Cube shows the NEXT value if offered (cubeOwner === null means it's offered)
            // Otherwise shows current value
            const displayValue = state.cubeOwner === null && state.cube > 1
              ? state.cube // Cube is offered, show the offered value
              : state.cube === 1
                ? 64 // Show 64 when cube is at base value (neutral)
                : state.cube; // Show current value

            // Determine if cube should be positioned on a player's side
            // If cubeOwner is null, it's in center (neutral or offered)
            // Otherwise, position it on the owner's side
            const isOnWhiteSide = state.cubeOwner === 'white';
            const isOnBlackSide = state.cubeOwner === 'black';
            const isCentered = state.cubeOwner === null;

            // For H2H, mirror the position if player is black
            const shouldShowOnTop = myColor === 'black'
              ? (isOnBlackSide || (isCentered && state.cube === 1))
              : (isOnWhiteSide || (isCentered && state.cube === 1));

            return (
              <div className="flex flex-col items-center w-[80%] max-w-[64px] md:max-w-[80px]">
                <div
                  className={`w-full aspect-square rounded-lg border-2 border-amber-900/50 flex items-center justify-center shadow-[0_5px_15px_rgba(0,0,0,0.5)] z-30 transition-all duration-300 ${isTrainingMode ? 'opacity-50 cursor-not-allowed grayscale' :
                    onCubeClick ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default'
                    } group ${isCentered ? '' : shouldShowOnTop ? 'absolute top-2' : 'absolute bottom-2'
                    }`}
                  style={{
                    background: 'linear-gradient(135deg, #eecfa1 0%, #8b4513 100%)',
                    ...(isCentered ? {} : { position: 'absolute', width: '60%' })
                  }}
                  onClick={isTrainingMode ? undefined : onCubeClick}
                  title={
                    isTrainingMode
                      ? 'Apuestas deshabilitadas en Modo Entrenamiento'
                      : state.cubeOwner === null && state.cube > 1
                        ? 'Double offered - Click to accept/reject'
                        : state.cubeOwner === myColor && state.dice.length === 0
                          ? 'Click to offer double'
                          : state.cubeOwner === (myColor === 'white' ? 'black' : 'white') && state.dice.length === 0
                            ? 'Opponent can offer double'
                            : 'Doubling Cube'
                  }
                >
                  <span className="text-lg md:text-2xl font-black text-amber-900 group-hover:text-amber-950">
                    {displayValue}
                  </span>
                </div>

                {canRoll && (
                  <div className="mt-2 w-full flex justify-center">
                    <RollingDiceButton onRoll={onRollDice ?? (() => {})} disabled={!canRoll} className="w-full" />
                  </div>
                )}
              </div>
            );
          })()}

          {/* Bottom Bar (Black) */}
          <div className="flex-1 w-full flex flex-col items-center justify-end gap-1 py-4">
            {renderBarHitZone(BAR_BLACK, "Red Bar")}
          </div>
        </div>

        {/* --- RIGHT QUADRANTS (Hit Zones) --- */}
        <div className="flex-1 flex flex-col h-full border-l-2 md:border-l-4 border-[#3a2c21]/50 relative z-10">
          {/* Top-Right (19-24) */}
          <div className={`flex-1 flex ${flexRowClass} justify-between items-start px-1 relative`}>
            {renderPointHitZones([19, 20, 21, 22, 23, 24], false)}
          </div>
          {/* Bottom-Right (6-1) */}
          <div className={`flex-1 flex ${flexRowClass} justify-between items-end px-1 relative`}>
            {renderPointHitZones([6, 5, 4, 3, 2, 1], true)}
          </div>
        </div>

        {/* LOGO */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center text-[10vw] font-black text-white z-0 mix-blend-overlay">
          VIVO
        </div>

        {/* --- CHECKER OVERLAY LAYER (Absolute Positioning) --- */}
      </div>

      {/* 2. BANDEJA DE SALIDA (Off Zones) */}
      <div className="flex flex-col justify-between w-12 md:w-16 shrink-0 py-1 h-full gap-2">
        {/* Top Tray (Black Off) */}
        <div
          className={`flex-1 border-2 rounded-lg relative ${mirroredValidTargets.includes(OFF_BLACK) ? 'bg-green-900/30 border-green-500' : 'border-[#3a2c21]'}`}
          style={{ backgroundColor: mirroredValidTargets.includes(OFF_BLACK) ? '' : `rgba(6, 38, 28, ${boardOpacity})` }}
          onClick={() => handlePointTap(OFF_BLACK)}
          data-point-id={OFF_BLACK}
        >
          <span className="absolute top-1 left-0 right-0 text-center text-[10px] text-red-500 font-black uppercase tracking-widest">FUERA</span>
        </div>

        {/* Bottom Tray (White Off) */}
        <div
          className={`flex-1 border-2 rounded-lg relative ${mirroredValidTargets.includes(OFF_WHITE) ? 'bg-green-900/30 border-green-500' : 'border-[#3a2c21]'}`}
          style={{ backgroundColor: mirroredValidTargets.includes(OFF_WHITE) ? '' : `rgba(6, 38, 28, ${boardOpacity})` }}
          onClick={() => handlePointTap(OFF_WHITE)}
          data-point-id={OFF_WHITE}
        >
          <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] text-white font-black uppercase tracking-widest">FUERA</span>
        </div>
      </div>

      {/* --- DICE RESULT OVERLAY (3D dice landing on the central-left felt zone) --- */}
      <DiceOverlay geometry={geometry} state={state} />

      {/* --- CHECKER OVERLAY LAYER (Absolute Positioning - Global Overlay) --- */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        {(animatingChecker) && (
          <motion.div
            key={`anim-${animatingChecker.fromPointId}-${animatingChecker.toPointId}-${animatingChecker.color}`}
            initial={{
              x: animatingChecker.fromX,
              y: animatingChecker.fromY,
              scale: 1.0,
            }}
            animate={{
              x: animatingChecker.toX,
              y: animatingChecker.toY,
              scale: [1.0, 1.18, 1.0],  // Lift off, arc, land
            }}
            transition={{
              duration: 0.35,
              ease: [0.25, 0.46, 0.45, 0.94],  // cubic-bezier for smooth arc
              scale: { duration: 0.35, times: [0, 0.5, 1] },
            }}
            className="absolute"
            style={{
              width: 'clamp(24px, 3.8cqw, 48px)',
              height: 'clamp(24px, 3.8cqw, 48px)',
              transform: 'translate(-50%, -50%)',
              zIndex: 70,
              filter: 'drop-shadow(0 16px 12px rgba(0,0,0,0.55))',
              opacity: 0.98,
            }}
          >
            <Checker color={animatingChecker.color} />
          </motion.div>
        )}

        {renderedCheckers.map((c) => {
          // Hide the top checker at the DESTINATION (it will appear when animation ends)
          const isMovingTarget = animatingChecker && c.color === animatingChecker.color && c.pointId === animatingChecker.toPointId && c.isTop;
          if (isMovingTarget) return null;

          return (
            <div
              key={c.id}
              className={`absolute pointer-events-auto ${animatingChecker ? '' : 'transition-all duration-200'}`}
              style={{
                left: c.x,
                top: c.y,
                width: c.width,
                height: c.height,
                transform: 'translate(-50%, -50%)',
                zIndex: c.index
              }}
              data-checker-point={c.pointId}
            >
              <Checker
                color={c.color}
                isSelected={mirroredSelectedPoint === c.pointId && c.isTop}
                onTap={() => handleCheckerTap(c.pointId)}
                style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none' }}
                variant={
                  (c.pointId === OFF_WHITE || c.pointId === OFF_BLACK)
                    ? 'edge' : 'flat'
                }
              />
            </div>
          );
        })}
      </div>

    </div>
  );
}

