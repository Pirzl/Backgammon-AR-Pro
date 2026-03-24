import React, { useState, useRef, useEffect } from 'react';
import { Calendar, Users, Trophy, X, Filter, ChevronDown } from 'lucide-react';
import type { ParticipationFilters } from '../hooks/useMatchParticipation';

interface PlayerOption {
  id: string;
  name: string;
  email?: string;
}

interface GraphFiltersProps {
  filters: ParticipationFilters;
  onFiltersChange: (filters: ParticipationFilters) => void;
  tournaments?: Array<{ id: string; name: string }>;
  players?: PlayerOption[];
}

/**
 * Graph Configuration Panel
 * Provides filtering options for the participation graph
 */
export const GraphFilters: React.FC<GraphFiltersProps> = ({
  filters,
  onFiltersChange,
  tournaments = [],
  players = []
}) => {
  // Player search state
  const [playerSearch, setPlayerSearch] = useState('');
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const playerDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(event.target as Node)) {
        setShowPlayerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick date presets
  const setDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days + 1);
    onFiltersChange({ ...filters, startDate: start, endDate: end });
  };

  // Format date for input
  const formatDateForInput = (date?: Date): string => {
    if (!date) return '';
    return date.toISOString().split('T')[0] ?? '';
  };

  // Parse date from input
  const parseDateFromInput = (value: string): Date | undefined => {
    if (!value) return undefined;
    return new Date(value);
  };

  // Filter players based on search term (name, email, or ID)
  const filteredPlayers = players.filter(p => {
    const term = playerSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(term) ||
      (p.email && p.email.toLowerCase().includes(term)) ||
      p.id.toLowerCase().includes(term)
    );
  });

  // Get selected player display name
  const selectedPlayerName = filters.playerId 
    ? (filters.playerId === 'anonymous' 
        ? 'Anonymous Players' 
        : players.find(p => p.id === filters.playerId)?.name || 'Unknown')
    : 'All Players';

  // Handle player selection
  const handleSelectPlayer = (playerId: string | undefined) => {
    onFiltersChange({ ...filters, playerId });
    setShowPlayerDropdown(false);
    setPlayerSearch('');
  };

  return (
    <div className="space-y-4">
      {/* Quick Date Presets */}
      <div>
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
          Quick Select
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { label: '7 Days', days: 7 },
            { label: '14 Days', days: 14 },
            { label: '30 Days', days: 30 }
          ].map(preset => (
            <button
              key={preset.days}
              onClick={() => setDatePreset(preset.days)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-700 
                text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 
                transition-all duration-300 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Calendar size={12} /> From
          </label>
          <input
            type="date"
            value={formatDateForInput(filters.startDate)}
            onChange={e => onFiltersChange({ 
              ...filters, 
              startDate: parseDateFromInput(e.target.value) 
            })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 
              bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
              transition-all duration-300 cursor-pointer"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
            <Calendar size={12} /> To
          </label>
          <input
            type="date"
            value={formatDateForInput(filters.endDate)}
            onChange={e => onFiltersChange({ 
              ...filters, 
              endDate: parseDateFromInput(e.target.value) 
            })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 
              bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
              transition-all duration-300 cursor-pointer"
          />
        </div>
      </div>

      {/* Tournament Filter */}
      <div>
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
          <Trophy size={12} /> Tournament
        </label>
        <select
          value={filters.tournamentId || ''}
          onChange={e => onFiltersChange({ 
            ...filters, 
            tournamentId: e.target.value || undefined 
          })}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 
            bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white
            focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary
            transition-all duration-300 cursor-pointer"
        >
          <option value="">All Tournaments</option>
          {tournaments.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Player Filter - Searchable Dropdown */}
      <div ref={playerDropdownRef} className="relative">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
          <Users size={12} /> Player
        </label>
        
        {/* Selected value / search input */}
        <div 
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 
            bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white
            focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary
            transition-all duration-300 cursor-pointer flex items-center gap-2"
          onClick={() => setShowPlayerDropdown(!showPlayerDropdown)}
        >
          {showPlayerDropdown ? (
            <input
              type="text"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              placeholder="Search by name, email, or ID..."
              className="flex-1 bg-transparent outline-none text-sm"
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1">{selectedPlayerName}</span>
          )}
          
          {filters.playerId ? (
            <button 
              onClick={(e) => { e.stopPropagation(); handleSelectPlayer(undefined); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          ) : (
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showPlayerDropdown ? 'rotate-180' : ''}`} />
          )}
        </div>

        {/* Dropdown list */}
        {showPlayerDropdown && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600 shadow-lg max-h-48 overflow-y-auto">
            {/* All Players option */}
            <button
              onClick={() => handleSelectPlayer(undefined)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 
                transition-colors cursor-pointer flex items-center gap-2"
            >
              <Users size={14} className="text-slate-400" />
              All Players
            </button>

            {/* Anonymous option */}
            <button
              onClick={() => handleSelectPlayer('anonymous')}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 
                transition-colors cursor-pointer flex items-center gap-2 border-t border-slate-100 dark:border-slate-700"
            >
              <Users size={14} className="text-amber-500" />
              Anonymous Players
            </button>

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-slate-600 my-1" />

            {/* Filtered players */}
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectPlayer(p.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 
                    transition-colors cursor-pointer"
                >
                  <div className="font-medium text-slate-900 dark:text-white">{p.name}</div>
                  {p.email && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{p.email}</div>
                  )}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-slate-500 text-center">
                {playerSearch ? 'No players found' : 'No registered players'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Clear Filters */}
      <button
        onClick={() => onFiltersChange({})}
        className="w-full py-2 text-sm font-medium text-slate-500 dark:text-slate-400 
          hover:text-slate-700 dark:hover:text-slate-200 
          border border-dashed border-slate-300 dark:border-slate-600 rounded-lg
          hover:border-slate-400 dark:hover:border-slate-500
          transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
      >
        <Filter size={14} />
        Clear All Filters
      </button>
    </div>
  );
};
