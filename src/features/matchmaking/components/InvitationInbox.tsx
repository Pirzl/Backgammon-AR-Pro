import React, { useEffect, useState } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { useNavigate } from 'react-router-dom';
import { Mail, Check, X, Gamepad2 } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';

interface Invitation {
    id: string;
    sender: { username: string; avatar_url: string };
    room_id: string;
    created_at: string;
}

interface InvitationRecord {
    id: string;
    sender_id: string;
    receiver_id: string;
    status: string;
    room_id: string;
    created_at: string;
    updated_at: string;
}

export const InvitationInbox: React.FC = () => {
    const [invites, setInvites] = useState<Invitation[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── Pre-fetch initial invites ──
    const fetchInitialInvites = React.useCallback(async (userId: string) => {
        const { data } = await supabase
            .from('invitations')
            .select(`
                id, 
                room_id, 
                created_at,
                sender:sender_id (username, avatar_url)
            `)
            .eq('receiver_id', userId)
            .eq('status', 'pending');

        if (data) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            return (data as unknown as Invitation[]).filter(i => i.created_at > oneHourAgo);
        }
        return [];
    }, []);

    useEffect(() => {
        if (!user?.id) return;
        
        let isMounted = true;

        // Fetch initial invites
        fetchInitialInvites(user.id).then(data => {
            if (isMounted) {
                // Wrap in setTimeout to avoid React 19 cascading render warnings
                setTimeout(() => {
                    setInvites(data);
                }, 0);
            }
        });

        // Subscribe to ANY change in invitations table for this user
        const channel = supabase
            .channel(`invitation_inbox:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*', 
                    schema: 'public',
                    table: 'invitations'
                },
                async (payload) => {
                    // Refresh our inbox on ANY change (Insert, Update, Delete)
                    const data = await fetchInitialInvites(user.id);
                    if (isMounted) setInvites(data);
                    
                    // If a NEW pending invite was inserted for ME, auto-open the inbox
                    const newRec = payload.new as InvitationRecord;
                    if (payload.eventType === 'INSERT' && newRec?.receiver_id === user.id && newRec?.status === 'pending') {
                        console.log('[InvitationInbox] New incoming invite detected!');
                        setIsOpen(true);
                    }

                    // If my outgoing invitation was accepted, redirect me to the game
                    if (payload.eventType === 'UPDATE' && newRec?.sender_id === user.id && newRec?.status === 'accepted') {
                        console.log('[InvitationInbox] Outgoing invite accepted. Redirecting sender...');
                        navigate(`/game?room=${newRec.room_id}&mode=human`);
                    }
                }
            )
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [user?.id, navigate, fetchInitialInvites]);

    const handleAccept = async (invite: Invitation) => {
        setIsOpen(false);
        setInvites(prev => prev.filter(i => i.id !== invite.id));

        const { error } = await supabase
            .from('invitations')
            .update({ status: 'accepted' })
            .eq('id', invite.id);

        if (error) {
            console.error('Error accepting invite:', error);
            alert('Error al aceptar invitación: ' + error.message);
            return;
        }

        // Navigate to Game Room with human mode
        navigate(`/game?room=${invite.room_id}&mode=human`);
    };

    const handleReject = async (id: string) => {
        await supabase
            .from('invitations')
            .update({ status: 'rejected' })
            .eq('id', id);
        
        setInvites(prev => prev.filter(i => i.id !== id));
    };

    if (invites.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-28 z-[9990]">
            {isOpen ? (
                <div className="bg-panel border border-border shadow-2xl rounded-xl w-80 overflow-hidden animate-in slide-in-from-bottom-5">
                    <div className="p-4 bg-primary/10 border-b border-border flex justify-between items-center">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <Gamepad2 size={18} className="text-primary" />
                            Invitaciones ({invites.length})
                        </h3>
                        <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {invites.map(invite => (
                            <div key={invite.id} className="p-4 border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                        {invite.sender?.avatar_url ? (
                                            <img src={invite.sender.avatar_url} alt="Sender" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="w-full h-full flex items-center justify-center text-xs font-bold bg-slate-200 text-slate-500">
                                                {invite.sender?.username?.[0] || 'U'}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">
                                            {invite.sender?.username || 'Usuario'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Te invitó a jugar
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleAccept(invite)}
                                        className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
                                    >
                                        <Check size={16} /> Aceptar
                                    </button>
                                    <button 
                                        onClick={() => handleReject(invite.id)}
                                        className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm font-medium hover:bg-muted/80 flex items-center justify-center gap-2"
                                    >
                                        <X size={16} /> Rechazar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <button 
                    onClick={() => setIsOpen(true)}
                    className="bg-primary text-primary-foreground p-3 rounded-full shadow-lg hover:bg-primary/90 transition-transform hover:scale-105 relative"
                >
                    <Mail size={24} />
                    <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full border-2 border-background animate-bounce">
                        {invites.length}
                    </span>
                </button>
            )}
        </div>
    );
};
