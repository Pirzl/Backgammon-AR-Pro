import React, { useEffect, useState } from 'react';
import { useClientData } from '../hooks/useClientData';
import { ClientPortal } from './ClientPortal';
import { useAuth } from '../../auth/useAuth';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Toast } from '../../../shared/ui/Toast';
import { UserMessagingPanel } from '../../messaging/ui/UserMessagingPanel';
import { useTheme } from '../../theme/ThemeProvider';
import { useGameSettings } from '../../admin/useGameSettings';
import { supabase } from '../../../shared/api/supabase';

export const UserDashboard: React.FC = () => {
    const { client, activeTournaments, activeGameHistory, allClients, leaveTournament, sendGameInvite, loading: clientLoading } = useClientData();
    const { tournamentRules } = useGameSettings();
    const { theme, setTheme } = useTheme();
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || undefined;

    // Detect if we have an Auth Hash in the URL (from email confirmation)
    const [isClearingHash, setIsClearingHash] = useState(() => 
        window.location.hash.includes('access_token') || 
        window.location.hash.includes('error_description')
    );
    
    // Initialize authError directly from the URL to avoid useEffect state updates
    const [authError, setAuthError] = useState<string | null>(() => {
        if (window.location.hash.includes('error_description')) {
            const params = new URLSearchParams(window.location.hash.substring(1));
            const errorDesc = params.get('error_description');
            return errorDesc ? errorDesc.replace(/\+/g, ' ') : null;
        }
        return null;
    });

    useEffect(() => {
        if (isClearingHash) {
            // Allow a brief moment for Supabase to fully process the session if needed,
            // then clean the URL to remove the ugly tokens.
            const timer = setTimeout(() => {
                window.history.replaceState(null, '', window.location.pathname);
                setIsClearingHash(false);
            }, 800); // Slightly increased buffer to ensure error is caught
            
            return () => clearTimeout(timer);
        }
    }, [isClearingHash]);

    const handleLogout = async () => {
        await signOut();
        navigate('/');
    };


    const handleJoin = (cid: string, tid: string) => console.log('Join:', cid, tid);
    const handleUpdateNotes = (id: string, note: string) => console.log('Note:', id, note);
    
    const handleUpdateProfile = async (id: string, f: string, l: string) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ first_name: f, last_name: l, username: f })
                .eq('id', id);
            
            if (error) {
                console.error('Error updating profile:', error);
                setAuthError('Error al actualizar el perfil.');
            }
        } catch (e) {
            console.error(e);
        }
    };
    
    const handleDeleteAccount = async () => {
        try {
            const { error } = await supabase.rpc('delete_own_account');
            if (error) throw error;
            
            await signOut();
            navigate('/');
        } catch (e) {
            console.error('Error deleting account:', e);
            setAuthError('Error al eliminar la cuenta. Por favor, contacta con soporte.');
        }
    };
    
    const handlePassChange = async (newPassword: string): Promise<boolean> => {
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                console.error('Error changing password:', error);
                return false;
            }
            return true;
        } catch (e) {
            console.error('Error changing password:', e);
            return false;
        }
    };


    if (clientLoading || isClearingHash) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900 text-cyan-400">
                <div className="flex flex-col items-center gap-4">
                     <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-400"></div>
                     {isClearingHash && <p className="animate-pulse text-sm text-cyan-400/80">Verificando sesión...</p>}
                </div>
                {authError && (
                    <div className="absolute top-10">
                         <Toast message={authError} type="error" onClose={() => setAuthError(null)} />
                    </div>
                )}
            </div>
        );
    }

    if (!client) return <div>Error al cargar el perfil.</div>;

    if (client.status === 'blocked') {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900 text-center px-4">
                <div className="bg-slate-800 border border-rose-500/50 p-8 rounded-2xl max-w-md w-full shadow-2xl">
                    <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h2 className="text-2xl font-bold text-rose-500 mb-2">Cuenta Suspendida</h2>
                    <p className="text-slate-300 mb-6">
                        Tu cuenta ha sido bloqueada por un administrador. No puedes acceder al sistema en este momento.
                    </p>
                    <button 
                        onClick={handleLogout}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition-all"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            {authError && <Toast message={authError} type="error" onClose={() => setAuthError(null)} />}
            
            <ClientPortal 
                initialTab={initialTab}
                client={client}
                activeTournaments={activeTournaments}
                activeGameHistory={activeGameHistory} // New prop
                allClients={allClients}               // New prop
                tournamentRules={tournamentRules || "Se aplican las reglas estándar del Backgammon."}
                onLogout={handleLogout}
                onLeaveTournament={leaveTournament}   // New prop
                sendGameInvite={sendGameInvite}       // New prop

                onJoinTournament={handleJoin}
                onUpdateNotes={handleUpdateNotes}
                currentTheme={theme}
                onUpdateTheme={setTheme}
                onUpdateProfile={handleUpdateProfile}
                onDeleteAccount={handleDeleteAccount}
                onPasswordChange={handlePassChange}

            />
            
            <UserMessagingPanel userId={client.id} />
        </>
    );
};
