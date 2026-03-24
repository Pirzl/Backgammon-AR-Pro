export type TournamentFormat = 'Single Elimination' | 'Swiss System' | 'Round Robin' | 'League' | 'Best-of Series';
export type TournamentStatus = 'Open' | 'In Progress' | 'Completed' | 'Cancelled' | 'Archived';
export type InviteStrategy = 'none' | 'all' | 'specific';
export type UserRole = 'user' | 'admin' | 'moderator';

export interface RankingMetadata {
  winsIn30: number;
  totalGamesEvaluated: number;
  nextTierProgress?: {
    winsNeeded: number;
    windowSize: number;
    currentWinsInWindow: number;
    targetRankName: string;
  };
}


export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  startDate: string; // ISO string from DB timestamptz
  buyIn: number;
  prizePool: number;
  maxPlayers: number;
  currentPlayers: number;
  participants?: string[]; // Array of Client IDs
  seriesLength?: number;
  inviteStrategy: InviteStrategy;
  createdAt: string;
}

export interface ClientData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar: string; // URL or placeholder
  phone?: string;
  last_seen?: string;

  // Extended status for Presence
  status: 'active' | 'blocked' | 'paused' | 'online' | 'offline' | 'in-game'; 
  joinedDate: string;
  role: UserRole;
  kycStatus: 'verified' | 'pending' | 'rejected' | 'none';
  skillRating: number;
  walletBalance: number;
  internalNotes?: string;
  stats: {
    tournamentsPlayed: number;
    tournamentsWon: number;
    totalEntryFees: number;
    totalPrizeMoney: number;
    netResults: number;
  };
  messages?: Message[];
  history?: TournamentHistory[];
  clientNotes?: string;
  rankCurrent?: string;
  rankHighest?: string;
  currentStreak?: number;
  rankingMetadata?: RankingMetadata;
}

export interface Message {
  id: string;
  sender: 'user' | 'admin' | 'system';
  content: string;
  timestamp: string;
  read: boolean;
  type?: 'text' | 'legal_notice' | 'tournament_alert' | 'invite';
  relatedTournamentId?: string;
}

export interface TournamentHistory {
  tournamentId: string;
  tournamentName: string;
  date: string;
  result: string;
  prize: number;
}

export interface AdminStats {
  activeUsersCount: number;
  totalUsers: number;
  totalEntryFeesCollected: number;
  totalPrizesDistributed: number;
  tournamentsCompleted: number;
}

export interface GameSetting {
  id: string;
  name: string;
  isActive: boolean;
}

export interface PaymentConfig {
  providerName: string;
  apiKey: string;
  apiSecret: string;
  isActive: boolean;
  mode: 'test' | 'live';
  webhookUrl: string;
}

export interface LegalConfig {
  termsVersion: string;
  privacyVersion: string;
  requireKycForWithdrawal: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  maintenanceMode: boolean;
  externalAdminUrl: string;
  paymentConfig: PaymentConfig;
  games: GameSetting[];
  legalConfig: LegalConfig;
  tournamentRules: string;
}
export interface TournamentRules {
  id: string;
  name: string;
  description: string;
}

export interface GameLog {
  id: string;
  played_at: string;
  winner?: string;
  winner_color?: string;
  white_player_id?: string;
  black_player_id?: string;
  score_delta?: number;
  [key: string]: unknown;
}

export interface Transaction {
  tx_id: string | number;
  tipo: 'win' | 'loss' | 'bonus' | 'deposit' | 'withdrawal' | string;
  descripcion: string;
  timestamp: string;
  amount?: number;
  points_ganados?: number;
  points_perdidos?: number;
  saldo_nuevo?: number;
  saldo_despues?: number;
}
