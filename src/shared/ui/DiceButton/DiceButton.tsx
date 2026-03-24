import React, { useState } from 'react';
import styles from './DiceButton.module.css';

interface DiceButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const DiceButton: React.FC<DiceButtonProps> = ({ 
  onClick, 
  disabled = false, 
  className = '',
  size = 'md' 
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = () => {
    if (disabled || isAnimating) return;
    
    setIsAnimating(true);
    
    // Extend the pre-roll spin animation to 1.5s to simulate rolling
    setTimeout(() => {
      onClick();
      setIsAnimating(false);
    }, 1500);
  };

  const sizeClass = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;

  return (
    <button
      id="btn-dado"
      className={`${styles.diceBtn} ${sizeClass} ${isAnimating ? styles.rotar : 'animate-pulse hover:scale-105'} ${className} ${disabled ? styles.disabled : ''}`}
      onClick={handleClick}
      disabled={disabled || isAnimating}
      aria-label="Lanzar dados"
    >
      <img 
        id="img-dado" 
        src="/dado.png" 
        alt="Dado" 
        className={styles.diceImg}
      />
    </button>
  );
};
