import { useNavigate, useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import styles from './MaintenancePage.module.css';
import type { GameMode } from '../features/admin/GameSettingsContext';

interface MaintenancePageProps {
  gameMode?: GameMode;
}

/**
 * Maintenance Page Component
 * Displayed when a specific game mode is disabled by the administrator
 */
export function MaintenancePage({ gameMode }: MaintenancePageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Get mode from props or URL params
  const mode = gameMode || searchParams.get('mode') as GameMode | null;
  
  // Mode-specific messaging
  const getModeText = () => {
    switch (mode) {
      case 'ai':
        return {
          es: 'El modo "Jugar contra la IA" está temporalmente en mantenimiento.',
          en: '"Play against the AI" mode is temporarily under maintenance.',
          de: 'Der Modus "Gegen KI spielen" befindet sich vorübergehend in Wartung.'
        };
      case 'human':
        return {
          es: 'El modo "Jugar contra humanos" está temporalmente en mantenimiento.',
          en: '"Play against humans" mode is temporarily under maintenance.',
          de: 'Der Modus "Gegen Menschen spielen" befindet sich vorübergehend in Wartung.'
        };
      default:
        return {
          es: 'Estamos realizando mejoras en nuestro sitio web para ofrecerte una mejor experiencia.',
          en: 'We are making improvements to our website to provide you with a better experience.',
          de: 'Wir nehmen Verbesserungen an unserer Website vor, um Ihnen ein besseres Erlebnis zu bieten.'
        };
    }
  };

  const modeText = getModeText();

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>
          <Settings size={50} className="animate-spin" style={{ color: '#d9534f' }} />
        </div>
        
        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Modo en Mantenimiento</h1>
          <p className={styles.text}>{modeText.es}</p>
          <p className={styles.text} style={{ fontSize: '0.9rem', color: '#666' }}>
            Disculpa las molestias.
          </p>
        </div>

        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Mode Under Maintenance</h1>
          <p className={styles.text}>{modeText.en}</p>
          <p className={styles.text} style={{ fontSize: '0.9rem', color: '#666' }}>
            Sorry for the inconvenience.
          </p>
        </div>

        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Wartungsmodus</h1>
          <p className={styles.text}>{modeText.de}</p>
          <p className={styles.text} style={{ fontSize: '0.9rem', color: '#666' }}>
            Entschuldigen Sie die Unannehmlichkeiten.
          </p>
        </div>

        <button onClick={handleBack} className={styles.btn}>
          Volver al Inicio / Back to Home / Zurück zur Startseite
        </button>
      </div>
    </div>
  );
}
