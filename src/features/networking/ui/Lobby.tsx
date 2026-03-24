import { useState, useEffect } from 'react';
import { Copy, Users, Play, ArrowRight, Share2, MessageCircle, Mail } from 'lucide-react';

interface LobbyProps {
  onCreateRoom: () => string; // Returns roomId
  onJoinRoom: (roomId: string) => void;
  currentRoomId: string | null;
  onlineCount: number;
}

export function Lobby({ onCreateRoom, onJoinRoom, currentRoomId, onlineCount }: LobbyProps) {
  // Initialize mode based on URL params or currentRoomId to avoid setState in useEffect
  const [mode, setMode] = useState<'menu' | 'join' | 'waiting'>(() => {
    if (currentRoomId) return 'waiting';
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) return 'waiting';
    return 'menu';
  });
  
  const [inputCode, setInputCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-join room from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !currentRoomId) {
      onJoinRoom(roomParam);
    }
  }, [onJoinRoom, currentRoomId]);

  const handleCreate = () => {
    const newId = onCreateRoom();
    setMode('waiting');
    // Update URL without reload
    const newUrl = `${window.location.pathname}?room=${newId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleCopy = async () => {
    if (!currentRoomId) return;
    const url = `${window.location.origin}?room=${currentRoomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (mode === 'waiting') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm">
        <div className="bg-black/60 border border-white/10 p-8 rounded-3xl w-full max-w-md text-center shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex justify-center">
            <div className={`p-4 rounded-full ${onlineCount > 1 ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/50'}`}>
              <Users size={48} />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-2">
            {onlineCount > 1 ? '¡Oponente Encontrado!' : 'Esperando Jugador...'}
          </h2>
          <p className="text-white/50 mb-8">
            {onlineCount > 1 ? 'El juego está listo para comenzar.' : 'Comparte el enlace para invitar a un amigo.'}
          </p>

          <div className="bg-black/30 p-4 rounded-xl flex items-center justify-between mb-4 border border-white/5">
            <code className="text-xl text-cyan-400 font-mono tracking-wider">
              {currentRoomId}
            </code>
            <button 
              onClick={handleCopy}
              className="p-2 hover:bg-white/10 rounded-lg transition-all duration-300 cursor-pointer text-white/70 hover:text-white"
            >
              {copied ? <span className="text-green-400 text-xs font-bold">COPIED</span> : <Copy size={20} />}
            </button>
          </div>

          {/* Social Share Buttons */}
          <div className="mb-8">
            <p className="text-white/40 text-sm mb-3">Share via:</p>
            <div className="flex gap-3 justify-center">
              {/* WhatsApp */}
              <a 
                href={`https://wa.me/?text=${encodeURIComponent(`Join my Backgammon VIVO game! ${window.location.origin}?room=${currentRoomId}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-green-600 hover:bg-green-500 rounded-full cursor-pointer transition-all duration-300 shadow-lg hover:scale-110"
                title="Share on WhatsApp"
              >
                <MessageCircle size={20} className="text-white" />
              </a>
              
              {/* Facebook */}
              <a 
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${window.location.origin}?room=${currentRoomId}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 bg-blue-600 hover:bg-blue-500 rounded-full cursor-pointer transition-all duration-300 shadow-lg hover:scale-110"
                title="Share on Facebook"
              >
                <Share2 size={20} className="text-white" />
              </a>
              
              {/* Email */}
              <a 
                href={`mailto:?subject=${encodeURIComponent('Join my Backgammon VIVO game!')}&body=${encodeURIComponent(`I'm inviting you to play Backgammon VIVO together!\n\nClick here to join: ${window.location.origin}?room=${currentRoomId}`)}`}
                className="p-3 bg-gray-600 hover:bg-gray-500 rounded-full cursor-pointer transition-all duration-300 shadow-lg hover:scale-110"
                title="Share via Email"
              >
                <Mail size={20} className="text-white" />
              </a>
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => {
                 window.history.pushState({}, '', window.location.pathname);
                 window.location.reload(); 
              }}
              className="flex-1 py-4 rounded-xl font-bold text-white/50 hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            {onlineCount > 1 && (
              <button className="flex-1 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2">
                <Play size={20} /> Start Game
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm">
      <div className="bg-black/80 border border-white/10 p-8 rounded-3xl w-full max-w-md text-center shadow-2xl backdrop-blur-xl">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 mb-2">
          VIVO
        </h1>
        <p className="text-white/50 mb-10 text-lg">Multijugador AR WebRTC</p>

        <div className="space-y-4">
          <button 
            onClick={handleCreate}
            className="w-full py-5 bg-white text-black font-bold text-xl rounded-2xl hover:scale-105 transition-all shadow-xl flex items-center justify-center gap-3"
          >
            <Share2 size={24} /> Crear Sala
          </button>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-black text-white/30">O</span>
            </div>
          </div>

          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Código de Sala"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 text-center text-white font-mono text-lg focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <button 
              onClick={() => onJoinRoom(inputCode)}
              disabled={inputCode.length < 3}
              className="px-6 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all"
            >
              <ArrowRight size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
