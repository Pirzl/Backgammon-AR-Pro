import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose?: () => void;
}

/**
 * Simple toast notification component
 */
export function Toast({ message, type = 'success', duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  const styles = {
    success: 'bg-gradient-to-r from-emerald-500 to-green-600 border-emerald-300',
    error: 'bg-gradient-to-r from-red-500 to-rose-600 border-red-300',
    info: 'bg-gradient-to-r from-blue-500 to-cyan-600 border-blue-300'
  };

  const icons = {
    success: <CheckCircle className="w-6 h-6" />,
    error: <AlertCircle className="w-6 h-6" />,
    info: <Info className="w-6 h-6" />
  };

  return (
    <div
      className={`fixed top-24 right-4 z-[400] max-w-md ${styles[type]} text-white px-6 py-4 rounded-2xl shadow-2xl border-2 border-white/30 flex items-start gap-3 animate-in slide-in-from-right`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {icons[type]}
      </div>
      <div className="flex-1 text-sm font-medium">
        {message}
      </div>
      <button
        onClick={() => {
          setVisible(false);
          onClose?.();
        }}
        className="p-1 hover:bg-white/20 rounded transition-colors cursor-pointer flex-shrink-0"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
