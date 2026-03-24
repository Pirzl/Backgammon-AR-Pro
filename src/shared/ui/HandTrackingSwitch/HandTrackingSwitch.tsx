import React from 'react';
import styles from './HandTrackingSwitch.module.css';

interface HandTrackingSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  scale?: number;
  className?: string;
}

/**
 * 3D "Industrial" Switch component for Hand Tracking control.
 * Adapted from Uiverse.io by Nawsome.
 */
export const HandTrackingSwitch: React.FC<HandTrackingSwitchProps> = ({
  checked,
  onChange,
  scale = 0.5,
  className = ''
}) => {
  return (
    <div 
      className={`${styles.container} ${className}`} 
      style={{ '--switch-scale': scale } as React.CSSProperties}
    >
      <label className={styles.switch}>
        <input 
          type="checkbox" 
          checked={checked} 
          onChange={(e) => onChange(e.target.checked)} 
        />
        <div className={styles.button}>
          <div className={styles.light}></div>
          <div className={styles.dots}></div>
          <div className={styles.characters}></div>
          <div className={styles.shine}></div>
          <div className={styles.shadow}></div>
        </div>
      </label>
    </div>
  );
};
