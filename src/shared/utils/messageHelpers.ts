import { supabase } from '../api/supabase';

/**
 * Send a system message when a user joins a tournament
 */
export async function sendTournamentJoinMessage(
  clientId: string,
  tournamentId: string,
  tournamentName: string,
  buyIn: number
): Promise<void> {
  const content = buyIn > 0
    ? `Registration confirmed for ${tournamentName}. Entry fee of $${buyIn} has been deducted from your wallet.`
    : `Registration confirmed for ${tournamentName} (Free Event). Good luck!`;

  const { error } = await supabase.from('notifications').insert({
    client_id: clientId,
    sender: 'system',
    content,
    type: 'tournament_alert',
    related_tournament_id: tournamentId,
    read: false
  });

  if (error) {
    console.error('Error sending join message:', error);
    throw error;
  }
}

/**
 * Send a system message when a user leaves a tournament
 */
export async function sendTournamentLeaveMessage(
  clientId: string,
  tournamentId: string,
  tournamentName: string
): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    client_id: clientId,
    sender: 'system',
    content: `You have successfully withdrawn from ${tournamentName}. Any entry fees paid have been refunded to your wallet.`,
    type: 'tournament_alert',
    related_tournament_id: tournamentId,
    read: false
  });

  if (error) {
    console.error('Error sending leave message:', error);
    throw error;
  }
}

/**
 * Send a tournament invitation message
 */
export async function sendTournamentInvite(
  clientId: string,
  tournamentId: string,
  tournamentName: string,
  invitedBy: string | null
): Promise<void> {
  const content = `You've been invited to join ${tournamentName} by ${invitedBy || 'a friend'}!`;

  const { error } = await supabase.from('notifications').insert({
    client_id: clientId,
    sender: 'system',
    content,
    type: 'tournament_alert',
    related_tournament_id: tournamentId,
    read: false
  });

  if (error) {
    console.error('Error sending invite message:', error);
    throw error;
  }
}
