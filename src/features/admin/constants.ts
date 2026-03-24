export const TOURNAMENT_FORMAT_DETAILS = {
  'Single Elimination': 'Players are eliminated after one loss.',
  'Swiss System': 'Non-elimination format with fixed number of rounds.',
  'Round Robin': 'Every player plays every other player once.',
  'League': 'Season-based format with cumulative points.',
  'Best-of Series': 'Matches consist of multiple games.'
};

export const STORAGE_TABLE_DESCRIPTIONS: Record<string, string> = {
  'zobrist_evaluations': 'Stores evaluation hashes for board states used by AI analysis.',
  'game_logs': 'Historical record of all moves and game outcomes.',
  'clients': 'User profile data and authentication references.',
  'tournaments': 'Configuration and state for all tournaments.',
  'game_state': 'Real-time state of active games.',
  'messages': 'User and system communication logs.',
  'wallets': 'Financial transaction records and balances.',
  'kyc_documents': 'Uploaded identity verification files.',
  'user_avatars': 'Profile images uploaded by users.',
  // Aliases
  'profiles': 'User profile data and authentication references.',
  'app_settings': 'Global application configuration.',
  'notifications': 'Real-time notifications sent to users.',
  'participations': 'Records of users joining tournaments.'
};
