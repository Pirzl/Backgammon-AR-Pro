import { useState } from 'react';
import { Camera, SwitchCamera, ChevronDown } from 'lucide-react';

interface CameraDevice {
  deviceId: string;
  label: string;
  isFrontFacing: boolean;
}

interface CameraSelectorProps {
  cameras: CameraDevice[];
  selectedDeviceId: string | null;
  onSwitch: (deviceId: string) => void;
}

/**
 * CameraSelector Component
 * Allows users to switch between available cameras.
 * Auto-hides when only one camera is available.
 * Follows UI/UX Pro Max guidelines with SVG icons, glassmorphism, and smooth animations.
 */
export function CameraSelector({ cameras, selectedDeviceId, onSwitch }: CameraSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Hide if only one camera available
  if (cameras.length <= 1) return null;

  const selectedCamera = cameras.find(cam => cam.deviceId === selectedDeviceId);

  return (
    <div className="absolute top-4 right-4 z-50 pointer-events-auto">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl
                   hover:bg-black/60 hover:border-white/20 transition-all duration-300 cursor-pointer
                   shadow-lg shadow-black/20 group"
        aria-label="Switch camera"
      >
        <SwitchCamera className="w-5 h-5 text-cyan-400 group-hover:rotate-180 transition-transform duration-300" />
        <span className="text-sm font-semibold text-white/90 hidden sm:inline">
          {selectedCamera?.label || 'Camera'}
        </span>
        <ChevronDown 
          className={`w-4 h-4 text-white/60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop to close dropdown */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Camera List */}
          <div className="absolute top-full right-0 mt-2 min-w-[280px] bg-black/60 backdrop-blur-xl 
                          border border-white/10 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50
                          animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="p-2 space-y-1">
              {cameras.map((camera) => {
                const isSelected = camera.deviceId === selectedDeviceId;
                
                return (
                  <button
                    key={camera.deviceId}
                    onClick={() => {
                      onSwitch(camera.deviceId);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-300 cursor-pointer
                                ${isSelected 
                                  ? 'bg-cyan-500/20 border border-cyan-400/30' 
                                  : 'hover:bg-white/5 border border-transparent'
                                }`}
                  >
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full transition-all duration-300
                                     ${isSelected ? 'bg-cyan-400 shadow-lg shadow-cyan-400/50' : 'bg-white/20'}`} 
                    />
                    <Camera className={`w-4 h-4 flex-shrink-0 transition-colors duration-300
                                        ${isSelected ? 'text-cyan-400' : 'text-white/60'}`} 
                    />
                    <span className={`text-sm font-medium truncate transition-colors duration-300
                                      ${isSelected ? 'text-white' : 'text-white/80'}`}>
                      {camera.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
