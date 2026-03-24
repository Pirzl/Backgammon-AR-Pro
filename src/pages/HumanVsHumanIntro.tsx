import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Trophy, 
  Users, 
  ShieldCheck, 
  Globe, 
  ChevronLeft, 
  Zap, 
  LogIn, 
  UserPlus
} from 'lucide-react';
import styles from './HumanVsHumanIntro.module.css';

export function HumanVsHumanIntro() {
  const navigate = useNavigate();

  return (
    <div className={styles['human-vs-human-container']}>
      {/* Background Layer */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100vh', zIndex: 0, pointerEvents: 'none' }}>
        {/* BackgammonScroll removed as per request */}
      </div>
      <div className={styles['background-overlay']} />

      {/* Main Content */}
      <div className={styles['content-wrapper']}>
        
        {/* Navigation Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <Zap size={24} color="var(--gold-soft, #D4AF37)" />
            <span>VIVO</span>
          </div>
          <button 
            onClick={() => navigate('/')} 
            className={styles['back-button']}
            aria-label="Volver al inicio"
          >
            <ChevronLeft size={18} />
            Inicio
          </button>
        </header>

        {/* Hero Section */}
        <motion.div 
          className={styles['hero-section']}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className={styles['hero-title']}>Entra a la Arena Global</h1>
          <p className={styles['hero-subtitle']}>
            Compite contra jugadores reales en partidas verificadas. 
            Únete a nuestra comunidad exclusiva para acceder a torneos, rankings y más.
          </p>
        </motion.div>

        {/* Split Layout */}
        <div className={styles['main-grid']}>
          
          {/* Left Column: Benefits */}
          <motion.div 
            className={styles['benefits-card']}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className={styles['section-title']}>
              <Trophy size={24} />
              ¿Por qué Registrarse?
            </h2>
            
            <ul className={styles['benefits-list']}>
              <li className={styles['benefit-item']}>
                <div className={styles['benefit-icon-wrapper']}>
                  <Globe size={24} />
                </div>
                <div className={styles['benefit-content']}>
                  <h3>Rankings Globales y ELO</h3>
                  <p>Cada victoria cuenta. Asciende en la clasificación mundial y demuestra tu habilidad.</p>
                </div>
              </li>
              
              <li className={styles['benefit-item']}>
                <div className={styles['benefit-icon-wrapper']}>
                  <Users size={24} />
                </div>
                <div className={styles['benefit-content']}>
                  <h3>Jugadores Verificados</h3>
                  <p>Sin bots ni trampas. Nuestra comunidad está formada por entusiastas reales del backgammon.</p>
                </div>
              </li>
              
              <li className={styles['benefit-item']}>
                <div className={styles['benefit-icon-wrapper']}>
                  <ShieldCheck size={24} />
                </div>
                <div className={styles['benefit-content']}>
                  <h3>Juego Seguro</h3>
                  <p>Plataforma monitoreada para garantizar el juego limpio y el respeto mutuo.</p>
                </div>
              </li>
            </ul>
          </motion.div>

          {/* Right Column: Actions */}
          <motion.div 
            className={styles['actions-column']}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            
            {/* New User Action */}
            <div className={`${styles['action-card']} ${styles.primary}`}>
              <h3 className={styles['action-title']}>¿Eres Nuevo?</h3>
              <p className={styles['action-description']}>
                Crea tu cuenta gratuita en el CRM para empezar a competir hoy mismo.
              </p>
              <button 
                className={`${styles['cta-button']} ${styles.primary}`}
                onClick={() => navigate('/auth/register-benefits')}
              >
                <UserPlus size={20} />
                Registrarse Ahora
              </button>
            </div>

            {/* Existing User Action */}
            <div className={styles['action-card']}>
              <h3 className={styles['action-title']}>¿Ya tienes cuenta?</h3>
              <p className={styles['action-description']}>
                Accede a tu panel para ver invitaciones y unirte a salas.
              </p>
              <button 
                className={`${styles['cta-button']} ${styles.secondary}`}
                onClick={() => navigate('/auth/login')}
              >
                <LogIn size={20} />
                Iniciar Sesión
              </button>
            </div>

            <div className={styles['crm-notice']}>
              <p>
                * Solo los usuarios registrados en nuestro CRM pueden generar o unirse a partidas humanas.
              </p>
            </div>

          </motion.div>
        
        </div>
      </div>
    </div>
  );
}
