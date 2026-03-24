import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendDirection?: 'up' | 'down';
  isLoading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({ title, value, icon, trend, trendDirection, isLoading }) => {
  return (
    <div className="bg-panel p-6 rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {isLoading ? (
             <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1"></div>
          ) : (
             <h3 className="text-2xl font-bold text-foreground mt-1">{value}</h3>
          )}
        </div>
        <div className="p-3 rounded-lg bg-muted">
          {icon}
        </div>
      </div>
      
      {trend && (
        <div className={`flex items-center text-xs font-medium ${trendDirection === 'up' ? 'text-emerald-600' : 'text-rose-600'}`}>
          {trendDirection === 'up' ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
          {trend}
        </div>
      )}
    </div>
  );
};
