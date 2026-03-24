import { motion, useScroll, useTransform } from 'framer-motion';
import { BackgammonScroll } from '../components/BackgammonScroll';

export function DesignTest({ onBack }: { onBack: () => void }) {
  // We need to coordinate text fades with the same scroll progress
  const { scrollYProgress } = useScroll();

  // Opacity transforms for each text section
  // 0% -> 10% Fade In, 15% -> 20% Fade Out
  const opacity1 = useTransform(scrollYProgress, [0, 0.05, 0.15, 0.2], [0, 1, 1, 0]);
  const y1 = useTransform(scrollYProgress, [0, 0.2], [20, 0]);

  // 25% Scroll
  const opacity2 = useTransform(scrollYProgress, [0.2, 0.25, 0.35, 0.4], [0, 1, 1, 0]);
  const y2 = useTransform(scrollYProgress, [0.2, 0.4], [20, 0]);

  // 60% Scroll
  const opacity3 = useTransform(scrollYProgress, [0.55, 0.6, 0.7, 0.75], [0, 1, 1, 0]);
  const y3 = useTransform(scrollYProgress, [0.55, 0.75], [20, 0]);

  // 90% Scroll
  const opacity4 = useTransform(scrollYProgress, [0.85, 0.9, 0.98, 1], [0, 1, 1, 1]); // Stays visible at end
  const y4 = useTransform(scrollYProgress, [0.85, 1], [20, 0]);


  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#ECECEC] text-[#1a1a1a] min-h-screen font-sans selection:bg-orange-200 selection:text-black">
      {/* Back Button for safety */}
      <div className="fixed top-6 left-6 z-50">
        <button 
          onClick={onBack}
          className="px-4 py-2 bg-black/5 hover:bg-black/10 backdrop-blur-md rounded-full text-black/60 hover:text-black font-medium text-sm transition-all duration-300"
        >
          ← Enter Game
        </button>
      </div>

      <BackgammonScroll />

      {/* Text Overlays Layer */}
      <div className="fixed inset-0 pointer-events-none z-10 flex flex-col justify-center">
        
        {/* Section 1: Center */}
        <motion.div 
          style={{ opacity: opacity1, y: y1 }}
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center"
        >
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-4 text-black/90">
            WpDev Backgammon.
          </h1>
          <p className="text-xl md:text-2xl text-black/60 font-light tracking-wide">
            Engineered clarity.
          </p>
        </motion.div>

        {/* Section 2: Left */}
        <motion.div 
          style={{ opacity: opacity2, y: y2 }}
          className="absolute left-[10%] top-1/2 -translate-y-1/2 max-w-md"
        >
          <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-black/90">
            Built for Strategy.
          </h2>
          <p className="text-xl md:text-2xl text-black/60 font-light tracking-wide">
            Every move, measured.
          </p>
        </motion.div>

        {/* Section 3: Right */}
        <motion.div 
            style={{ opacity: opacity3, y: y3 }}
            className="absolute right-[10%] top-1/2 -translate-y-1/2 max-w-md text-right"
        >
            <h2 className="text-5xl md:text-7xl font-bold tracking-tighter mb-4 text-black/90">
            Layered Craftsmanship.
            </h2>
            <p className="text-xl md:text-2xl text-black/60 font-light tracking-wide">
            See what’s inside.
            </p>
        </motion.div>

        {/* Section 4: Center CTA */}
        <motion.div 
            style={{ opacity: opacity4, y: y4 }}
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center"
        >
            <h2 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6 text-black/90">
            Assembled. Ready.
            </h2>
            <p className="text-xl md:text-2xl text-black/60 font-light tracking-wide mb-8">
            Scroll back to replay.
            </p>
        </motion.div>

      </div>
    </div>
  );
}
