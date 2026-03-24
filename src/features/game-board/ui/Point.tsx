interface PointProps {
  id: number;
  isValidTarget?: boolean;
  isBottom: boolean;
  onTap?: () => void; // Unified tap handler
  children?: React.ReactNode;
  className?: string;
  ['data-point-id']?: number;
  boardOpacity?: number;
  showTriangle?: boolean;
}

/**
 * Point component - Triangle surface on the backgammon board
 */
export function Point({
  id,
  isValidTarget,
  isBottom,
  onTap,
  children,
  className = '',
  boardOpacity = 1,
  showTriangle = true,
  ...props
}: PointProps) {
  const isEven = id % 2 === 0;
  
  return (
    <div
      className={`
        relative flex flex-col items-center w-full h-full min-w-0
        ${isBottom ? 'justify-end' : 'justify-start'}
        transition-all duration-300
        ${className}
      `}
      onClick={onTap}
      {...props}
    >
      {/* Triangle Shape - Sharp CSS Triangle */}
      {showTriangle && (
        <div
          className={`
            absolute inset-0 w-full h-full
            ${isBottom ? 'origin-bottom' : 'origin-top'}
            transition-all duration-300
          `}
          style={{
            clipPath: isBottom 
              ? 'polygon(50% 0%, 0% 100%, 100% 100%)' 
              : 'polygon(50% 100%, 0% 0%, 100% 0%)',
            // Inlaid Wood Look:
            // 1. Base color (Darker Walnut vs Lighter Oak)
            // 2. Texture: Subtle linear gradient to simulate grain
            background: isValidTarget 
              ? 'rgba(64, 224, 208, 0.4)' 
              : (isEven 
                  ? `linear-gradient(135deg, rgba(80, 60, 60, ${Math.max(0.3, boardOpacity)}), rgba(40, 30, 30, ${Math.max(0.3, boardOpacity)}))` // Dark Point
                  : `linear-gradient(135deg, rgba(210, 180, 140, ${Math.max(0.3, boardOpacity)}), rgba(160, 130, 90, ${Math.max(0.3, boardOpacity)}))` // Light Point
                ),
            height: '100%' 
          }}
        />
      )}
      
      {/* High-fidelity Border overlay */}
      <div 
         className={`absolute inset-0 w-full h-full ${isBottom ? 'bottom-0' : 'top-0'} pointer-events-none`}
         style={{
            clipPath: isBottom 
            ? 'polygon(50% 0%, 0% 100%, 100% 100%)' 
            : 'polygon(50% 100%, 0% 0%, 100% 0%)',
            border: 'none',
            boxShadow: `inset 0 0 10px rgba(0,0,0,${boardOpacity * 0.5})`
         }}
      />
      
      {/* Drop Zone Indicator */}
      {isValidTarget && (
        <div className="absolute inset-0 bg-cyan-400/20 animate-pulse z-20 pointer-events-none" />
      )}

      {/* Checker Stack Container */}
      <div className={`
        relative z-10 flex flex-col-reverse items-center w-full
      `}>
        {children}
      </div>

      {/* ID Label - Subtle */}
      <span className="absolute z-0 text-[10px] font-black text-white/10 select-none py-2"
        style={{ [isBottom ? 'bottom' : 'top']: '100%' }}
      >
        {id}
      </span>
    </div>
  );
}
