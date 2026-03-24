import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export const AuthLayout = ({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0F172A] relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md p-8 backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl shadow-2xl mx-4"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-400 mt-2 text-sm">{subtitle}</p>
          )}
        </div>
        {children}
      </motion.div>
    </div>
  );
};
