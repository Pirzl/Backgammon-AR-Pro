import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Brain, Users, Hand, Video, Shield, Zap, ChevronRight, Menu, X } from 'lucide-react';
import styles from './LandingPage.module.css';
import { BackgammonScroll } from '../components/BackgammonScroll';
import { WisdomWidget } from '../features/ai-worker/ui/WisdomWidget';
import { OctagonMenu } from '../components/OctagonMenu/OctagonMenu';
import { Board } from '../features/game-board/ui/Board';
import { useBoardDimensions } from '../features/game-board/lib/useBoardDimensions';
import { INITIAL_BOARD } from '../entities/game/constants';
import { useScrollReveal } from '../hooks/useScrollReveal';
import type { GameState } from '../entities/game/types';

/* Whole-section scroll reveal (CSS classes, IntersectionObserver) */
function SectionReveal({ children }: { children: ReactNode }) {
  const [ref, isVisible] = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`${styles['reveal']} ${isVisible ? styles['is-visible'] : ''}`}
    >
      {children}
    </div>
  );
}

const itemMotion = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

export function LandingPage() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showFAB, setShowFAB] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showOctagon, setShowOctagon] = useState(false);
  const [initialOctagonIndex, setInitialOctagonIndex] = useState(0);
  const navigate = useNavigate();

  // Background Board logic
  const { containerRef, dimensions, getPixelCoordinates } = useBoardDimensions();
  const dummyState = useMemo<GameState>(() => ({
    board: INITIAL_BOARD,
    turn: 'white',
    dice: [6, 6],
    usedDice: [],
    cube: 1,
    cubeOwner: null,
    crawford: false,
    matchScore: { white: 0, black: 0 },
    winner: null
  }), []);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    { q: "¿Qué es Backgammon-Vivo?", a: "Backgammon-Vivo es una plataforma de juegos de estrategia impulsada por inteligencia artificial. Permite jugar, aprender y mejorar habilidades estratégicas mediante sistemas de puntos, sin apuestas ni dinero real." },
    { q: "¿Es gratis usar Backgammon-Vivo?", a: "Sí. El uso del juego y sus funciones principales es completamente gratuito. No existen pagos, compras internas ni transacciones económicas." },
    { q: "¿La IA aprende de mis partidas?", a: "Sí. El sistema utiliza técnicas de aprendizaje para mejorar su estilo de juego analizando patrones, decisiones y resultados. Todo el aprendizaje se realiza de forma anónima y sin recopilar datos sensibles." },
    { q: "¿Qué edad mínima se requiere para jugar?", a: "La plataforma está destinada a usuarios mayores de 13 años, en cumplimiento con el Reglamento General de Protección de Datos (GDPR). Los menores de 13 años necesitan consentimiento de sus tutores legales." },
    { q: "¿Se utilizan datos personales?", a: "Solo recopilamos los datos estrictamente necesarios para el funcionamiento del juego: estadísticas, progreso, configuración y datos técnicos del dispositivo. No recopilamos información sensible ni financiera." },
    { q: "¿Qué tipo de cookies utiliza la web?", a: "Usamos cookies técnicas para que el sitio funcione correctamente y cookies opcionales de análisis para mejorar la experiencia. No utilizamos cookies publicitarias ni de terceros con fines comerciales." },
    { q: "¿Puedo eliminar mis datos o mi cuenta?", a: "Sí. Puedes solicitar la eliminación de tus datos escribiendo a privacidad@aidoit4u.eu. Eliminaremos toda la información asociada a tu usuario según GDPR." },
    { q: "¿Hay dinero real, apuestas o recompensas económicas?", a: "No. Backgammon-Vivo funciona únicamente con un sistema de puntos virtuales. No existe dinero real, apuestas, premios económicos ni mecanismos de monetización." },
    { q: "¿Qué hago si encuentro un error o tengo un problema técnico?", a: "Puedes contactar con nuestro equipo en soporte@aidoit4u.eu. Intentaremos responder en un plazo de 24 a 72 horas." },
    { q: "¿Puedo jugar desde cualquier dispositivo?", a: "Sí. La plataforma está optimizada para navegadores modernos en ordenador, móvil y tablet. Recomendamos usar la versión más actualizada de tu navegador para el mejor rendimiento." }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;

      // Back to Top button (after 300px)
      setShowBackToTop(scrolled > 300);

      // FAB button (after hero section, approximately 800px)
      setShowFAB(scrolled > 800);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const handleAIPlay = async () => {
    setInitialOctagonIndex(0);
    setShowOctagon(true);
  };

  const handleOnlinePlay = () => {
    setInitialOctagonIndex(1);
    setShowOctagon(true);
  };

  return (
    <div className={styles['landing-page']}>
      {/* Scrolling Background Animation */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        <BackgammonScroll />
      </div>

      {/* Content Layer */}
      <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Mobile Menu Overlay */}
      <div 
        className={`${styles['mobile-menu-overlay']} ${isMenuOpen ? styles['open'] : ''}`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Mobile Menu Sidebar */}
      <div className={`${styles['mobile-menu']} ${isMenuOpen ? styles['open'] : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
          <button aria-label="Cerrar menú" onClick={() => setIsMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--color-accent)', cursor: 'pointer' }}>
            <X size={32} />
          </button>
        </div>
        <a href="#gestos-ar" onClick={() => setIsMenuOpen(false)}>Control AR</a>
        <a href="#como-jugar" onClick={() => setIsMenuOpen(false)}>Cómo Jugar</a>
        <a href="#caracteristicas" onClick={() => setIsMenuOpen(false)}>Características</a>
        <a href="#reglas" onClick={() => setIsMenuOpen(false)}>Reglas</a>
        <a href="#seguridad" onClick={() => setIsMenuOpen(false)}>Seguridad</a>
        <button 
          className={styles['landing-cta-button']} 
          onClick={async () => {
             setIsMenuOpen(false);
             await handleAIPlay();
          }}
          style={{ marginTop: 'auto', marginBottom: '1rem' }}
        >
          Iniciar Sesión
        </button>
        <button 
          className={styles['landing-cta-button']} 
          onClick={() => {
            navigate('/auth/register-benefits');
            setIsMenuOpen(false);
          }}
          style={{ background: 'transparent', border: '1px solid var(--color-accent-border)' }}
        >
          Registrarse
        </button>
      </div>

      {/* Navegación */}
      <nav className={styles['landing-nav']}>
        <div className={styles['landing-nav-container']}>
          <div className={styles['landing-logo']}>
            <Zap size={26} color="var(--color-accent)" />
            VIVO
          </div>

          {/* Desktop Links */}
          <div className={styles['landing-nav-links']}>
            <a className={styles['landing-nav-link']} href="#gestos-ar">
              Control AR
            </a>
            <a className={styles['landing-nav-link']} href="#como-jugar">
              Cómo Jugar
            </a>
            <a className={styles['landing-nav-link']} href="#caracteristicas">
              Características
            </a>
            <a className={styles['landing-nav-link']} href="#reglas">
              Reglas
            </a>
            <a className={styles['landing-nav-link']} href="#seguridad">
              Seguridad
            </a>
            <div className="flex gap-4 items-center">
              <button 
                className={styles['landing-nav-link']} 
                onClick={() => navigate('/auth/login')}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                Login
              </button>
              <button 
                className={styles['landing-cta-button']} 
                onClick={() => navigate('/auth/register-benefits')}
              >
                Registro
              </button>
            </div>
          </div>

          {/* Mobile Hamburger Button */}
          <button className={styles['mobile-menu-btn']} onClick={toggleMenu} aria-label="Abrir menú">
            <Menu size={28} />
          </button>
        </div>
      </nav>

      {/* Hero — ENGINEERED PEAK (one awe moment on the page) */}
      <section className={styles['landing-hero']}>
        <motion.div
          className={styles['landing-hero-content']}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className={styles['landing-hero-eyebrow']}>
            Backgammon · AR · IA
          </span>
          <h1 className={styles['landing-hero-title']}>
            Backgammon <span className={styles['gold']}>VIVO</span>
          </h1>
          <p className={styles['landing-hero-subtitle']}>
            El juego ancestral, reimaginado: controla el tablero con tus manos,
            desafía a una IA Gran Maestro y juega con amigos por video en vivo.
          </p>
          <div className={styles['landing-hero-buttons']}>
            <motion.button
              className={`${styles['landing-hero-button']} ${styles['landing-hero-button-primary']}`}
              onClick={handleAIPlay}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Brain size={22} />
              Desafiar IA
              <ChevronRight size={18} />
            </motion.button>
            <motion.button
              className={`${styles['landing-hero-button']} ${styles['landing-hero-button-secondary']}`}
              onClick={handleOnlinePlay}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Users size={22} />
              Jugar Online
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* AI proof strip — real product signal, below the peak */}
      <div className={styles['wisdom-strip']}>
        <WisdomWidget />
      </div>

      {/* 1. Sección Control por Gestos AR */}
      <section id="gestos-ar" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Control por Gestos AR</h2>
          <p className={styles['landing-section-subtitle']}>
            Juega sin tocar la pantalla — solo con tus manos
          </p>

          <motion.div {...itemMotion} className={styles['landing-image-container']}>
            <img 
              src="/gestos.png"
              alt="Gestos de mano para controlar el juego"
              loading="lazy"
              fetchPriority="high"
              className={styles['media-frame']}
            />
          </motion.div>
        </SectionReveal>
      </section>

      {/* 2. Cómo Jugar — vertical feature rows (no identical card grid) */}
      <section id="como-jugar" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Cómo Jugar</h2>
          <p className={styles['landing-section-subtitle']}>
            Simple para un niño de 8 años, fascinante para uno de 80
          </p>

          <div className={styles['feature-rows']}>
            <motion.div {...itemMotion} className={styles['feature-row']}>
              <div className={styles['feature-row-icon']}>
                <Hand size={28} />
              </div>
              <div>
                <h3 className={styles['feature-row-title']}>Controla con tus manos</h3>
                <p className={styles['feature-row-description']}>
                  Usa tu cámara para jugar con gestos. Sin tocar nada.
                </p>
                <ul className={styles['feature-row-list']}>
                  <li>👌 Pinza para agarrar fichas</li>
                  <li>✋ Abre la mano para soltar</li>
                  <li>🖱️ O usa ratón y táctil</li>
                </ul>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['feature-row']}>
              <div className={styles['feature-row-icon']}>
                <Zap size={28} />
              </div>
              <div>
                <h3 className={styles['feature-row-title']}>Fundamentos del backgammon</h3>
                <p className={styles['feature-row-description']}>
                  Mueve tus 15 fichas alrededor del tablero y sé el primero en sacarlas todas.
                </p>
                <ul className={styles['feature-row-list']}>
                  <li>🎲 Lanza dados para moverte</li>
                  <li>⚔️ Captura fichas rivales</li>
                  <li>🏆 El primero en sacar todas gana</li>
                </ul>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['feature-row']}>
              <div className={styles['feature-row-icon']}>
                <ChevronRight size={28} />
              </div>
              <div>
                <h3 className={styles['feature-row-title']}>Inicio rápido</h3>
                <p className={styles['feature-row-description']}>
                  Salta directo: la IA te enseña mientras juegas o desafía a amigos online.
                </p>
                <ul className={styles['feature-row-list']}>
                  <li>🤖 Practica vs IA (10 niveles)</li>
                  <li>🌍 Desafía amigos online</li>
                  <li>📊 Sigue tu progreso</li>
                </ul>
              </div>
            </motion.div>
          </div>
        </SectionReveal>
      </section>

      {/* 3. Características — bento (main IA + supporting stack) */}
      <section id="caracteristicas" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Características</h2>
          <p className={styles['landing-section-subtitle']}>
            Tecnología de vanguardia con jugabilidad atemporal
          </p>

          <motion.div {...itemMotion} className={styles['landing-image-container']}>
            <img 
              src="/ar-game-virtual.png"
              alt="Juego Virtual AR"
              loading="lazy"
              className={styles['media-frame']}
            />
          </motion.div>

          <div className={styles['bento']}>
            <motion.div {...itemMotion} className={`${styles['bento-card']} ${styles['bento-card-main']}`}>
              <h3 className={styles['bento-title']}>
                <Brain size={26} color="var(--color-accent)" />
                IA Inteligente
              </h3>
              <p className={styles['bento-text']}>
                Una IA adaptativa que aprende de cada partida. Elige dificultad desde
                Nivel 1 (Principiante) hasta Nivel 10 (Gran Maestro).
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>10 niveles de dificultad</li>
                <li>Aprende de una base de datos de posiciones</li>
                <li>Juego instantáneo, sin esperas</li>
              </ul>
            </motion.div>

            <div className={styles['bento-stack']}>
              <motion.div {...itemMotion} className={styles['bento-card']}>
                <h3 className={styles['bento-title']}>
                  <Video size={24} color="var(--color-accent)" />
                  Ventana de Cristal
                </h3>
                <p className={styles['bento-text']}>
                  Juega con amigos de todo el mundo: véanse por videochat mientras
                  mueven las piezas en tiempo real.
                </p>
                <ul className={styles['landing-feature-list']}>
                  <li>Video peer-to-peer WebRTC</li>
                  <li>Tablero sincronizado en tiempo real</li>
                </ul>
              </motion.div>

              <motion.div {...itemMotion} className={styles['bento-card']}>
                <h3 className={styles['bento-title']}>
                  <Hand size={24} color="var(--color-accent)" />
                  Seguimiento de manos AR
                </h3>
                <p className={styles['bento-text']}>
                  Pinza para agarrar, abre para soltar — como magia.
                </p>
                <ul className={styles['landing-feature-list']}>
                  <li>Detección MediaPipe hands</li>
                  <li>Cámara activable cuando quieras</li>
                </ul>
              </motion.div>
            </div>
          </div>
        </SectionReveal>
      </section>

      {/* 4. Reglas — compact two-column rules (no 6-card grid) */}
      <section id="reglas" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Reglas del Backgammon</h2>
          <p className={styles['landing-section-subtitle']}>
            Todo lo que necesitas para dominar este juego de 5,000 años
          </p>

          <div className={styles['rules-grid']}>
            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>🎯</span>
              <div>
                <h3 className={styles['rule-title']}>Objetivo</h3>
                <p className={styles['rule-body']}>
                  Sé el primero en sacar tus 15 fichas del tablero. Las blancas
                  avanzan en sentido horario; las rojas, antihorario.
                </p>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>⚙️</span>
              <div>
                <h3 className={styles['rule-title']}>Preparación</h3>
                <div className={styles['rule-body']}>
                  <ul>
                    <li>Cada jugador tiene 15 fichas</li>
                    <li>Se lanzan 2 dados para moverse</li>
                    <li>El dado más alto mueve primero</li>
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>🎲</span>
              <div>
                <h3 className={styles['rule-title']}>Movimientos</h3>
                <div className={styles['rule-body']}>
                  <ul>
                    <li>Lanza 2 dados cada turno</li>
                    <li>Dobles = 4 movimientos</li>
                    <li>Juega ambos dados si es posible</li>
                  </ul>
                </div>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>⚔️</span>
              <div>
                <h3 className={styles['rule-title']}>Capturar</h3>
                <p className={styles['rule-body']}>
                  Cae en un punto con una sola ficha enemiga y la capturas. La ficha
                  capturada va a la barra y debe reentrar antes de mover.
                </p>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>🏡</span>
              <div>
                <h3 className={styles['rule-title']}>Sacar fichas</h3>
                <p className={styles['rule-body']}>
                  Con todas tus fichas en tu casa puedes empezar a sacarlas del
                  tablero según los dados (bearing off).
                </p>
              </div>
            </motion.div>

            <motion.div {...itemMotion} className={styles['rule-card']}>
              <span className={styles['rule-icon']}>🏆</span>
              <div>
                <h3 className={styles['rule-title']}>Ganar</h3>
                <p className={styles['rule-body']}>
                  El primer jugador en sacar todas sus fichas gana. Simple, pero
                  profundamente estratégico.
                </p>
              </div>
            </motion.div>
          </div>

          <motion.div {...itemMotion} className={styles['landing-image-container']}>
            <h3 className={styles['media-caption']}>Ejemplo de jugada ganadora</h3>
            <img 
              src="/ejemplo.webp"
              alt="Ejemplo de cómo sacar fichas para ganar"
              loading="lazy"
              className={styles['media-frame']}
            />
          </motion.div>
        </SectionReveal>
      </section>

      {/* 5. Seguridad — full-width assurance + two supporting cards */}
      <section id="seguridad" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Seguridad y privacidad</h2>
          <p className={styles['landing-section-subtitle']}>
            Tu seguridad y privacidad son nuestras prioridades máximas
          </p>

          <div className={styles['bento']}>
            <motion.div {...itemMotion} className={`${styles['bento-card']} ${styles['bento-card-main']} ${styles['bento-single']}`}>
              <h3 className={styles['bento-title']}>
                <Shield size={26} color="var(--color-accent)" />
                Encriptación de extremo a extremo
              </h3>
              <p className={styles['bento-text']}>
                Todo el video y los datos del juego viajan por conexión peer-to-peer
                WebRTC con encriptación. Nadie en medio puede leerlos.
              </p>
            </motion.div>

            <motion.div {...itemMotion} className={styles['bento-card']}>
              <h3 className={styles['bento-title']}>
                <Video size={24} color="var(--color-accent)" />
                Control de cámara
              </h3>
              <p className={styles['bento-text']}>
                Tú decides cuándo activarla. Enciéndela o apágala en cualquier
                momento durante la partida.
              </p>
            </motion.div>

            <motion.div {...itemMotion} className={styles['bento-card']}>
              <h3 className={styles['bento-title']}>
                <Shield size={24} color="var(--color-accent)" />
                Sin datos personales
              </h3>
              <p className={styles['bento-text']}>
                No recopilamos información personal. Los datos del juego son
                anónimos y solo se usan para mejorar la IA.
              </p>
            </motion.div>
          </div>
        </SectionReveal>
      </section>

      {/* 6. Sección FAQ */}
      <section id="faq" className={styles['landing-section']}>
        <SectionReveal>
          <h2 className={styles['landing-section-title']}>Preguntas Frecuentes (FAQ)</h2>
          <p className={styles['landing-section-subtitle']}>
            Resuelve tus dudas sobre la plataforma y cómo funciona
          </p>

          <div className={styles['faq-container']}>
            {faqs.map((faq, index) => (
              <div key={index} className={styles['faq-item']}>
                <button
                  className={styles['faq-question']}
                  onClick={() => toggleFaq(index)}
                  aria-expanded={openFaq === index}
                >
                  {faq.q}
                  <ChevronRight size={22} className={styles['faq-icon']} />
                </button>
                <div 
                  className={`${styles['faq-answer-wrapper']} ${openFaq === index ? styles['open'] : ''}`}
                >
                  <div className={styles['faq-answer']}>
                    <div className={styles['faq-answer-content']}>
                      {faq.a}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionReveal>
      </section>

      {/* Sticky FAB "Play Now" Button */}
      {showFAB && !isMenuOpen && (
        <motion.button
          className={styles['fab-button']}
          onClick={handleAIPlay}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          whileHover={{ scale: 1.1, rotate: 15 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          aria-label="Jugar Ahora"
        >
          <img 
            src="/dice-fab.png" 
            alt="Jugar" 
            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(212, 168, 67, 0.5))' }} 
          />
        </motion.button>
      )}

      {/* Back to Top Button */}
      {showBackToTop && (
        <button 
          className={`${styles['back-to-top']} ${styles['visible']}`}
          onClick={scrollToTop}
          aria-label="Volver arriba"
        >
          <ChevronRight size={24} style={{ transform: 'rotate(-90deg)' }} />
        </button>
      )}

      {/* Octagon Menu Overlay */}
      {showOctagon && (
        <>
          <div className={styles['octagon-background-board']}>
            <div ref={containerRef} className="w-full h-full max-w-5xl mx-auto flex items-center justify-center">
              <Board 
                state={dummyState}
                selectedPoint={null}
                validTargetPoints={[]}
                onPointTap={() => {}}
                onCheckerTap={() => {}}
                isPending={false}
                myColor="white"
                containerRef={containerRef}
                dimensions={dimensions}
                getPixelCoordinates={getPixelCoordinates}
                boardOpacity={0.4}
              />
            </div>
          </div>
          <OctagonMenu onClose={() => setShowOctagon(false)} initialIndex={initialOctagonIndex} />
        </>
      )}
      </div> {/* End Content Layer */}
    </div>
  );
}
