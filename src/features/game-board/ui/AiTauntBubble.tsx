import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

interface AiTauntBubbleProps {
  isVisible: boolean;
  message: string;
}

export const AiTauntBubble: React.FC<AiTauntBubbleProps> = ({ isVisible, message }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none"
        >
          <div className="bg-slate-900/70 border border-purple-500/50 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 backdrop-blur-lg relative max-w-md text-center">
            <MessageSquare size={18} className="text-purple-400 flex-shrink-0" />
            <p className="text-sm font-medium italic text-slate-100">"{message}"</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
