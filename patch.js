const fs = require('fs');
let code = fs.readFileSync('src/features/hand-tracking/ui/HandTrackingLayer.tsx', 'utf8');

code = code.replace(/import { AlertCircle } from 'lucide-react';/, "import { AlertCircle, X, AlertTriangle } from 'lucide-react';");

code = code.replace(/const shouldTrack = isFeatureEnabled\('ENABLE_SMART_TRACKING'\) \? isActive : true;/, "const shouldTrack = isFeatureEnabled('ENABLE_SMART_TRACKING') ? isActive : true;\n  const [errorDismissed, setErrorDismissed] = useState(false);");

code = code.replace(/const {[\s\S]*?videoRef,[\s\S]*?error: cameraError,[\s\S]*?isLoading: cameraLoading[\s\S]*?} = useCamera\(\);/,
`const { 
    videoRef, 
    error: cameraError, 
    warning: cameraWarning,
    isLoading: cameraLoading 
  } = useCamera();`);

code = code.replace(/if \(mlError \|\| cameraError\) {[\s\S]*?<AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" \/>[\s\S]*?<h3 className="text-xl font-bold text-white mb-2">Tracking Error<\/h3>[\s\S]*?<p className="text-white\/60 text-sm">{mlError \|\| cameraError}<\/p>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?\);[\s\S]*?}/,
`if ((mlError || cameraError) && !errorDismissed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-40 rounded-3xl border border-red-500/30">
        <div className="text-center p-6 relative max-w-sm">
          <button 
            onClick={() => setErrorDismissed(true)}
            className="absolute -top-2 -right-2 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors cursor-pointer"
          >
             <X className="w-5 h-5 text-white" />
          </button>
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Error de Hardware</h3>
          <p className="text-white/60 text-sm mb-6">{mlError || cameraError}</p>
          <button
             onClick={() => setErrorDismissed(true)}
             className="px-6 py-2 bg-red-400 hover:bg-red-500 text-black font-bold rounded-xl transition-colors cursor-pointer uppercase text-sm"
          >
             Continuar sin hardware
          </button>
        </div>
      </div>
    );
  }`);

code = code.replace(/<div className="absolute top-4 left-1\/2 -translate-x-1\/2 bg-amber-500\/90 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse z-50">[\s\S]*?⚠️ Sin detección de mano[\s\S]*?<\/div>/,
`<div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500/90 text-black px-4 py-2 rounded-full font-bold text-sm shadow-lg animate-pulse z-50 pointer-events-none">
           ⚠️ Sin detección de mano
        </div>
      )}

      {/* Virtual Camera Warning Indicator */}
      {showOverlay && cameraWarning && shouldTrack && !cameraError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white px-4 py-2 rounded-full font-medium text-xs shadow-lg z-50 flex items-center gap-2 pointer-events-none">
           <AlertTriangle size={14} className="text-blue-200" />
           {cameraWarning}
        </div>`);

fs.writeFileSync('src/features/hand-tracking/ui/HandTrackingLayer.tsx', code);
console.log('Patched');
