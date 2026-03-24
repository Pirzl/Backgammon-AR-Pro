import { useState } from 'react';

export function CookieBanner() {
  // Inicialización perezosa (lazy) para leer de localStorage sin causar re-renders
  const [showBanner, setShowBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('vivo_cookie_consent');
    }
    return false;
  });

  const handleAccept = () => {
    localStorage.setItem('vivo_cookie_consent', 'accepted');
    setShowBanner(false);
  };

  const handleReject = () => {
    // Even if rejected, we only use technical storage. 
    // We record the rejection to stop showing the banner.
    localStorage.setItem('vivo_cookie_consent', 'rejected');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-slate-900/95 backdrop-blur-md border-t border-slate-700 p-4 md:p-6 shadow-2xl safe-area-bottom">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-slate-300 text-sm md:text-base flex-1">
          <p className="mb-2">
            <strong>Privacidad y Cookies:</strong> En Backgammon VIVO utilizamos <em>cookies técnicas</em> y almacenamiento local estrictamente necesarios para guardar tus preferencias de juego, la calibración de tu cámara y mejorar tu experiencia. No utilizamos cookies publicitarias ni cedemos datos a terceros.
          </p>
          <p className="text-xs text-slate-400">
            Al continuar o hacer clic en "Aceptar", consientes el uso de este almacenamiento esencial. Para más información, lee nuestra <a href="/cookies.html" className="text-cyan-400 hover:text-cyan-300 underline">Política de Cookies</a> y <a href="/privacidad.html" className="text-cyan-400 hover:text-cyan-300 underline">Privacidad</a>.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 min-w-max">
          <button
            onClick={handleReject}
            className="px-6 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            Rechazar Opcionales
          </button>
          <button
            onClick={handleAccept}
            className="px-6 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-900/50 text-sm font-medium"
          >
            Aceptar Todas
          </button>
        </div>
      </div>
    </div>
  );
}
