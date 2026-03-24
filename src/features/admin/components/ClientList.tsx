import React, { useState } from 'react';
import { Search, Filter, Eye } from 'lucide-react';
import type { ClientData } from '../../../entities/tournament/types';

interface ClientListProps {
  clients: ClientData[];
  onSelectClient: (id: string) => void;
  onInviteClient?: (id: string) => void;
}

export const ClientList: React.FC<ClientListProps> = ({ clients, onSelectClient, onInviteClient }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'active' | 'blocked' | 'paused'>('all');

  const filteredClients = clients.filter(client => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      client.firstName.toLowerCase().includes(term) ||
      client.lastName.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term) ||
      client.id.toLowerCase().includes(term) ||
      (client.phone || '').includes(term);
    
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'online' && (client.status === 'online' || client.status === 'in-game')) ||
                          (filterStatus === 'offline' && (client.status === 'offline')) ||
                          client.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'active': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'blocked': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
      case 'paused': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'online': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 animate-pulse';
      case 'in-game': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'offline': return 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="bg-panel rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Header & Controls */}
      <div className="p-5 border-b border-border flex flex-col sm:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-bold text-foreground">Player Directory</h2>
        
        <div className="flex w-full sm:w-auto gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name, ID, phone..." 
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground placeholder:text-muted-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="relative">
            <select 
              className="appearance-none bg-muted border border-border text-foreground py-2 pl-4 pr-10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'online' | 'offline' | 'active' | 'blocked' | 'paused')}
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="blocked">Blocked</option>
            </select>
            <Filter className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <th className="p-4">User</th>
              <th className="p-4">Contact</th>
              <th className="p-4 text-right">Points</th>
              <th className="p-4 text-right">Tournaments</th>
              <th className="p-4 text-right">Entry Fees</th>
              <th className="p-4 text-center">Status</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredClients.map(client => (
              <tr key={client.id} className="hover:bg-muted/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-foreground">{client.firstName} {client.lastName}</p>
                      <p className="text-xs text-muted-foreground">ID: {client.id}</p>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <div className="text-sm">
                    <p className="text-foreground">{client.email}</p>
                    <p className="text-muted-foreground">{client.phone}</p>
                  </div>
                </td>
                <td className="p-4 text-right">
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                    {(client.walletBalance ?? 500).toLocaleString()} pts
                  </span>
                </td>
                <td className="p-4 text-right">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{client.stats.tournamentsPlayed}</span>
                </td>
                <td className="p-4 text-right">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    ${client.stats.totalEntryFees.toLocaleString()}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${getStatusBadge(client.status)}`}>
                    {client.status}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {/* Invite Button - Only for Online users */}
                    {(client.status === 'online' || client.status === 'active') && (
                       <button
                         onClick={(e) => {
                             e.stopPropagation();
                             if (onInviteClient) onInviteClient(client.id);
                         }}
                         className="p-2 text-cyan-500 hover:bg-cyan-500/10 rounded-lg transition-all"
                         title="Invite to Game"
                       >
                         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-swords"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/></svg>
                       </button>
                    )}
                    <button 
                        onClick={() => onSelectClient(client.id)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 dark:hover:bg-primary/20 rounded-lg transition-all"
                        title="View Details"
                    >
                        <Eye size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {filteredClients.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-slate-500 dark:text-slate-400 text-lg">No clients found matching your search.</p>
        </div>
      )}
    </div>
  );
};
