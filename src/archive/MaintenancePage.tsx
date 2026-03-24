import styles from './MaintenancePage.module.css';

interface MaintenancePageProps {
  onBack: () => void;
}

export function MaintenancePage({ onBack }: MaintenancePageProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.icon}>🛠️</div>
        
        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Estamos en obras</h1>
          <p className={styles.text}>Estamos realizando mejoras en nuestro sitio web para ofrecerte una mejor experiencia. Disculpa las molestias.</p>
        </div>

        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Under Construction</h1>
          <p className={styles.text}>We are making improvements to our website to provide you with a better experience. Sorry for the inconvenience.</p>
        </div>

        <div className={styles['lang-section']}>
          <h1 className={styles.title}>Wartungsarbeiten</h1>
          <p className={styles.text}>Wir nehmen Verbesserungen an unserer Website vor, um Ihnen ein besseres Erlebnis zu bieten. Entschuldigen Sie die Unannehmlichkeiten.</p>
        </div>

        <button onClick={onBack} className={styles.btn}>
          Volver / Back / Zurück
        </button>
      </div>
    </div>
  );
}
