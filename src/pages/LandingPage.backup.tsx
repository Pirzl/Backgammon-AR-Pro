import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Brain, Users, Hand, Video, Shield, Zap, ChevronRight, Home, Menu, X } from 'lucide-react';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  onPlayAI: () => void;
  onPlayOnline: () => void;
  onPlayDesign: () => void;
}

export function LandingPage({ onPlayAI, onPlayOnline, onPlayDesign }: LandingPageProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
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

  return (
    <div className={styles['landing-page']}>
      {/* Mobile Menu Overlay */}
      <div 
        className={`${styles['mobile-menu-overlay']} ${isMenuOpen ? styles['open'] : ''}`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Mobile Menu Sidebar */}
      <div className={`${styles['mobile-menu']} ${isMenuOpen ? styles['open'] : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
          <button onClick={() => setIsMenuOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--gold-soft)', cursor: 'pointer' }}>
            <X size={32} />
          </button>
        </div>
        <a href="#gestos-ar" onClick={() => setIsMenuOpen(false)}>Control AR</a>
        <a href="#como-jugar" onClick={() => setIsMenuOpen(false)}>Cómo Jugar</a>
        <a href="#reglas" onClick={() => setIsMenuOpen(false)}>Reglas</a>
        <a href="#caracteristicas" onClick={() => setIsMenuOpen(false)}>Características</a>
        <a href="#seguridad" onClick={() => setIsMenuOpen(false)}>Seguridad</a>
        <button 
          className={styles['landing-cta-button']} 
          onClick={() => {
            onPlayOnline();
            setIsMenuOpen(false);
          }}
          style={{ marginTop: 'auto' }}
        >
          Jugar Ahora
        </button>
      </div>

      {/* Navegación */}
      <nav className={styles['landing-nav']}>
        <div className={styles['landing-nav-container']}>
          <div className={styles['landing-logo']}>
            <Zap size={28} color="var(--gold-soft)" />
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
            <a className={styles['landing-nav-link']} href="#reglas">
              Reglas
            </a>
            <a className={styles['landing-nav-link']} href="#caracteristicas">
              Características
            </a>
            <a className={styles['landing-nav-link']} href="#seguridad">
              Seguridad
            </a>
            <button className={styles['landing-cta-button']} onClick={onPlayOnline}>
              Jugar Ahora
            </button>
          </div>

          {/* Mobile Hamburger Button */}
          <button className={styles['mobile-menu-btn']} onClick={toggleMenu} aria-label="Menu">
            <Menu size={28} />
          </button>
        </div>
      </nav>

      {/* Sección Hero */}
      <section className={styles['landing-hero']}>
        <motion.div
          className={styles['landing-hero-content']}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className={styles['landing-hero-title']}>
            Backgammon VIVO
          </h1>
          <p className={styles['landing-hero-subtitle']}>
            Experimenta el juego ancestral reimaginado con seguimiento de manos AR, IA inteligente y videochat en directo. 
            Juega donde quieras, en cualquier dispositivo.
          </p>
          <div className={styles['landing-hero-buttons']}>
            <motion.button
              className={`${styles['landing-hero-button']} ${styles['landing-hero-button-primary']}`}
              onClick={onPlayAI}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Brain size={24} />
              Desafiar IA
              <ChevronRight size={20} />
            </motion.button>
            <motion.button
              className={`${styles['landing-hero-button']} ${styles['landing-hero-button-secondary']}`}
              onClick={onPlayOnline}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Users size={24} />
              Jugar Online
            </motion.button>
            <motion.button
              className={`${styles['landing-hero-button']}`}
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
              onClick={onPlayDesign}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Zap size={24} />
              Test Design
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* 1. Sección Control por Gestos AR - PRIMERO */}
      <section id="gestos-ar" className={styles['landing-section']}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles['landing-section-title']}>Control por Gestos AR</h2>
          <p className={styles['landing-section-subtitle']}>
            Juega sin tocar la pantalla - solo con tus manos
          </p>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <img 
              src="/gestos.png"
              alt="Gestos de mano para controlar el juego"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid var(--mauve-grey)' }}
            />
          </div>
        </motion.div>
      </section>

      {/* 2. Sección Cómo Jugar - SEGUNDO */}
      <section id="como-jugar" className={styles['landing-section']}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles['landing-section-title']}>Cómo Jugar</h2>
          <p className={styles['landing-section-subtitle']}>
            ¡Simple para un niño de 8 años, fascinante para uno de 80!
          </p>

          <div className={styles['landing-features-grid']}>
            {/* Control con Manos */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Hand size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Controla con Tus Manos</h3>
              <p className={styles['landing-feature-description']}>
                Usa tu cámara para controlar el juego con gestos de mano. ¡No necesitas tocar nada!
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>👌 Pinza para agarrar fichas</li>
                <li>✋ Abre para soltar</li>
                <li>🖱️ O usa ratón/táctil</li>
              </ul>
            </motion.div>

            {/* Fundamentos del Backgammon */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Zap size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Fundamentos del Backgammon</h3>
              <p className={styles['landing-feature-description']}>
                ¡Mueve tus 15 fichas alrededor del tablero y sé el primero en sacarlas todas!
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>🎲 Lanza dados para moverte</li>
                <li>⚔️ Captura fichas rivales</li>
                <li>🏆 El primero en sacar todas gana</li>
              </ul>
            </motion.div>

            {/* Inicio Rápido */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles['landing-feature-icon']}>
                <ChevronRight size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Inicio Rápido</h3>
              <p className={styles['landing-feature-description']}>
                ¡Salta directo! La IA te enseñará mientras juegas, o enfrenta amigos online.
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>🤖 Practica vs IA (10 niveles)</li>
                <li>🌍 Desafía amigos online</li>
                <li>📊 Sigue tu progreso</li>
              </ul>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* 3. Sección Reglas Completas del Backgammon - TERCERO (SIN IMAGEN DEL TABLERO) */}
      <section id="reglas" className={styles['landing-section']}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles['landing-section-title']}>Reglas del Backgammon</h2>
          <p className={styles['landing-section-subtitle']}>
            Todo lo que necesitas saber para dominar este juego de 5,000 años
          </p>

          <div className={styles['landing-features-grid']}>
            {/* Objetivo */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Zap size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>🎯 Objetivo</h3>
              <p className={styles['landing-feature-description']}>
                Sé el primero en sacar todas tus 15 fichas del tablero. Las fichas blancas se mueven en sentido horario, las negras en sentido antihorario.
              </p>
            </motion.div>

            {/* Preparación */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className={styles['landing-feature-icon']}>
                <ChevronRight size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>⚙️ Preparación</h3>
              <ul className={styles['landing-feature-list']}>
                <li>Cada jugador tiene 15 fichas</li>
                <li>Las fichas comienzan en posiciones específicas</li>
                <li>Se lanzan 2 dados para moverse</li>
                <li>El dado más alto mueve primero</li>
              </ul>
            </motion.div>

            {/* Movimientos */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Hand size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>🎲 Movimientos</h3>
              <ul className={styles['landing-feature-list']}>
                <li>Lanza 2 dados cada turno</li>
                <li>Mueve según cada dado (separado)</li>
                <li>Dobles = 4 movimientos</li>
                <li>Debes jugar ambos dados si es posible</li>
              </ul>
            </motion.div>

            {/* Capturar */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Shield size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>⚔️ Capturar</h3>
              <p className={styles['landing-feature-description']}>
                Si caes en un punto con UNA sola ficha enemiga, la capturas. La ficha capturada va a la BARRA y debe volver a entrar antes de hacer otros movimientos.
              </p>
            </motion.div>

            {/* Sacar Fichas */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Home size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>🏡 Sacar Fichas (Bearing Off)</h3>
              <p className={styles['landing-feature-description']}>
                Cuando TODAS tus fichas están en tu "CASA" (último cuadrante), puedes empezar a sacarlas del tablero según los dados.
              </p>
            </motion.div>

            {/* Ganar */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Zap size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>🏆 Ganar</h3>
              <p className={styles['landing-feature-description']}>
                El primer jugador en sacar TODAS sus 15 fichas del tablero es el GANADOR. ¡Simple pero estratégico!
              </p>
            </motion.div>
          </div>

          {/* Diagrama de Ejemplo de Jugada */}
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--gold-soft)' }}>
              Ejemplo de Jugada Ganadora
            </h3>
            <img 
              src="/ejemplo.webp"
              alt="Ejemplo de cómo sacar fichas para ganar"
              style={{ maxWidth: '100%', height: 'auto', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', border: '1px solid var(--mauve-grey)' }}
            />
          </div>
        </motion.div>
      </section>

      {/* Sección Características */}
      <section id="caracteristicas" className={styles['landing-section']}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles['landing-section-title']}>Características</h2>
          <p className={styles['landing-section-subtitle']}>
            Tecnología de vanguardia combinada con jugabilidad atemporal
          </p>

          <div className={styles['landing-features-grid']}>
            {/* IA Inteligente */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Brain size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>IA Inteligente</h3>
              <p className={styles['landing-feature-description']}>
                Desafía a una IA adaptativa que aprende de cada partida. Elige dificultad desde Nivel 1 (Principiante) hasta Nivel 10 (Gran Maestro).
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>10 niveles de dificultad</li>
                <li>Aprende de base de datos Supabase</li>
                <li>Juego instantáneo, sin esperas</li>
              </ul>
            </motion.div>

            {/* Multijugador Ventana de Cristal */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Video size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Multijugador Ventana de Cristal</h3>
              <p className={styles['landing-feature-description']}>
                Juega con amigos de todo el mundo a través de una "ventana de cristal" — véanse por videochat mientras mueven las piezas en tiempo real.
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>Video peer-to-peer WebRTC</li>
                <li>Tablero sincronizado en tiempo real</li>
                <li>Comparte link de sala al instante</li>
              </ul>
            </motion.div>

            {/* Seguimiento de Manos AR */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Hand size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Seguimiento de Manos AR</h3>
              <p className={styles['landing-feature-description']}>
                Usa tu cámara para controlar el juego con gestos de mano. ¡Pinza para agarrar, abre para soltar — es como magia!
              </p>
              <ul className={styles['landing-feature-list']}>
                <li>Detección MediaPipe hands</li>
                <li>Activa/desactiva cámara cuando quieras</li>
                <li>Funciona en todos los dispositivos modernos</li>
              </ul>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Sección Seguridad y Privacidad */}
      <section id="seguridad" className={styles['landing-section']}>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles['landing-section-title']}>Seguridad y Privacidad</h2>
          <p className={styles['landing-section-subtitle']}>
            Tu seguridad y privacidad son nuestras prioridades máximas
          </p>

          <div className={styles['landing-features-grid']}>
            {/* Encriptación End-to-End */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Shield size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Encriptación End-to-End</h3>
              <p className={styles['landing-feature-description']}>
                Todo el video y datos del juego se transmiten vía conexión peer-to-peer WebRTC con encriptación.
              </p>
            </motion.div>

            {/* Control de Cámara */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Video size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Control de Cámara</h3>
              <p className={styles['landing-feature-description']}>
                Tú decides cuándo activar tu cámara. Actívala/desactívala en cualquier momento durante el juego.
              </p>
            </motion.div>

            {/* Sin Datos Personales */}
            <motion.div
              className={styles['landing-feature-card']}
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <div className={styles['landing-feature-icon']}>
                <Shield size={32} />
              </div>
              <h3 className={styles['landing-feature-title']}>Sin Datos Personales Almacenados</h3>
              <p className={styles['landing-feature-description']}>
                No recopilamos información personal. Los datos del juego son anónimos y solo se usan para mejorar la IA.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className={styles['landing-footer']}>
        <div className={styles['landing-footer-content']}>
          <div className={styles['landing-logo']} style={{ marginBottom: '1.5rem', justifyContent: 'center' }}>
            <Zap size={24} color="var(--gold-soft)" />
            VIVO
          </div>
          <p className={styles['landing-footer-text']}>
            © 2026 Backgammon VIVO.
          </p>
          <p className={styles['landing-footer-text']} style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            Política de Privacidad • Términos de Servicio • Contáctanos tpirzl@aidoit4u.eu
          </p>
        </div>
      </footer>

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
    </div>
  );
}
