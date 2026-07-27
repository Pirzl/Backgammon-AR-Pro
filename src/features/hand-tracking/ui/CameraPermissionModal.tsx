import { createPortal } from 'react-dom';
import { Camera, CameraOff, ShieldCheck } from 'lucide-react';

/**
 * `explain` — shown BEFORE the camera starts, so the user opts in explicitly.
 * `denied`  — shown after the browser blocked camera access.
 * `null`    — hidden.
 */
export type CameraPermissionState = 'explain' | 'denied' | null;

interface CameraPermissionModalProps {
  state: CameraPermissionState;
  /** User accepted the explainer — start the camera. */
  onAllow: () => void;
  onCancel: () => void;
  /** User wants to try again after a denial. */
  onRetry: () => void;
}

/**
 * Camera permission explainer for hand tracking (AR-UX).
 *
 * The camera is never started implicitly: this modal always asks first, so the
 * browser's own permission prompt only appears after a deliberate user action.
 */
export function CameraPermissionModal({
  state,
  onAllow,
  onCancel,
  onRetry,
}: CameraPermissionModalProps) {
  if (state === null) return null;

  const isDenied = state === 'denied';

  // The game board root applies `[transform:translateZ(0)]`, which turns it into
  // the containing block for `position: fixed` AND a new stacking context. A
  // modal rendered inside it can never rise above the in-game camera overlays
  // (CalibrationOverlay is z-200), so it gets buried and becomes unclickable.
  // Rendering into <body> via a portal escapes that trap entirely.
  return createPortal(
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isDenied ? 'Permiso de cámara denegado' : 'Permiso de cámara'}
    >
      <div className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-slate-900/95 p-8 text-center shadow-2xl">
        <div
          className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
            isDenied ? 'bg-rose-500/15 text-rose-400' : 'bg-cyan-500/15 text-cyan-300'
          }`}
        >
          {isDenied ? <CameraOff size={30} /> : <Camera size={30} />}
        </div>

        <h2 className="mb-2 text-xl font-black uppercase tracking-wider text-white">
          {isDenied ? 'Cámara bloqueada' : 'Activar control por gestos'}
        </h2>

        {isDenied ? (
          <p className="mb-6 text-sm leading-relaxed text-slate-400">
            Tu navegador ha bloqueado el acceso a la cámara. Permítelo desde el icono de la barra de
            direcciones y vuelve a intentarlo.
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm leading-relaxed text-slate-400">
              Para mover las fichas con la mano necesitamos acceso a tu cámara. Se te pedirá permiso
              justo después de continuar.
            </p>
            <p className="mb-6 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck size={14} />
              El vídeo se procesa en tu dispositivo. Nunca se graba ni se envía.
            </p>
          </>
        )}

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-300 transition-all hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={isDenied ? onRetry : onAllow}
            className="cursor-pointer rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-black uppercase tracking-widest shadow-[0_0_16px_rgba(6,182,212,0.4)] transition-all hover:bg-cyan-400"
          >
            {isDenied ? 'Reintentar' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
