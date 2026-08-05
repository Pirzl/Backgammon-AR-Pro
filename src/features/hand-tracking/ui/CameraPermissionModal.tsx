import { Camera, ShieldCheck, X, AlertTriangle } from 'lucide-react';

interface CameraPermissionModalProps {
  /** null = hidden, 'explain' = ask before prompting, 'denied' = browser blocked it */
  state: 'explain' | 'denied' | null;
  onAllow: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * E (AR/UX): explicit camera-permission explainer + denial fallback.
 * Shown BEFORE getUserMedia so the user understands why the front (selfie)
 * camera is needed for hand-tracking — never auto-started.
 */
export function CameraPermissionModal({ state, onAllow, onCancel, onRetry }: CameraPermissionModalProps) {
  if (!state) return null;

  const denied = state === 'denied';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={denied ? 'Permiso de cámara denegado' : 'Permiso de cámara'}
    >
      <div className="bg-gradient-to-br from-slate-900/95 to-slate-950/95 border-2 border-cyan-700/40 rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-5">
          <h2 className="flex items-center gap-2 text-xl md:text-2xl font-black text-cyan-100 uppercase tracking-wider">
            {denied ? <AlertTriangle size={22} className="text-rose-300" /> : <Camera size={22} className="text-cyan-300" />}
            {denied ? 'Cámara bloqueada' : 'Control por mano'}
          </h2>
          {!denied && (
            <button
              onClick={onCancel}
              className="text-slate-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800/50"
              aria-label="Cancelar"
            >
              <X size={24} />
            </button>
          )}
        </div>

        {denied ? (
          <>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Has denegado el permiso de cámara. El control por mano necesita la <strong className="text-white">cámara frontal (selfie)</strong> para funcionar.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Para activarlo: haz clic en el icono de cámara/candado en la barra de direcciones de tu navegador,
              elige <strong className="text-white">Permitir</strong> para este sitio y pulsa Reintentar.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
              >
                Cerrar
              </button>
              <button
                onClick={onRetry}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Reintentar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-5">
              <div className="shrink-0 mt-1"><ShieldCheck size={22} className="text-emerald-300" /></div>
              <div>
                <h3 className="text-base font-black text-white mb-1">¿Permitir cámara frontal?</h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  VIVO usa tu <strong className="text-white">cámara frontal (selfie)</strong> solo para detectar tus manos y mover las fichas.
                  El vídeo se procesa <strong className="text-white">localmente en tu dispositivo</strong> y nunca se sube a ningún servidor.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-all"
              >
                Ahora no
              </button>
              <button
                onClick={onAllow}
                className="flex-1 py-3 px-6 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Permitir cámara
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
