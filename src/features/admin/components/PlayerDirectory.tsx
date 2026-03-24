import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ClientList } from './ClientList';
import { ClientDetails } from './ClientDetails';
import { useClients } from '../hooks/useClients';
import { supabase } from '../../../shared/api/supabase';

export const PlayerDirectory: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { clients, loading } = useClients();
    const [adminId, setAdminId] = useState<string>('');

    useEffect(() => {
        supabase.auth.getUser().then(r => {
            if (r.data.user?.id) {
                setAdminId(r.data.user.id);
            }
        });
    }, []);

    const handleInviteUser = async (userId: string) => {
        try {
            const roomId = `match_${Date.now()}`;
            
            const { error } = await supabase
                .from('invitations')
                .insert({
                    sender_id: adminId,
                    receiver_id: userId,
                    status: 'pending',
                    room_id: roomId
                });
            
            if (error) throw error;
            
            navigate(`/game?room=${roomId}&mode=human`);
            
        } catch (err) {
            console.error('Error sending invite:', err);
            alert('Failed to send invitation');
        }
    };
    
    // Check if a client is selected via URL param
    const selectedClientId = searchParams.get('id');

    const handleSelectClient = (id: string) => {
        setSearchParams({ id });
    };

    const handleBack = () => {
        setSearchParams({});
    };

    // Render Details View (Activity, KYC, etc.)
    if (selectedClientId) {
        return (
            <ClientDetails 
                clientId={selectedClientId} 
                onBack={handleBack} 
            />
        );
    }

    // Render Directory List
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Player Directory</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage skill ratings, KYC status, and activity.</p>
                </div>
            </div>
            
            {loading ? (
                <div className="p-12 text-center text-slate-500">Loading directory...</div>
            ) : (
                <ClientList 
                    clients={clients} 
                    onSelectClient={handleSelectClient} 
                    onInviteClient={handleInviteUser}
                />
            )}
        </div>
    );
};
