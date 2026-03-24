import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/api/supabase';
import type { ClientData, Tournament, TournamentFormat, TournamentStatus, InviteStrategy, GameLog } from '../../../entities/tournament/types';
import { useAuth } from '../../../features/auth/useAuth';
import { sendTournamentJoinMessage, sendTournamentLeaveMessage } from '../../../shared/utils/messageHelpers';

export const useClientData = () => {
    const { user } = useAuth();
    const [client, setClient] = useState<ClientData | null>(null);
    const [activeTournaments, setActiveTournaments] = useState<Tournament[]>([]);
    const [activeGameHistory, setActiveGameHistory] = useState<GameLog[]>([]);
    const [allClients, setAllClients] = useState<ClientData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Memoize the base check for user existence to stabilize dependencies
    const userId = user?.id;
    const userEmail = user?.email;

    const fetchData = React.useCallback(async () => {
        if (!userId) return;
        
        try {
            setLoading(true);
            // 1. Fetch Profile
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*, wallets!user_id(saldo_actual)')
                .eq('id', userId)
                .single();

            if (profileError) throw profileError;

            // 2. Fetch Notifications (System Messages)
            const { data: messages, error: messagesError } = await supabase
                .from('notifications')
                .select('*')
                .eq('client_id', userId)
                .order('created_at', { ascending: false });

            if (messagesError) console.error('Error fetching notifications:', messagesError);

            // 3. Fetch Active Tournaments with participants (using user_id)
            const { data: tournaments, error: tourneyError } = await supabase
                .from('tournaments')
                .select(`
                    *,
                    tournament_participants(user_id)
                `)
                .neq('status', 'Completed')
                .neq('status', 'Cancelled')
                .order('start_date', { ascending: true });

            if (tourneyError) throw tourneyError;

            // Process tournaments with participant lists
            interface RawTournament {
                id: string;
                name: string;
                format: TournamentFormat;
                status: TournamentStatus;
                start_date: string;
                buy_in: number;
                prize_pool: number;
                max_players: number;
                current_players: number;
                series_length: number;
                invite_strategy: string; // Keep as string for now if it comes raw, or cast to InviteStrategy
                created_at: string;
                tournament_participants: Array<{ user_id: string }>;
            }

            const tournamentsData = tournaments as unknown as RawTournament[];

            const tournamentsWithParticipants = tournamentsData?.map((t) => ({
                id: t.id,
                name: t.name,
                format: t.format,
                status: t.status,
                startDate: t.start_date,
                buyIn: t.buy_in,
                prizePool: t.prize_pool,
                maxPlayers: t.max_players,
                currentPlayers: t.current_players,
                seriesLength: t.series_length,
                inviteStrategy: t.invite_strategy as InviteStrategy,
                createdAt: t.created_at,
                participants: t.tournament_participants?.map((p) => p.user_id) || []
            })) || [];

            // 5. Fetch Game History
            // 5. Fetch Game History (2-step to avoid join issues)
            const { data: gamesRaw, error: gamesError } = await supabase
                .from('game_logs')
                .select('*')
                .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
                .order('played_at', { ascending: false });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let games: any[] = [];
            if (gamesRaw) {
                 // Collect unique player IDs
                 const playerIds = Array.from(new Set(gamesRaw.flatMap(g => [g.white_player_id, g.black_player_id]).filter(Boolean)));
                 
                 // Fetch profiles
                 const { data: profiles } = await supabase
                     .from('profiles')
                     .select('*')
                     .in('id', playerIds);

                 if (profiles) {
                     const profileMap = new Map(profiles.map(p => [p.id, p]));
                     games = gamesRaw.map(g => ({
                         ...g,
                         white_player: profileMap.get(g.white_player_id),
                         black_player: profileMap.get(g.black_player_id)
                     }));
                 } else {
                     games = gamesRaw;
                 }
            }

            if (gamesError) console.error('Error fetching game history:', gamesError);

            // 6. Fetch All Clients (for Directory)
            // Limit to avoid massive payload if many users
            const { data: profilesList, error: profilesError } = await supabase
                .from('profiles')
                .select('*, wallets!user_id(saldo_actual)')
                .order('updated_at', { ascending: false })
                .limit(100);

            if (profilesError) console.error('Error fetching all clients:', profilesError);

            // 4. Construct Client Data
            const clientData: ClientData = {
                id: profile.id,
                firstName: profile.first_name || profile.username || 'Player',
                lastName: profile.last_name || '',
                email: profile.email || userEmail || '',
                avatar: profile.avatar_url || 'https://ui-avatars.com/api/?name=User&background=random',
                status: 'active',
                joinedDate: profile.updated_at || new Date().toISOString(),
                role: profile.role || 'user',
                kycStatus: profile.kyc_status || 'none',
                skillRating: profile.skill_rating || 0,
                walletBalance: (Array.isArray(profile.wallets) ? profile.wallets[0]?.saldo_actual : profile.wallets?.saldo_actual) ?? profile.wallet_balance ?? 500,
                stats: {
                    tournamentsPlayed: profile.tournaments_played || 0,
                    tournamentsWon: profile.tournaments_won || 0,
                    totalEntryFees: profile.total_entry_fees || 0,
                    totalPrizeMoney: profile.total_prizes || 0,
                    netResults: (profile.total_prizes || 0) - (profile.total_entry_fees || 0)
                },
                messages: messages?.map(m => ({
                    id: m.id,
                    sender: m.sender,
                    content: m.content,
                    timestamp: m.created_at,
                    read: m.read,
                    type: m.type,
                    relatedTournamentId: m.related_tournament_id
                })) || [],
                history: []
            };

            setClient(clientData);
            setActiveTournaments(tournamentsWithParticipants);
            setActiveGameHistory(games as GameLog[] || []);
            // Quick map for allClients - simplified for directory needed fields
            const mappedClients = profilesList?.map(p => ({
                id: p.id,
                firstName: p.first_name || p.username || 'Player',
                lastName: p.last_name || '',
                email: p.email || '',
                avatar: p.avatar_url,
                role: p.role || 'user',
                walletBalance: (Array.isArray(p.wallets) ? p.wallets[0]?.saldo_actual : p.wallets?.saldo_actual) ?? p.wallet_balance ?? 0,
                stats: {
                    totalPrizeMoney: p.total_prizes || 0,
                    tournamentsPlayed: p.tournaments_played || 0,
                    tournamentsWon: p.tournaments_won || 0,
                    totalEntryFees: p.total_entry_fees || 0,
                    netResults: 0
                }
            } as ClientData)) || [];
            setAllClients(mappedClients);

        } catch (err: unknown) {
            console.error('Error fetching client data:', err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    }, [userId, userEmail]); // Stable dependency

    useEffect(() => {
        fetchData();
        
        if (!userId) return;

        // Subscribirse a cambios en perfiles (Presencia, Rankings, Stats)
        const profilesChannel = supabase
            .channel('public-profiles-changes')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles' },
                (payload) => {
                    // Si es MI perfil, actualizar el objeto client
                    if (payload.new.id === userId) {
                        setClient(prev => prev ? {
                            ...prev,
                            firstName: payload.new.first_name || payload.new.username || prev.firstName,
                            lastName: payload.new.last_name || prev.lastName,
                            walletBalance: typeof payload.new.wallet_balance === 'number' ? payload.new.wallet_balance : prev.walletBalance,
                            skillRating: payload.new.skill_rating ?? prev.skillRating,
                            stats: {
                                ...prev.stats,
                                totalPrizeMoney: payload.new.total_prizes ?? prev.stats.totalPrizeMoney,
                                tournamentsPlayed: payload.new.tournaments_played ?? prev.stats.tournamentsPlayed,
                                tournamentsWon: payload.new.tournaments_won ?? prev.stats.tournamentsWon,
                            }
                        } : null);
                    }

                    // Actualizar en la lista de todos los clientes (Rankings/Directorio)
                    setAllClients(prev => prev.map(c => {
                        if (c.id === payload.new.id) {
                            return {
                                ...c,
                                firstName: payload.new.first_name || payload.new.username || c.firstName,
                                lastName: payload.new.last_name || c.lastName,
                                walletBalance: typeof payload.new.wallet_balance === 'number' ? payload.new.wallet_balance : c.walletBalance,
                                skillRating: payload.new.skill_rating ?? c.skillRating,
                            };
                        }
                        return c;
                    }));
                }
            )
            .subscribe();

        // Subscribirse a wallets para asegurar sincronización inmediata si el trigger tarda
        const walletChannel = supabase
            .channel('user-wallet-sync')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` },
                () => {
                    // Solo refrescar mi propia data si mi billetera cambia
                    fetchData(); 
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(profilesChannel);
            supabase.removeChannel(walletChannel);
        };
    }, [fetchData, userId]);

    const joinTournament = async (tournamentId: string) => {
        if (!user || !client) return;

        try {
            // 1. Insert into junction table
            const { error: joinError } = await supabase
                .from('tournament_participants')
                .insert({ tournament_id: tournamentId, user_id: user.id });

            if (joinError) throw joinError;

            // 2. Find tournament details
            const tournament = activeTournaments.find(t => t.id === tournamentId);
            if (!tournament) throw new Error('Tournament not found');

            // 3. Update client stats if paid tournament
            if (tournament.buyIn > 0) {
                const { error: statsError } = await supabase
                    .from('profiles')
                    .update({
                        total_entry_fees: (client.stats.totalEntryFees || 0) + tournament.buyIn,
                        tournaments_played: (client.stats.tournamentsPlayed || 0) + 1
                    })
                    .eq('id', user.id);

                if (statsError) console.error('Error updating stats:', statsError);
            } else {
                // Free tournament - just increment played count
                await supabase
                    .from('profiles')
                    .update({ tournaments_played: (client.stats.tournamentsPlayed || 0) + 1 })
                    .eq('id', user.id);
            }

            // 4. Send confirmation message
            await sendTournamentJoinMessage(user.id, tournamentId, tournament.name, tournament.buyIn);

            // 5. Refresh data
            await fetchData();
        } catch (err) {
            console.error('Error joining tournament:', err);
            throw err;
        }
    };

    const leaveTournament = async (tournamentId: string) => {
        if (!user || !client) return;

        try {
            // 1. Find tournament details before leaving
            const tournament = activeTournaments.find(t => t.id === tournamentId);
            if (!tournament) throw new Error('Tournament not found');

            // 2. Delete from junction table (trigger will auto-decrement current_players)
            const { error } = await supabase
                .from('tournament_participants')
                .delete()
                .match({ tournament_id: tournamentId, user_id: user.id });

            if (error) throw error;

            // 3. Refund entry fee if paid tournament
            if (tournament.buyIn > 0) {
                await supabase
                    .from('profiles')
                    .update({
                        total_entry_fees: Math.max(0, (client.stats.totalEntryFees || 0) - tournament.buyIn)
                    })
                    .eq('id', user.id);
            }

            // 4. Send confirmation message
            await sendTournamentLeaveMessage(user.id, tournamentId, tournament.name);

            // 5. Refresh data
            await fetchData();
        } catch (err) {
            console.error('Error leaving tournament:', err);
            throw err;
        }
    };

    const unreadCount = client?.messages?.filter(m => !m.read && m.sender !== 'user').length || 0;

    const sendGameInvite = async (recipientId: string, recipientName: string) => {
        if (!user || !client) return false;

        // Validar saldo del remitente (yo)
        if ((client.walletBalance || 0) < 100) {
            throw new Error("No tienes suficientes puntos para enviar una invitación (Mínimo: 100).");
        }

        // Validar saldo del destinatario
        const recipient = allClients.find(c => c.id === recipientId);
        if (recipient && (recipient.walletBalance || 0) < 100) {
            throw new Error(`No puedes invitar a ${recipientName} porque no tiene los puntos mínimos (100) para jugar.`);
        }

        try {
            console.log(`Sending invite to ${recipientName} (${recipientId})`);
            
            // Generate a room ID unique to this match
            const roomId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            // 1. Insert into invitations table
            const { error: inviteError } = await supabase
                .from('invitations')
                .insert({
                    sender_id: user.id, // Current user is sender
                    receiver_id: recipientId,
                    status: 'pending',
                    room_id: roomId
                });

            if (inviteError) throw inviteError;

            // 2. Insert into notifications table for the toast alert
            await supabase.from('notifications').insert({
                client_id: recipientId,
                sender: 'system',
                content: JSON.stringify({
                    message: `${client.firstName} te ha invitado a una partida.`,
                    senderId: user.id,
                    senderName: client.firstName,
                    roomId: roomId
                }),
                type: 'invite',
                read: false
            });
            return true;
        } catch (err) {
            console.error('Error sending invite:', err);
            throw err;
        }
    };

    return { client, activeTournaments, activeGameHistory, allClients, loading, error, joinTournament, leaveTournament, unreadCount, refetch: fetchData, sendGameInvite };
};
