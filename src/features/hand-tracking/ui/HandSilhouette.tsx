//

//
// HandSilhouette.tsx
// Versión final: palma redondeada que llega hasta el meñique,
// dedos separados, punto 8 ajustable y soporte básico de auto-escalado.
// Reemplaza completamente el archivo por este contenido.
// -------------------------------------------------------
// NOTAS RÁPIDAS
// - Ajusta indexTip.x / indexTip.y para mover el punto azul.
// - Ajusta los rects de dedos (x, y, width, height) para mover dedos.
// - Para niños: usa autoScale=true y pásale handBoxWidth en px.
// -------------------------------------------------------
//

/* Componentes de la silueta (fuera del render principal) */
const RightHand = () => (
  <g>
    {/* Palma redondeada que llega hasta el meñique */}
    <rect x="125" y="175" width="113" height="140" rx="20" ry="20" fill="none" />

    {/* Pulgar */}
    <rect
      x="85"
      y="160"
      width="38"
      height="75"
      rx="18"
      ry="18"
      transform="rotate(-30 107 210)"
    />

    {/* Índice */}
    <rect x="126" y="50" width="28" height="121" rx="14" ry="14" />

    {/* Medio */}
    <rect x="158" y="31" width="28" height="140" rx="14" ry="14" />

    {/* Anular */}
    <rect x="192" y="58" width="24" height="113" rx="12" ry="12" />

    {/* Meñique */}
    <rect x="218" y="85" width="20" height="90" rx="10" ry="10" />
  </g>
);

const LeftHand = () => (
  <g transform="translate(300,0) scale(-1,1)">
    {/* Palma redondeada que llega hasta el meñique */}
    <rect x="125" y="175" width="113" height="140" rx="20" ry="20" fill="none" />

    <rect
      x="85"
      y="160"
      width="38"
      height="75"
      rx="18"
      ry="18"
      transform="rotate(-30 107 210)"
    />
    <rect x="126" y="50" width="28" height="121" rx="14" ry="14" />
    <rect x="158" y="31" width="28" height="140" rx="14" ry="14" />
    <rect x="192" y="58" width="24" height="113" rx="12" ry="12" />
    <rect x="218" y="85" width="20" height="90" rx="10" ry="10" />
  </g>
);

interface HandSilhouetteProps {
  isRightHand: boolean;
  scale?: number; // escala manual
  opacity?: number;
  highlightIndex?: boolean;
  compact?: boolean;
  autoScale?: boolean; // si true, usa handBoxWidth para calcular escala
  handBoxWidth?: number | null; // ancho en px del bounding box de la mano detectada (opcional)
  customWidth?: number; // ancho base opcional
  customHeight?: number; // alto base opcional
}

export function HandSilhouette({
  isRightHand,
  scale = 1,
  opacity = 1,
  highlightIndex = true,
  compact = false,
  autoScale = false,
  handBoxWidth = null,
  customWidth,
  customHeight
}: HandSilhouetteProps) {
  // Tamaño base contenido - ajustado para coincidir mejor con manos reales
  // Increased by ~20% as per user feedback ("too small")
  const baseWidth = customWidth || (compact ? 240 : 460);   
  const baseHeight = customHeight || (compact ? 350 : 650);

  // Ancho de la palma en el SVG (en unidades del viewBox)
  const silhouettePalmWidth = 113;

  // Si autoScale está activado y nos pasan handBoxWidth, calculamos factor
  const computedScale =
    autoScale && handBoxWidth && handBoxWidth > 0
      ? Math.max(0.45, Math.min(1.25, handBoxWidth / silhouettePalmWidth))
      : scale;

  // Coordenadas del punto 8 (index tip). Ajusta solo estos dos valores si hace falta.
  // Si necesitas mover el punto: cambia indexTip.x y indexTip.y.
  const indexTip = isRightHand ? { x: 140, y: 65 } : { x: 156, y: 65 };

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-out"
      style={{
        width: `${baseWidth}px`,
        height: `${baseHeight}px`,
        opacity,
        transform: `translate(-50%, -50%) scale(${computedScale})`,
      }}
    >
      <svg viewBox="0 0 300 360" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Glow suave */}
        <g
          fill="none"
          stroke="#00A8FF"
          strokeWidth="14"
          opacity="0.12"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isRightHand ? <RightHand /> : <LeftHand />}
        </g>

        {/* Contorno principal */}
        <g
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        >
          {isRightHand ? <RightHand /> : <LeftHand />}
        </g>

        {/* Punto 8 (círculos). Si quieres ocultarlos, pasa highlightIndex={false} */}
        {highlightIndex && (
          <>
            <circle cx={indexTip.x} cy={indexTip.y} r="10" fill="#00A8FF" className="animate-pulse" />
            <circle
              cx={indexTip.x}
              cy={indexTip.y}
              r="22"
              fill="none"
              stroke="#00A8FF"
              strokeWidth="4"
              opacity="0.85"
              className="animate-pulse"
            />
          </>
        )}
      </svg>
    </div>
  );
}
