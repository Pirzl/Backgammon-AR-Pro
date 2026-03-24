// e:/Proyecto/BACKGAMMON/BACKGAMMON-VIVO/src/features/ranking/components/RankBadge.tsx

import React from 'react';
import { 
  Shield, Circle, Book, Crown, Star, 
  Swords, Target, Trophy, Gem, Zap, 
  Flame, Sun, Skull, Frown, HelpCircle
} from 'lucide-react';
import { RANKS, FALLING_RANKS } from '../constants';

interface RankBadgeProps {
  rankId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showAnimation?: boolean;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ 
  rankId, 
  size = 'md', 
  className = '',
  showAnimation = false
}) => {
  // Find rank definition
  const rank = RANKS.find(r => r.id === rankId) || FALLING_RANKS.find(r => r.id === rankId);
  
  if (!rank) {
      return <HelpCircle className={`text-slate-300 ${className}`} />;
  }

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  };

  const animationClass = showAnimation && rankId === 'dios' ? 'animate-pulse' : '';
  const iconClass = `${sizeClasses[size]} ${rank.badgeColor} ${animationClass}`;

  return (
    <div className={`flex items-center justify-center rounded-full bg-slate-900/50 backdrop-blur-sm p-2 ${className}`} title={rank.name}>
      {renderRankIcon(rankId, { className: iconClass, strokeWidth: 1.5 })}
    </div>
  );
};

function renderRankIcon(rankId: string, props: React.SVGProps<SVGSVGElement>) {
  switch (rankId) {
    // Low Ranks
    case 'principiante': return <Shield {...props} />; // Gray Shield
    case 'novato': return <Circle {...props} />; // Bronze Circle
    case 'aprendiz': return <Shield {...props} />; // Bronze Shield
    case 'universitario': return <Book {...props} />; // Silver Book
    
    // Mid Ranks
    case 'perfeccionista': return <Gem {...props} />; // Silver Geo
    case 'competidor': return <Swords {...props} />; // Silver Swords
    case 'habilidoso': return <Star {...props} />; // Gold Star
    case 'estratega': return <Crown {...props} />; // Gold Chess (Crown as proxy)
    case 'tactico': return <Target {...props} />; // Gold Target
    
    // High Ranks
    case 'avanzado': return <Shield {...props} />; // Platinum Shield
    case 'experto': return <Crown {...props} />; // Platinum Crown
    case 'veterano': return <Shield {...props} />; // Weathered Medal (Shield proxy)
    
    // Elite Ranks
    case 'maestro': return <Gem {...props} />; // Diamond
    case 'gran_maestro': return <Trophy {...props} />; // Trophy
    case 'maestro_juego': return <Gem {...props} />; // Ruby
    case 'leyenda': return <Trophy {...props} />; // Gold Chalice
    
    // God Ranks
    case 'mitico': return <Star {...props} />; // Cosmic Orb
    case 'inmortal': return <Flame {...props} />; // Phoenix
    case 'imparable': return <Zap {...props} />; // Lightning
    case 'dios': return <Sun {...props} />; // God
    
    // Falling
    case 'maestro_caido': return <Skull {...props} />;
    case 'apuros': return <Frown {...props} />;
    case 'perdedor': return <Frown {...props} />;
    
    default: return <Shield {...props} />;
  }
}
