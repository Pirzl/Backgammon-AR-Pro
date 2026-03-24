import { useOptimistic, useEffect, useState, useTransition, useRef, useCallback } from 'react';
import { Cpu, RotateCcw, AlertTriangle, Trophy, PanelLeftClose } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// Feature & Shared Imports
import { useGameState } from '../lib/useGameState';
import { useInteraction } from '../lib/useInteraction';
import { useAIWorker } from '../lib/useAIWorker';
import { generateGameSummary, getGrandmasterMove, generateGeminiTaunt, logGameResult, generatePedagogicalCommentary, generatePedagogicalHint } from '../ai-service';
import { useInactivityLogout } from '../../auth/useInactivityLogout';
import { useAuth } from '../../auth/useAuth';
import { useHandInteraction } from '../../hand-tracking/lib/useHandInteraction';
import { MediaPipeProvider } from '../../hand-tracking/lib/MediaPipeProvider';
import { useBoardDimensions } from '../lib/useBoardDimensions';
import { generateBoardSummary } from '../lib/useAICommentary'; // NEW: Spinal Cord AI Context
import { Board } from './Board';
import { GameSidebar } from './GameSidebar';
import { DoublingCubeModal } from './DoublingCubeModal';
import { PlayerBettingIndicator } from './PlayerBettingIndicator';
import { BettingStatusBar } from './BettingStatusBar';
import { CubeHistory } from './CubeHistory';
import { BettingResultModal } from './BettingResultModal';
import { AiTauntBubble } from './AiTauntBubble';
import { useWallet } from '../lib/useWallet';
import { useCubeHistory } from '../lib/useCubeHistory';
import { CalibrationOverlay } from '../../hand-tracking/ui/CalibrationOverlay';
import { HandTrackingLayer } from '../../hand-tracking/ui/HandTrackingLayer';
import { GhostHandLayer } from '../../hand-tracking/ui/GhostHandLayer';
import { VideoLayer } from '../../video-call/ui/VideoLayer';
import { useVideoChat } from '../../networking/lib/useVideoChat'; // NEW
import { SupabaseSignaling } from '../../networking/lib/SupabaseSignaling';
import { logTelemetry } from '../../../shared/lib/telemetry';
import { isFeatureEnabled } from '../../../shared/lib/featureFlags';
import { applyMove, getAvailableDice, isValidMove } from '../../../entities/game/rules';
import { startPresenceHeartbeat, stopPresenceHeartbeat } from '../../../shared/api/supabase';
import { DiceButton } from '../../../shared/ui/DiceButton/DiceButton';
import { supabase } from '../../../shared/api/supabase'; // NEW: Added import

import { mirrorPointId } from '../lib/mirrorBoard';
import { rollDice } from '../../../entities/game/utils';

// Types
import type { Move } from '../../../entities/game/types';
import type { GameMode } from '../../admin/GameSettingsContext';
import type { HandFrame } from '../../hand-tracking/lib/HandProtocol';

interface GameBoardProps {
  initialMode?: GameMode;
  initialRoomId?: string | null;
}

/**
 * GameBoard Feature - Main container for gameplay
 * Wrapper that provides MediaPipeProvider context
 */
export function GameBoard({ initialMode = 'ai', initialRoomId }: GameBoardProps) {
  return (
    <MediaPipeProvider>
      <GameBoardContent initialMode={initialMode} initialRoomId={initialRoomId} />
    </MediaPipeProvider>
  );
}

/**
 * GameBoardContent - Inner component with all game logic
 * Must be inside MediaPipeProvider to access hand tracking context
 */
function GameBoardContent({ initialMode = 'ai', initialRoomId }: GameBoardProps) {
  // Enable 5-minute inactivity auto-logout
  useInactivityLogout(5);
  
  // Auth Context for Game History
  const { user } = useAuth();
  const navigate = useNavigate();

  // Betting System State
  const [stakeInicial] = useState(100); // Default stake
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [opponentAbandoned, setOpponentAbandoned] = useState(false);
  const hasReservedStake = useRef(false);
  const [bettingMessages, setBettingMessages] = useState<string[]>([]);
  
  // Game Networking & Presence State
  const [isOpponentPresent, setIsOpponentPresent] = useState(false);
  const hasOpponentJoinedOnceRef = useRef(false);
  const abandonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [, setTransactionId] = useState<string | null>(null);
  const [opponentWallet, setOpponentWallet] = useState({ saldo: 0, apuestaReservada: 0 });
  const [, setSyncedToCRM] = useState(false);

  // Identify Local Player Color (For UI Positioning)
  const [myColor, setMyColor] = useState<'white' | 'black' | null>(null);
  const [matchPlayers, setMatchPlayers] = useState<{ white: string | null; black: string | null }>({ white: null, black: null });
  const computerPlayer = myColor === 'black' ? 'white' : 'black';

  // CRYSTAL WINDOW & Signaling State
  const isCrystalEnabled = isFeatureEnabled('ENABLE_CRYSTAL_WINDOW') && initialMode === 'human';
  const [signalingChannel, setSignalingChannel] = useState<SupabaseSignaling | null>(null);
  const signalingChannelRef = useRef<SupabaseSignaling | null>(null);

  // Initialize Video Chat (Moved up to prevent TDZ errors)
  const { 
    remoteStream, 
    metrics,
    handleSignal, 
    sendData, 
    connectionStatus, 
    startCall 
  } = useVideoChat({
      roomId: initialRoomId || 'prototype-room',
      userId: user?.id || 'local-user', 
      signalingChannel: signalingChannel,
      enabled: isCrystalEnabled
  });

  // H2H AUTOMATION: Auto-trigger startCall for the Sender (White)
  useEffect(() => {
      if (initialMode === 'human' && myColor === 'white' && connectionStatus === 'new' && signalingChannel) {
          console.log('[GameBoard] H2H Automation: Identifying as Sender, initiating WebRTC call in 2s...');
          const timer = setTimeout(() => {
              if (connectionStatus === 'new' && startCall) {
                  startCall();
              }
          }, 2000);
          return () => clearTimeout(timer);
      }
  }, [initialMode, myColor, connectionStatus, signalingChannel, startCall]);

  // Sync Ref with State
  useEffect(() => {
    signalingChannelRef.current = signalingChannel;
  }, [signalingChannel]);
  
  // Mark player as online when game loads (heartbeat every 20s), offline on unmount
  useEffect(() => {
    startPresenceHeartbeat();
    
    return () => {
      stopPresenceHeartbeat();
    };
  }, []);
  
  const { state, dispatch, isPending } = useGameState();
  const [, startTransition] = useTransition();
  const isVsComputer = initialMode === 'ai';
  
  // AI Worker for persistence & learning
  const { recordMove, notifyGameEnd } = useAIWorker(() => {
    // We don't use worker for move generation anymore (Gemini does it),
    // but we use it for transposition table & result saving.
  });
  
  // Delayed Modal State
  // Delayed Modal State
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  
  // Doubling Cube Modal State
  const [showDoublingModal, setShowDoublingModal] = useState(false);

  // New Game Countdown State (null = not counting)
  const [newGameCountdown, setNewGameCountdown] = useState<number | null>(null);
  

  
  // AI Taunt Bubble State
  const [tauntMessage, setTauntMessage] = useState('');
  const [showTaunt, setShowTaunt] = useState(false);
  const [isHintLoading, setIsHintLoading] = useState(false);
  
  // AI Taunts enabled setting - read from localStorage
  const [aiTauntsEnabled] = useState(() => {
    const saved = localStorage.getItem('vivo_ai_taunts_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  
  // Gemini AI Taunts enabled (smarter taunts via Gemini)
  const [geminiTauntsEnabled] = useState(() => {
    const saved = localStorage.getItem('vivo_gemini_taunts_enabled');
    return saved !== null ? saved === 'true' : true; // ENABLED BY DEFAULT
  });

  // Training Mode (Equity Bar visibility) setting
  const [trainingModeEnabled] = useState(() => {
    // If not logged in, training mode is always effectively ON.
    if (!user) return true;
    
    // Read from localStorage (synced by ClientPortal)
    const saved = localStorage.getItem('vivo_training_mode_enabled');
    return saved !== null ? saved === 'true' : true; // ENABLED BY DEFAULT
  });
  
  // Calculate effective training mode for the current match
  // - Human matches (H2H): ALWAYS OFF (to prevent cheating/informational advantage)
  // - AI matches:
  //    - Anonymous: ALWAYS ON
  //    - Registered: Based on user preference
  const isTrainingModeActive = initialMode === 'ai' ? trainingModeEnabled : false;
  

  // Wallet and Cube History Hooks
  const wallet = useWallet();
  const cubeHistory = useCubeHistory(initialRoomId || null);

  // Taunt trigger helper
  const triggerTaunt = useCallback(async (eventType?: 'hit' | 'double' | 'thinking' | 'roll' | 'skip' | 'win' | 'lose') => {
    if (!aiTauntsEnabled || !eventType || !isVsComputer) return;
    
    const currentWallet = wallet?.saldo_actual ?? 500;
    
    if (geminiTauntsEnabled) {
      // Generate Context (Spinal Cord AI)
      const { summary, tension } = generateBoardSummary(state);
      
      const gameContext = {
        game_id: state.game_id,
        summary,
        tension,
        cubeValue: state.cube,
        playerPoints: currentWallet,
        aiPoints: 500,
        dice: state.dice.length > 0 ? state.dice : undefined,
      };
      
      try {
        const geminiTaunt = await generateGeminiTaunt(eventType, gameContext);
        if (geminiTaunt) {
          setTauntMessage(geminiTaunt);
          setShowTaunt(true);
          setTimeout(() => setShowTaunt(false), 3500);
        }
      } catch (err) {
        console.error(`[AI Taunt] Failed for event ${eventType}:`, err);
      }
    }
  }, [aiTauntsEnabled, geminiTauntsEnabled, isVsComputer, state, wallet?.saldo_actual]);
  

  // ─── Stable Refs for sync handlers ───────────────────────────────────────
  // We must NOT use raw state values in listener useEffect deps — doing so
  // causes the listener to be torn down + re-added on every state change,
  // dropping remote broadcasts that arrive during the teardown window.
  const myColorRef = useRef<'white' | 'black' | null>(null);
  const stateTurnRef = useRef<'white' | 'black'>('white');
  const stateWinnerRef = useRef<'white' | 'black' | null>(null);
  const stateHistoryLenRef = useRef<number>(0);
  const stateRef = useRef(state);

  // Keep refs in sync with the latest state values
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);
  useEffect(() => { stateTurnRef.current = state.turn; }, [state.turn]);
  useEffect(() => { stateWinnerRef.current = state.winner; }, [state.winner]);
  useEffect(() => { stateHistoryLenRef.current = state.history.length; }, [state.history.length]);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Fetch opponent's real wallet balance when we know who the opponent is
  useEffect(() => {
    if (initialMode !== 'human' || !user?.id || !matchPlayers.white || !matchPlayers.black) return;
    
    const opponentId = matchPlayers.white === user.id ? matchPlayers.black : matchPlayers.white;
    if (!opponentId) return;
    
    const fetchOpponentWallet = async () => {
      const { data, error } = await supabase
        .from('wallets')
        .select('saldo_actual, saldo_reservado')
        .eq('user_id', opponentId)
        .maybeSingle();
      
      if (!error && data) {
        setOpponentWallet({ saldo: data.saldo_actual ?? 0, apuestaReservada: data.saldo_reservado ?? 0 });
      }
    };
    
    fetchOpponentWallet();
    
    // Subscribe to real-time updates on opponent wallet
    const channel = supabase
      .channel(`opponent-wallet:${opponentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${opponentId}` },
        (payload) => {
          setOpponentWallet({
            saldo: payload.new.saldo_actual ?? 0,
            apuestaReservada: payload.new.saldo_reservado ?? 0,
          });
        }
      )
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [initialMode, user?.id, matchPlayers.white, matchPlayers.black]);

  // Reserve initial stake when match starts (guarded: only once, only if balance allows)
  useEffect(() => {
    if (!user?.id || hasReservedStake.current) return;
    
    // In Human mode, we need room and players resolved. 
    // In AI mode, we don't need them to start reserving.
    if (initialMode === 'human' && (!initialRoomId || !matchPlayers.white || !matchPlayers.black)) return;

    // Check if already reserved in this session
    const storageKey = initialRoomId 
      ? `vivo_bet_${initialRoomId}_${user.id}`
      : `vivo_bet_ai_${user.id}`;
      
    if (localStorage.getItem(storageKey)) {
        console.log('[GameBoard] Stake already reserved locally for this match.');
        hasReservedStake.current = true;
        return;
    }

    // Only reserve if user has sufficient balance
    if (wallet.saldo_actual >= stakeInicial) {
      hasReservedStake.current = true;
      localStorage.setItem(storageKey, 'true');
      
      wallet.reserveStake(stakeInicial).then(success => {
        if (!success) {
          console.warn('[GameBoard] Stake reservation failed — insufficient balance or error');
          setInsufficientFunds(true);
          localStorage.removeItem(storageKey);
        }
      });
      
      // Update match row with initial stake if it's a Human match with UUID
      if (initialMode === 'human' && initialRoomId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(initialRoomId);
        if (isUUID) {
          supabase
            .from('matches')
            .select('id')
            .eq('room_id', initialRoomId)
            .single()
            .then(({ data: matchRow }) => {
              if (matchRow) {
                supabase
                  .from('matches')
                  .update({ 
                    stake_inicial: stakeInicial,
                    bet_amount: stakeInicial // Add bet_amount for trigger compatibility
                  })
                  .eq('id', matchRow.id);
              }
            });
        }
      }
    } else {
      console.warn('[GameBoard] Insufficient balance for stake:', wallet.saldo_actual, '<', stakeInicial);
      setInsufficientFunds(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode, initialRoomId, user?.id, matchPlayers.white, matchPlayers.black]);

  // Browser close/refresh guard for H2H games
  useEffect(() => {
    if (initialMode !== 'human' || state.winner) return;
    
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show a generic message
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [initialMode, state.winner]);

  // Opponent presence detection for H2H games
  useEffect(() => {
    if (initialMode !== 'human' || !initialRoomId || !user?.id || !matchPlayers.white || !matchPlayers.black) return;
    if (state.winner) return; // Game already decided
    
    // FALLBACK: If WebRTC is already connected, the opponent MUST be present.
    // This allows the board to unlock even if Supabase Presence is delayed or failing.
    if (connectionStatus === 'connected') {
        setIsOpponentPresent(true);
        hasOpponentJoinedOnceRef.current = true;
    }

    const opponentId = matchPlayers.white === user.id ? matchPlayers.black : matchPlayers.white;
    if (!opponentId) return;
    
    const presenceChannel = supabase.channel(`game-presence:${initialRoomId}`, {
      config: { presence: { key: user.id } }
    });
    
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const presenceState = presenceChannel.presenceState();
        const opponentPresent = Object.keys(presenceState).some(key => key === opponentId);
        
        // Only update if we aren't already marked as present via WebRTC fallback
        if (!opponentPresent && connectionStatus === 'connected') return;

        setIsOpponentPresent(opponentPresent);

        if (opponentPresent) {
            hasOpponentJoinedOnceRef.current = true;
            if (abandonTimerRef.current) {
                clearTimeout(abandonTimerRef.current);
                abandonTimerRef.current = null;
            }
        } else if (matchPlayers.white && matchPlayers.black) {
          // Opponent left — wait 10 seconds to confirm (handles brief disconnects)
          // ONLY trigger if they have joined at least once!
          if (hasOpponentJoinedOnceRef.current && !state.winner) {
            if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
            abandonTimerRef.current = setTimeout(() => {
              const currentState = presenceChannel.presenceState();
              const stillGone = !Object.keys(currentState).some(key => key === opponentId);
              if (stillGone && !state.winner) {
                console.log('[GameBoard] Opponent abandoned the game!');
                setOpponentAbandoned(true);
              }
            }, 10000);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: user.id, joined_at: new Date().toISOString() });
        }
      });
    
    return () => {
      if (abandonTimerRef.current) clearTimeout(abandonTimerRef.current);
      presenceChannel.untrack();
      supabase.removeChannel(presenceChannel);
    };
  }, [initialMode, initialRoomId, user?.id, matchPlayers.white, matchPlayers.black, state.winner, connectionStatus, setOpponentAbandoned]);

  /**
   * INSTANT ABANDONMENT LISTENER
   * Listens for 'abandoned' status in the 'matches' table for immediate notification.
   */
  useEffect(() => {
    if (initialMode !== 'human' || !initialRoomId || state.winner) return;

    const matchWatcher = supabase
      .channel(`match-status-watcher:${initialRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `room_id=eq.${initialRoomId}`
        },
        (payload) => {
          // If match status changed to abandoned and I am the winner, show the claim modal
          if (payload.new.status === 'abandoned' && payload.new.winner_id === user?.id) {
            console.log('[GameBoard] Match abandonment detected via Realtime Broadcast!');
            setOpponentAbandoned(true);
            
            // Clear presence timer if it was running
            if (abandonTimerRef.current) {
                clearTimeout(abandonTimerRef.current);
                abandonTimerRef.current = null;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(matchWatcher);
    };
  }, [initialMode, initialRoomId, state.winner, user?.id, setOpponentAbandoned]);

  // Handle game abandonment (player leaving)
  const handleAbandon = useCallback(async (abandonerId: string) => {
    if (!initialRoomId || !user?.id || state.winner) return;
    
    const winnerId = abandonerId === matchPlayers.white ? matchPlayers.black : matchPlayers.white;
    const winnerColor = winnerId === matchPlayers.white ? 'white' : 'black';
    const loserColor = winnerColor === 'white' ? 'black' : 'white';
    
    console.log('[GameBoard] Processing abandonment. Winner:', winnerId, 'Loser:', abandonerId);
    
    try {
      // 0. Resolve Match UUID (RPC and DB updates need UUID, not room_id string)
      // FIX: Check if initialRoomId is a valid UUID before querying to avoid 400 error
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(initialRoomId);
      
      let matchUUID = null;
      if (isUUID) {
        const { data: matchRow } = await supabase
          .from('matches')
          .select('id')
          .eq('room_id', initialRoomId)
          .maybeSingle();
        matchUUID = matchRow?.id;
      }

      if (!matchUUID && isUUID) {
          console.error('[GameBoard] Abandonment failed: No match UUID found for room', initialRoomId);
          return;
      }

      // If not a UUID (like match_...), we skip the DB/RPC updates but still navigate away
      if (!isUUID) {
        console.log('[GameBoard] Generic room ID detected, skipping match row updates');
        navigate('/dashboard');
        return;
      }

      // 1. Update match status
      await supabase
        .from('matches')
        .update({ 
            status: 'abandoned', 
            winner_id: winnerId,
            winner_color: winnerColor,
            winner_payout: stakeInicial * state.cube // CRITICAL: RPC uses this to pay the winner
        })
        .eq('id', matchUUID);
      
      // 2. Log the game result
      await supabase.from('game_logs').insert({
        winner: winnerColor,
        winner_color: winnerColor,
        loser_color: loserColor,
        win_method: 'abandonment',
        score_delta: stakeInicial,
        played_at: new Date().toISOString(),
        white_player_id: matchPlayers.white,
        black_player_id: matchPlayers.black,
        board_hash: 0,
        move_chosen: { type: 'abandonment' },
      });
      
      // 3. Send notification to winner
      if (winnerId) {
        await supabase.from('notifications').insert({
          client_id: winnerId,
          sender: 'system',
          content: '¡Tu oponente ha abandonado la partida! Has ganado automáticamente.',
          type: 'tournament_alert',
        });
      }

      // 4. Process match result for wallet (Process Payment)
      const { error: rpcError } = await supabase.rpc('process_match_result', { p_match_id: matchUUID });
      if (rpcError) {
        console.error('[GameBoard] process_match_result RPC error:', rpcError);
      } else {
        console.log('[GameBoard] Abandonment processed and payments settled.');
      }
      
    } catch (err) {
      console.error('[GameBoard] Error processing abandonment:', err);
    }
  }, [initialRoomId, user?.id, state.winner, state.cube, matchPlayers, stakeInicial, navigate]);

  // Handle exit with confirmation for H2H games
  // CRM Navigation Exception: /portal and /admin access ≠ abandonment
  const handleExitGame = useCallback((targetPath?: string) => {
    // Exception: CRM/Admin navigation preserves game state — use React Router
    if (typeof targetPath === 'string' && (targetPath.startsWith('/portal') || targetPath.startsWith('/admin'))) {
      navigate(targetPath);
      return;
    }
    
    if (initialMode === 'human' && !state.winner && matchPlayers.white && matchPlayers.black) {
      // Show confirmation modal for H2H active games
      setShowLeaveConfirm(true);
    } else {
      // AI mode or game already finished — exit directly
      navigate(targetPath || '/');
    }
  }, [initialMode, state.winner, matchPlayers, navigate]);

  const confirmLeaveGame = useCallback(async () => {
    if (user?.id) {
      await handleAbandon(user.id);
    }
    navigate('/');
  }, [user?.id, handleAbandon, navigate]);

  // NOTE: Opponent disconnect is shown via modal, but does NOT auto-trigger loss.
  // The abandonment protocol is only triggered when the user clicks the explicit button.
  
  useEffect(() => {
    if (initialMode === 'ai') {
        const savedColor = localStorage.getItem('selected_team') as 'white' | 'black' | null;
        const color = savedColor || 'white';
        setMyColor(color); // Use saved color preference in AI mode
        if (user?.id) {
            setMatchPlayers({ 
                white: color === 'white' ? user.id : null, 
                black: color === 'black' ? user.id : null 
            });
        }
        return;
    }

    // In Human mode, fetch match details to see if I am white or black.
    // CRITICAL: Retry up to 10 times, 2s apart.
    // The match/invitation row may not be committed yet when the board first mounts
    // (race condition on slow connections). Without retry, myColor stays null and
    // ROJAS / BLANCAS shows 0 pts permanently.
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    let timerId: ReturnType<typeof setTimeout>;

    const fetchMyColor = async (): Promise<boolean> => {
        if (!initialRoomId || !user?.id) return false;

        console.log(`[GameBoard] fetchMyColor attempt ${attempts + 1}/${MAX_ATTEMPTS} for:`, initialRoomId);

        // 1. Try fetching invitation first (Direct 1v1 invite)
        const { data: inviteData } = await supabase
            .from('invitations')
            .select('sender_id, receiver_id, status, created_at')
            .eq('room_id', initialRoomId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (inviteData) {
            console.log('[GameBoard] Found Invitation:', inviteData);
            setMatchPlayers({ white: inviteData.sender_id, black: inviteData.receiver_id });
            if (inviteData.sender_id === user.id) setMyColor('white');
            else if (inviteData.receiver_id === user.id) setMyColor('black');
            return true;
        }

        // 2. Fallback: Check 'matches' table by room_id
        const { data: matchData } = await supabase
            .from('matches')
            .select('player_white, player_black, room_id, status')
            .eq('room_id', initialRoomId)
            .maybeSingle();

        if (matchData) {
            console.log('[GameBoard] Found Match:', matchData);
            setMatchPlayers({ white: matchData.player_white, black: matchData.player_black });
            if (matchData.player_white === user.id) setMyColor('white');
            else if (matchData.player_black === user.id) setMyColor('black');
            return true;
        }

        // 3. Fallback for Tournament — find my active match
        const { data: tournamentMatch } = await supabase
            .from('matches')
            .select('player_white, player_black, room_id, status')
            .or(`player_white.eq.${user.id},player_black.eq.${user.id}`)
            .neq('status', 'completed')
            .limit(1)
            .maybeSingle();

        if (tournamentMatch) {
            console.log('[GameBoard] Found Active Tournament Match:', tournamentMatch);
            setMatchPlayers({ white: tournamentMatch.player_white, black: tournamentMatch.player_black });
            if (tournamentMatch.player_white === user.id) setMyColor('white');
            else if (tournamentMatch.player_black === user.id) setMyColor('black');
            return true;
        }

        console.warn(`[GameBoard] No invitation or match found — attempt ${attempts + 1}/${MAX_ATTEMPTS}`);
        return false;
    };

    const tryFetch = async () => {
        const found = await fetchMyColor();
        if (!found && attempts < MAX_ATTEMPTS - 1) {
            attempts++;
            timerId = setTimeout(tryFetch, 2000); // retry after 2s
        } else if (!found) {
            console.error('[GameBoard] Could not resolve myColor after max retries. Sync disabled.');
        }
    };

    tryFetch();

    return () => clearTimeout(timerId);
  }, [initialMode, initialRoomId, user?.id, setMatchPlayers, setMyColor]);
  

  
  // Board Opacity (Translucency) State - Initialized from localStorage (0-100 scale converted to 0-1)
  const [boardOpacity, setBoardOpacity] = useState(() => {
    const saved = localStorage.getItem('board_translucency');
    return saved ? parseInt(saved, 10) / 100 : 0.8;
  });
  
  // Persistent hand tracking preference
  const [isHandTracking, setIsHandTracking] = useState(() => {
    const saved = localStorage.getItem('vivo_hand_tracking_enabled');
    return saved === 'true';
  });

  // Sync settings with localStorage and external events
  useEffect(() => {
    const syncSettings = () => {
      const savedOpacity = localStorage.getItem('board_translucency');
      if (savedOpacity) setBoardOpacity(parseInt(savedOpacity, 10) / 100);
      
      const savedHandTracking = localStorage.getItem('vivo_hand_tracking_enabled');
      if (savedHandTracking !== null) setIsHandTracking(savedHandTracking === 'true');
      
      if (initialMode === 'ai') {
        const savedColor = localStorage.getItem('selected_team') as 'white' | 'black' | null;
        if (savedColor) {
           setMyColor(savedColor);
           if (user?.id) {
             setMatchPlayers({ 
                white: savedColor === 'white' ? user.id : null, 
                black: savedColor === 'black' ? user.id : null 
             });
           }
        }
      }
    };

    window.addEventListener('board-settings-changed', syncSettings);
    return () => window.removeEventListener('board-settings-changed', syncSettings);
  }, [initialMode, user?.id, setBoardOpacity, setIsHandTracking, setMyColor, setMatchPlayers]);

  // Persist local changes to localStorage
  useEffect(() => {
    localStorage.setItem('board_translucency', Math.round(boardOpacity * 100).toString());
    window.dispatchEvent(new CustomEvent('board-settings-changed'));
  }, [boardOpacity]);
  
  const [showCalibration, setShowCalibration] = useState(false); // State for Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Board Geometry & Dimensions (Lifted State)
  const { containerRef, dimensions, getPixelCoordinates } = useBoardDimensions(); // Desktop Sidebar State
  
  // NEW: Root Container Dimensions for Hand Tracking (Full Screen / Layout Aware)
  const { containerRef: rootRef, dimensions: rootDimensions } = useBoardDimensions();

  useEffect(() => {
    localStorage.setItem('vivo_hand_tracking_enabled', isHandTracking.toString());
    console.log('[GameBoard] Hand Tracking Toggled:', isHandTracking);
  }, [isHandTracking]);
  
  // Create a Ref to hold the latest handleSignal to avoid stale closures in the signaling subscription
  const handleSignalRef = useRef(handleSignal);
  
  useEffect(() => {
    handleSignalRef.current = handleSignal;
  }, [handleSignal]);

  // Setup Signaling Effect
  useEffect(() => {
    // Enable Signaling if mode is 'human' OR if Crystal is enabled (legacy check)
    if ((initialMode !== 'human' && !isCrystalEnabled) || !initialRoomId || !user?.id) return;

    // Create instance if not exists
    let instance: SupabaseSignaling | null = null;

    if (!signalingChannel) {
        console.log('[GameBoard] Creating SupabaseSignaling instance for Room:', initialRoomId);
        instance = new SupabaseSignaling(
            initialRoomId, 
            user.id,
            (msg) => {
                // Use Ref to always call the LATEST handleSignal
                // msg IS the payload because SupabaseSignaling unwraps it.
                // So msg = { type: 'GAME_UPDATE', event: ..., payload: ... }
                
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = msg as any;
                if (data.type === 'GAME_UPDATE') {
                     console.log('[GameSync] Received via Signaling Fallback:', data);
                     const customEvent = new CustomEvent('vivo-data-message', { detail: data });
                     window.dispatchEvent(customEvent);
                } else {
                     if (handleSignalRef.current) {
                        handleSignalRef.current(msg);
                     }
                }
            }
        );
        setSignalingChannel(instance);
    }

    return () => {
        // Only cleanup if we are unmounting or dependencies change significantly
        // Ideally we don't want to close/reopen on every render.
        // But here we can't easily access the "current" state inside cleanup without a ref tracking it.
        // Actually, preventing re-creation is key.
        if (instance) {
             instance.close();
             setSignalingChannel(null); 
        }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCrystalEnabled, initialRoomId, user?.id /* handleSignal is excluded to prevent loop, or we assume it's stable */]);
  
  // Cleanup effect for the signaling channel when component unmounts
  useEffect(() => {
    return () => {
        if (signalingChannel) {
            signalingChannel.close();
        }
    };
  }, [signalingChannel]);

  // Sending Hand Data
  const handleFrameReady = useCallback((frame: HandFrame) => {
      // Only send if we are in Crystal Mode and Connected
      if (isCrystalEnabled && connectionStatus === 'connected') {
           sendData(frame);
      }
  }, [isCrystalEnabled, connectionStatus, sendData]);

  // NEW: Broadcast Game State (Dice, Moves, etc.)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const broadcastGameUpdate = useCallback(async (type: 'ROLL_DICE' | 'MOVE_CHECKER' | 'NEW_GAME' | 'UNDO_MOVE' | 'OFFER_DOUBLE' | 'TAKE_DOUBLE' | 'DROP_DOUBLE' | 'CONFIRM_TURN_END', payload?: any) => {
    // Allow broadcasting in 'human' mode even if Crystal is disabled
    if (initialMode !== 'human' && !isCrystalEnabled) return;

    let broadcastSuccess = false;

    // 1. Primary: WebRTC Data Channel (fastest, lowest latency)
    if (connectionStatus === 'connected') {
        broadcastSuccess = sendData({ type: 'GAME_UPDATE', event: type, payload });
        if (broadcastSuccess) {
            console.info(`[Sync → WebRTC] Broadcast successful: ${type}`);
        } else {
            console.warn(`[Sync → WebRTC] Send failed (DataChannel closed or too large). Trying Signaling...`);
        }
    }

    // 2. Secondary Fallback: Supabase Signaling Broadcast
    if (!broadcastSuccess) {
        const signaling = signalingChannelRef.current;
        if (signaling) {
            console.log(`[Sync → Signaling] Attempting broadcast: ${type}`);
            try {
                await signaling.broadcastMove({
                    type: 'signal',
                    target: 'broadcast',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    payload: { type: 'GAME_UPDATE', event: type, payload } as any
                });
                broadcastSuccess = true;
                console.info(`[Sync → Signaling] Broadcast successful: ${type}`);
            } catch (err) {
                console.warn(`[Sync → Signaling] Broadcast failed:`, err);
            }
        }
    }

    // 3. Last resort: Supabase Realtime Broadcast channel
    if (!broadcastSuccess && realtimeBroadcastRef.current) {
        console.log(`[Sync → Realtime] Attempting last-resort broadcast: ${type}`);
        try {
            await realtimeBroadcastRef.current.send({
                type: 'broadcast',
                event: 'GAME_UPDATE',
                payload: { event: type, payload }
            });
            broadcastSuccess = true;
            console.info(`[Sync → Realtime] Broadcast successful: ${type}`);
        } catch (err) {
            console.error(`[Sync → Realtime] Broadcast failed:`, err);
        }
    }

    if (!broadcastSuccess) {
        console.error(`[Sync Error] FAILED TO BROADCAST ${type} across ALL channels. Sync is lost.`);
    }
  }, [isCrystalEnabled, connectionStatus, sendData, initialMode]);
  
  // ── broadcastGameUpdateRef ──────────────────────────────────────────────────
  // Always points to the latest broadcastGameUpdate so that the hand-tracking
  // gesture effect (which is registered ONCE) never calls a stale closure.
  const broadcastGameUpdateRef = useRef(broadcastGameUpdate);
  useEffect(() => {
    broadcastGameUpdateRef.current = broadcastGameUpdate;
  }, [broadcastGameUpdate]);

  // ── Supabase Realtime Broadcast channel (unconditional H2H fallback) ─────────
  // When hand-tracking is on but Crystal Window is off, both WebRTC and Signaling
  // channels may not be available. This channel is always present for H2H games
  // and acts as the guaranteed last-resort transport for game events.
  const realtimeBroadcastRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (initialMode !== 'human' || !initialRoomId) return;
    const ch = supabase.channel(`game-sync-rt:${initialRoomId}`, {
      config: { broadcast: { self: false, ack: false } }
    })
    .on('broadcast', { event: 'GAME_UPDATE' }, ({ payload }) => {
      // Received from opponent via Realtime — dispatch as if it came from Data Channel
      const customEvent = new CustomEvent('vivo-data-message', {
        detail: { type: 'GAME_UPDATE', event: payload.event, payload: payload.payload }
      });
      window.dispatchEvent(customEvent);
    })
    .subscribe();
    realtimeBroadcastRef.current = ch;
    return () => { supabase.removeChannel(ch); realtimeBroadcastRef.current = null; };
  }, [initialMode, initialRoomId]);

  // Listen for Remote Game Updates (Data Channel handled in window event, Signaling handled in callback)
  // FIX: Use stable refs inside handler to avoid re-registering the listener on every state change.
  // Re-registering on every state change creates a teardown window where remote events are silently dropped.
  // The listener is registered ONCE and reads the latest values via refs.
  useEffect(() => {
    const handleRemoteUpdate = (event: CustomEvent) => {
        const data = event.detail;
        if (data.type === 'GAME_UPDATE') {
            console.log('[GameSync] Received Remote Update:', data.event);

            // Read stable refs for the latest values — no stale closure risk
            const currentMyColor = myColorRef.current;
            const currentTurn = stateTurnRef.current;
            const currentWinner = stateWinnerRef.current;
            const currentHistoryLen = stateHistoryLenRef.current;

            // ─── Security / Turn Guard ────────────────────────────────────────
            // MOVE_CHECKER from remote is only valid when it is NOT our turn.
            // ROLL_DICE from remote is always valid - the opponent starting their
            // turn sends this AFTER CONFIRM_TURN_END switched state.turn, but due
            // to async useActionState there can be a brief window where stateTurnRef
            // still shows our color. We must NOT block ROLL_DICE on this basis.
            // Hand-tracking moves go through onDrop → broadcastGameUpdate('MOVE_CHECKER')
            // and are governed by the same guard.
            const isDoublingEvent = ['OFFER_DOUBLE', 'TAKE_DOUBLE', 'DROP_DOUBLE'].includes(data.event);
            const isMoveEvent = data.event === 'MOVE_CHECKER';

            console.log(`[Sync ← Receiver] Processing ${data.event} from remote. Turn: ${currentTurn}, MyColor: ${currentMyColor}`);

            // Only block MOVE_CHECKER if we are certain it is still our own turn
            // (ROLL_DICE is always allowed from remote — it starts the opponent's turn)
            if (!currentWinner && currentMyColor && currentTurn === currentMyColor && isMoveEvent && !isDoublingEvent) {
                console.warn(`[Sync ← Security] Ignored remote ${data.event} during MY turn. (Turn: ${currentTurn}, LocalColor: ${currentMyColor})`);
                return;
            }

            // Guard for UNDO: only apply if there is history to undo
            if (data.event === 'UNDO_MOVE') {
                if (currentHistoryLen === 0) {
                    console.warn('[Sync Error] Ignored remote UNDO_MOVE: No history to undo.');
                    return;
                }
            }

            startTransition(() => {
                try {
                    dispatch({ type: data.event, ...data.payload });
                } catch (error) {
                    console.error(`[Critical] Failed to apply remote update '${data.event}':`, error);
                }
            });

            // Auto-open doubling modal for the RECEIVING player when opponent offers a double.
            // Guard: only open if it is NOT my own turn (i.e. the offer came from the other side).
            if (data.event === 'OFFER_DOUBLE' && currentMyColor && currentTurn === currentMyColor) {
                // currentTurn is still MY color → I am the one being offered the double
                setShowDoublingModal(true);
            }
        }
    };

    window.addEventListener('vivo-data-message', handleRemoteUpdate as EventListener);
    return () => window.removeEventListener('vivo-data-message', handleRemoteUpdate as EventListener);
  // CRITICAL: minimal deps — DO NOT add `state` or `state.turn` here.
  // Values are read via refs (myColorRef, stateTurnRef, etc.) to prevent teardown loops.
  }, [dispatch]);

  // Optimistic State
  const [optimisticState, addOptimisticMove] = useOptimistic(
    state,
    (currentState, move: Move) => ({
      ...currentState,
      board: applyMove(currentState.board, move, currentState.turn),
      usedDice: [...currentState.usedDice, move.die],
    })
  );

  const onDrop = useCallback((move: Move) => {
    startTransition(async () => {
      addOptimisticMove(move);
      await dispatch({ type: 'MOVE_CHECKER', move });
      
      // Record move for AI learning
      recordMove(stateRef.current, move);

      // Broadcast Move — use Ref so hand-tracking gesture effect 
      // always has access to the latest broadcaster without re-registering.
      broadcastGameUpdateRef.current('MOVE_CHECKER', { move });
    });
  }, [addOptimisticMove, dispatch, recordMove]); // state intentionally omitted, reading via Ref for stability


  // AI Integration (Replaces useAIWorker)
  const [isThinking, setIsThinking] = useState(false);
  // NEW: "Do Not Disturb" Lock
  const aiLockRef = useRef(false);

  // Function to trigger AI Move
  const triggerAIMove = useCallback(async (currentBoard: number[], currentDice: number[], currentState: typeof state) => {
      // 1. SAFETY CHECKS
      if (isThinking || aiLockRef.current) return;
      
      // 2. LOCK THE DOOR
      aiLockRef.current = true;
      setIsThinking(true);
      
      // AI is thinking - show taunt
      console.log("🤖 [DEBUG] Calling triggerTaunt('thinking') at line 572...");
      triggerTaunt('thinking');
      
      try {
          console.log("🤖 AI Thinking... (Locked)");
          const aiResponse = await getGrandmasterMove(currentBoard, currentDice, currentState);
          
          if (aiResponse && aiResponse.moves && aiResponse.moves.length > 0) {
              console.log("🤖 AI Playing:", aiResponse.moves);
              
              // 4. EXECUTE MOVES WITH PRE-VALIDATION
              let liveState = currentState;
              let movesExecuted = 0;
              for (const move of aiResponse.moves) {
                  const moveObj: Move = { from: move.from, to: move.to, die: move.die };
                  
                  // Wait a bit between moves so it looks natural
                  await new Promise(resolve => setTimeout(resolve, 1200));

                  // PRE-VALIDATE against live state to prevent async crash
                  const validation = isValidMove(liveState, moveObj);
                  if (!validation.valid) {
                      console.warn(`⚠️ AI move rejected by engine: "${validation.reason}". Skipping.`);
                      continue;
                  }

                  try {
                      // Check if this move hits opponent's blot
                      const targetPoint = liveState.board[moveObj.to];
                      const isHit = (liveState.turn === 'white' && targetPoint === -1) || 
                                   (liveState.turn === 'black' && targetPoint === 1);
                      
                      onDrop(moveObj);
                      movesExecuted++;
                      
                      // Taunt on hit!
                      if (isHit) {
                        triggerTaunt('hit');
                      }
                      
                      // Update liveState to reflect the move for next iteration
                      liveState = {
                          ...liveState,
                          board: applyMove(liveState.board, moveObj, liveState.turn),
                          usedDice: [...liveState.usedDice, moveObj.die],
                      };
                  } catch (err) {
                      console.warn("⚠️ AI tried an invalid move, skipping:", err);
                  }
              }

              // ─── CEREBRO PEDAGÓGICO (El Profesor Mágico) ───
              if (geminiTauntsEnabled) {
                  const currentWallet = wallet?.saldo_actual ?? 500;
                  generatePedagogicalCommentary(
                    aiResponse.moves,
                    currentBoard,
                    currentState.turn || 'black',
                    myColor || 'white',
                    currentWallet,
                    500
                  ).then(pedagogicalTaunt => {
                   if (pedagogicalTaunt) {
                     setTauntMessage(pedagogicalTaunt);
                     setShowTaunt(true);
                     setTimeout(() => setShowTaunt(false), 7000); // Dar tiempo a leer
                   }
                 }).catch(err => console.error("Error en Profesor Mágico:", err));
              }

              // 5. TURN COMPLETION: If some moves were skipped, end AI turn to prevent freeze
              const allDiceUsed = liveState.usedDice.length >= currentDice.length;
              if (!allDiceUsed || movesExecuted < aiResponse.moves.length) {
                  console.warn(`⚠️ AI used ${movesExecuted}/${aiResponse.moves.length} moves. Confirming turn end.`);
                  await new Promise(resolve => setTimeout(resolve, 500));
                    startTransition(() => {
                      dispatch({ type: 'CONFIRM_TURN_END' });
                      broadcastGameUpdateRef.current('CONFIRM_TURN_END');
                    });
              }
           } else {
             console.log("🤖 AI decided to skip.");
             // Taunt when AI skips (no valid moves)
             triggerTaunt('skip');
             // Optional: Skip turn logic
               startTransition(() => {
                 dispatch({ type: 'CONFIRM_TURN_END' });
                 broadcastGameUpdateRef.current('CONFIRM_TURN_END');
               });
          }
      } catch (error) {
          console.error("AI Failed:", error);
      } finally {
          setIsThinking(false);
          // 5. UNLOCK ONLY WHEN FINISHED
          setTimeout(() => {
              aiLockRef.current = false;
          }, 2000);
      }
  }, [isThinking, onDrop, dispatch, triggerTaunt, geminiTauntsEnabled, wallet?.saldo_actual, myColor]);

  // MODO PISTA: Solicitud de ayuda manual al Profesor Mágico
  const handleRequestHint = useCallback(async () => {
    if (isHintLoading || !myColor || optimisticState.dice.length === 0) return;
    
    // Prevent hints during opponent's turn to avoid confusion
    if (optimisticState.turn !== myColor) {
        setTauntMessage("Espera a tu turno para pedir consejo... 🕒");
        setShowTaunt(true);
        setTimeout(() => setShowTaunt(false), 3000);
        return;
    }

    setIsHintLoading(true);
    setTauntMessage("El Profesor está analizando la mejor jugada... 🔮");
    setShowTaunt(true);
    try {
      const hint = await generatePedagogicalHint(
        optimisticState.board,
        optimisticState.dice,
        optimisticState,
        myColor
      );
      if (hint) {
        setTauntMessage(hint);
        setTimeout(() => setShowTaunt(false), 9000); // 9 secs to read
      } else {
         setShowTaunt(false);
      }
    } catch (e) {
      console.error(e);
      setShowTaunt(false);
    } finally {
      setIsHintLoading(false);
    }
  }, [optimisticState, myColor, isHintLoading]);

  // Effect to trigger AI
  useEffect(() => {
    // FIX: Do not request move if we are already waiting for confirmation (e.g. Blocked)
    // This allows the "Blocked" popup to show for its full duration (4s) instead of being pre-empted by the AI worker.
    if (isVsComputer && state.turn === computerPlayer && state.dice.length > 0 && !isThinking && !isPending && !state.needsTurnConfirmation) {
      const availableDice = getAvailableDice(state.dice, state.usedDice);
      if (availableDice.length > 0) {
        const timer = setTimeout(() => {
          // Verified against Error Log: [React 19 State Cascading] avoided.
          triggerAIMove(state.board, availableDice, state);
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [state, isVsComputer, isThinking, isPending, triggerAIMove, computerPlayer]); 




// ... [inside component]






  /**
   * NEW INTERACTION MODEL: Dual-Input Bridge / Tap-to-Select
   * - Touch: Calls selectPiece() / executeMove()
   * - Camera: Will call same functions via HandTrackingLayer (Future)
   */
  const { 
    selectedPoint, 
    validTargetPoints, 
    selectPiece, 
    executeMove 
  } = useInteraction(optimisticState, onDrop);

  // ... (Keep existing effects for Turn Confirmation, Hand Interaction, Game Over, etc.) ...
  // Re-paste logic here to ensure context continuity if needed, but since we are doing a replace.
  // BUT the state `isSidebarOpen` needs to be defined at the top.
  // I will use a larger replacement block to include the top + return.
  
  // Auto-Turn Confirmation Logic
  // Auto-Turn Confirmation Logic (Refined for smooth fade)
  useEffect(() => {
    if (state.needsTurnConfirmation && !isPending && !isThinking) {
        const isBlocked = state.dice.length > state.usedDice.length;
        
        // Show modal ONLY if blocked. 
        // For AI games: Silence the pop-up during AI turns UNLESS they are blocked.
        const shouldShow = isVsComputer && state.turn === computerPlayer 
            ? isBlocked 
            : isBlocked; // In H2H or Human turn, we currently show it if blocked.
        
        // Actually, the request is to "Silence them altogether" except for specific cases.
        // Let's refine: If it's AI turn and NOT blocked, keep it hidden.
        setShowConfirmationModal(shouldShow);
        setIsFadingOut(false);
        
        let confirmTimer: ReturnType<typeof setTimeout>;

        // ONLY auto-confirm in AI mode. In Human mode, wait for manual confirmation or signal.
        if (isVsComputer) {
            // Auto-dismiss after 2 seconds (plus fade)
            const displayTimer = setTimeout(() => {
                if (isBlocked) setIsFadingOut(true); // Start fade out only if visible
                
                // Wait for fade animation (300ms) then confirm
                // If not blocked (invisible), we can just confirm immediately after the delay
                const delay = isBlocked ? 300 : 0;
                
                confirmTimer = setTimeout(() => {
                    startTransition(() => {
                        dispatch({ type: 'CONFIRM_TURN_END' });
                        broadcastGameUpdateRef.current('CONFIRM_TURN_END');
                        setShowConfirmationModal(false);
                    });
                }, delay);
            }, 2000); 

            return () => {
                clearTimeout(displayTimer);
                if (confirmTimer) clearTimeout(confirmTimer);
            };
        }
    } else {
        setShowConfirmationModal(false);
        setIsFadingOut(false);
    }
  }, [state.needsTurnConfirmation, isPending, isThinking, dispatch, state.dice.length, state.usedDice.length, isVsComputer, computerPlayer, state.turn]);

  /* 
   * Hand Interaction - Mapped to Tap/Select Logic (Temporary Bridge)
   * In the future, this will be more sophisticated (Pinch & Drop)
   */
  // PASS DIMENSIONS TO HAND INTERACTION (To Be Implemented in hook)
  // Casting for now or updating hook in next step.
  // We will assume the hook signature changes in the next step.
  // Helper logic for turn active state (Human vs AI or Human vs Human)
  // FIX: In H2H, we use the ref value for myColor so that hand-tracking
  // isTurnActive is stable and never flickers mid-gesture due to async state updates.
  // We still read state.turn directly here because isTurnActive gating for UI
  // (button disabling, hand gesture activation) can lag by one render safely.
  const isTurnActive = isVsComputer
      ? (!isThinking && !isPending && state.turn === (myColor || 'white'))
      : (state.turn === myColor && !isPending);

  // Use ROBUST root dimensions for hand tracking, not just board dimensions
  const { cursor, gesture, isHandActive } = useHandInteraction(rootDimensions, isTurnActive, handleFrameReady);
  const prevGestureRef = useRef<'open' | 'pinch'>('open');
  const [lastTouch, setLastTouch] = useState<{x: number, y: number} | null>(null);

  useEffect(() => {
    // CRITICAL: Do not process gestures if not the human player's turn
    if (!isTurnActive) return;
    
    if (!isHandActive || !isHandTracking || !cursor) return;

    const prevGesture = prevGestureRef.current;
    
    // Helper to find point ID from coordinates (with radius search for mobile leniency)
    const getPointIdFromCursor = (x: number, y: number): number | null => {
        // 1. Direct Hit (Fastest)
        const element = document.elementFromPoint(x, y);
        const pointId = getPointIdFromElement(element);
        if (pointId !== null) return pointId;
        
        // 2. Radius Search (Fallback for mobile fat-finger/drift)
        // Check a 40px radius around the cursor (generous for mobile)
        const radius = 40; 
        const points = [
            { dx: 0, dy: -radius }, // Top
            { dx: 0, dy: radius },  // Bottom
            { dx: -radius, dy: 0 }, // Left
            { dx: radius, dy: 0 },  // Right
            { dx: -radius*0.7, dy: -radius*0.7 }, // Top-Left
            { dx: radius*0.7, dy: -radius*0.7 },  // Top-Right
            { dx: -radius*0.7, dy: radius*0.7 },  // Bottom-Left
            { dx: radius*0.7, dy: radius*0.7 },   // Bottom-Right
        ];
        
        for (const pt of points) {
             const fallbackElement = document.elementFromPoint(x + pt.dx, y + pt.dy);
             const fallbackId = getPointIdFromElement(fallbackElement);
             if (fallbackId !== null) return fallbackId;
        }
        
        return null;
    };

    // Helper to extract ID from a specific DOM element
    function getPointIdFromElement(el: Element | null): number | null {
        if (!el) return null;
        const pointEl = el.closest('[data-point-id]');
        if (pointEl) return parseInt(pointEl.getAttribute('data-point-id') || '0', 10);
        
        const checkerEl = el.closest('[data-checker-point]');
        if (checkerEl) return parseInt(checkerEl.getAttribute('data-checker-point') || '0', 10);
        
        return null;
    }

    // Helper to find a specific element type using the radius search
    const getInteractiveElement = (x: number, y: number, selector: string): HTMLElement | null => {
        const element = document.elementFromPoint(x, y);
        if (element?.closest(selector)) return element.closest(selector) as HTMLElement;
        
        const radius = 40; 
        const points = [
            { dx: 0, dy: -radius }, { dx: 0, dy: radius }, { dx: -radius, dy: 0 }, { dx: radius, dy: 0 },
            { dx: -radius*0.7, dy: -radius*0.7 }, { dx: radius*0.7, dy: -radius*0.7 },
            { dx: -radius*0.7, dy: radius*0.7 }, { dx: radius*0.7, dy: radius*0.7 }
        ];
        
        for (const pt of points) {
             const fallbackElement = document.elementFromPoint(x + pt.dx, y + pt.dy);
             if (fallbackElement?.closest(selector)) {
                 return fallbackElement.closest(selector) as HTMLElement;
             }
        }
        return null;
    };

    // PINCH START -> Select Piece (Tap), Roll Dice, or Undo
    if (prevGesture === 'open' && gesture === 'pinch') {
        // 1. Check if hovering the Dice Button or Undo Button
        const interactiveBtn = getInteractiveElement(cursor.x, cursor.y, '#btn-dado, button[aria-label="Deshacer"]');
        if (interactiveBtn && !interactiveBtn.hasAttribute('disabled')) {
             interactiveBtn.click();
             
             requestAnimationFrame(() => {
                 setLastTouch({ x: cursor.x, y: cursor.y });
                 setTimeout(() => setLastTouch(null), 600);
             });
             return; // Stop processing further
        }

        // 2. Check if hovering a piece/point
        const pointId = getPointIdFromCursor(cursor.x, cursor.y);

        if (pointId !== null) {
           const logicalId = mirrorPointId(pointId, myColor);
           selectPiece(logicalId); 
           
           // Visual Feedback
           requestAnimationFrame(() => {
             setLastTouch({ x: cursor.x, y: cursor.y });
             setTimeout(() => setLastTouch(null), 600);
           });
        }
    }
    
    // PINCH RELEASE -> Execute Move (Tap Target)
    if (prevGesture === 'pinch' && gesture === 'open') {
         const pointId = getPointIdFromCursor(cursor.x, cursor.y);
         
         if (pointId !== null) {
             const logicalId = mirrorPointId(pointId, myColor);
             executeMove(logicalId);
         }
    }

    prevGestureRef.current = gesture;
  }, [cursor, gesture, isHandActive, isHandTracking, isTurnActive, selectPiece, executeMove, myColor]);

  // Telemetry Logging for Tracking State
  useEffect(() => {
    if (isFeatureEnabled('ENABLE_LAYOUT_LOGGING')) {
       logTelemetry('TRACKING_STATE_CHANGE', { 
         isTurnActive, 
         turn: state.turn, 
         isVsComputer 
       });
    }
  }, [isTurnActive, state.turn, isVsComputer]);



  // GAME OVER / SAVE RESULT LOGIC
  const hasSavedResult = useRef(false);

  // Sync to CRM function - MUST be defined before the useEffect that uses it
  const syncToCRM = useCallback(async (
    matchId: string,
    winner: 'white' | 'black',
    loser: 'white' | 'black',
    stakeInicial: number,
    cubeFinal: number,
    winMethod: string,
    pointsGanados: number,
    transactionId: string
  ) => {
    try {
      const crmData = {
        match_id: matchId,
        winner_id: matchPlayers[winner],
        loser_id: matchPlayers[loser],
        stake_inicial: stakeInicial,
        cubo_final: cubeFinal,
        tipo_victoria: winMethod,
        points_ganados: pointsGanados,
        transaction_id: transactionId,
        timestamp: new Date().toISOString(),
      };
      
      console.log('Syncing to CRM:', crmData);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSyncedToCRM(true);
      
      if (transactionId) {
        supabase
          .from('transactions')
          .update({ synced_to_crm: true, crm_sync_timestamp: new Date().toISOString() })
          .eq('tx_id', transactionId)
          .then(({ error }) => {
            if (error) console.error('Error updating transaction sync status:', error);
          });
      }
    } catch (error) {
      console.error('Error syncing to CRM:', error);
    }
  }, [matchPlayers, setSyncedToCRM]);

  useEffect(() => {
    const winner = state.winner;
    if (winner && !hasSavedResult.current) {
      hasSavedResult.current = true;
      console.log('WINNER detected:', winner);
      
      // Calculate Win Method & Score
      const loser = winner === 'white' ? 'black' : 'white';
      const offWhiteSize = state.board[28] || 0;
      const offBlackSize = Math.abs(state.board[29] || 0);
      const loserOffCount = loser === 'white' ? offWhiteSize : offBlackSize;
      
      let method: 'normal' | 'gammon' | 'backgammon' = 'normal';
      let multiplier = 1;

      if (loserOffCount === 0) {
        // Potential Gammon or Backgammon
        // Check if loser has pieces in winner's home or on bar
        const isWhiteWinner = state.winner === 'white';
        const loserBarIdx = isWhiteWinner ? 27 : 26; // Black Bar or White Bar
        const winnerHomeStart = isWhiteWinner ? 1 : 19;
        const winnerHomeEnd = isWhiteWinner ? 6 : 24;
        
        let piecesInWinnerHome = Math.abs(state.board[loserBarIdx] || 0);
        for (let i = winnerHomeStart; i <= winnerHomeEnd; i++) {
          const val = state.board[i] || 0;
          if ((isWhiteWinner && val < 0) || (!isWhiteWinner && val > 0)) {
            piecesInWinnerHome += Math.abs(val);
          }
        }

        if (piecesInWinnerHome > 0) {
          method = 'backgammon';
          multiplier = 3;
        } else {
          method = 'gammon';
          multiplier = 2;
        }
      }

      const finalScore = state.cube * multiplier;
      const totalGanado = stakeInicial * state.cube * multiplier;
      
      // Process match result in Supabase (update wallets, create transactions)
      if (initialRoomId && matchPlayers.white && matchPlayers.black) {
        // Guard: only query matches if room_id looks like a real UUID.
        // room_id values like 'match_1771847267632_cf8m1gv' are NOT UUIDs and
        // cause a 22P02 / 400 error from PostgREST when passed to a uuid column.
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(initialRoomId)) {
          console.info('[GameBoard] room_id is not a UUID — skipping matches update after game end:', initialRoomId);
        } else
        // First, get match_id from room_id
        supabase
          .from('matches')
          .select('id')
          .eq('room_id', initialRoomId)
          .single()
          .then(({ data: matchData, error: matchError }) => {
            if (matchError || !matchData) {
              console.warn('[GameBoard] Match row not found for room_id (game-end update skipped):', matchError?.message);
              return;
            }
            
            const matchId = matchData.id;
            
            // Update match record
            supabase
              .from('matches')
              .update({
                status: 'finished',
                winner_id: matchPlayers[winner],
                winner_color: winner,
                cube_value: state.cube,
                win_method: method,
                final_score: finalScore,
                stake_inicial: stakeInicial, // Ensure it's preserved/set
                bet_amount: stakeInicial,    // Trigger uses this for payout calculation
                winner_payout: totalGanado,
                finished_at: new Date().toISOString(),
              })
              .eq('id', matchId)
              .then(({ error }) => {
                if (error) {
                  console.error('Error updating match:', error);
                  return;
                }
                
                // Process wallet updates
                supabase
                  .rpc('process_match_result', { p_match_id: matchId })
                  .then(({ error }) => {
                    if (error) {
                      console.error('Error processing match result:', error);
                    } else {
                      // Insert game log
                      supabase.from('game_logs').insert({
                        winner: winner,
                        winner_color: winner,
                        loser_color: loser,
                        win_method: method,
                        score_delta: totalGanado,
                        played_at: new Date().toISOString(),
                        white_player_id: matchPlayers.white,
                        black_player_id: matchPlayers.black,
                        board_hash: 0,
                        move_chosen: { type: 'normal_win', final_score: finalScore },
                      }).then(({ error: logError }) => {
                        if (logError) console.error('Error logging game:', logError);
                      });

                      // Get transaction ID
                      supabase
                        .from('transactions')
                        .select('tx_id')
                        .eq('match_id', matchId)
                        .eq('user_id', matchPlayers[winner])
                        .eq('tipo', 'win')
                        .order('timestamp', { ascending: false })
                        .limit(1)
                        .single()
                        .then(({ data }) => {
                          if (data) {
                            setTransactionId(data.tx_id);
                            // Sync to CRM
                            syncToCRM(initialRoomId, winner, loser, stakeInicial, state.cube, method, totalGanado, data.tx_id);
                          }
                        });
                    }
                  });
              });
          });
      }
      else if (isVsComputer && winner) {
        // AI Logic: Handle Human Win or Loss
        // CRITICAL FIX: Use myColor (the human's actual chosen color) instead of hardcoding 'white'.
        // The player can choose red/black checkers via the Octagon Menu. If a player chose 'black'
        // and won, winner==='black' but the old code produced userWon=false → wrongly DEDUCTED points.
        const humanColor = myColor ?? myColorRef.current ?? 'white';
        const userWon = winner === humanColor;
        // Ensure totalGanado is always positive - it's the ABSOLUTE value of points at stake
        const pointsAtStake = Math.abs(totalGanado);
        
        console.log(`[AI Game End] Winner: ${winner}, HumanColor: ${humanColor}, UserWon: ${userWon}, Points: ${pointsAtStake}, Cube: ${state.cube}`);
        
        // Trigger epic win/lose taunt (Phase 4)
        generateGameSummary(state.game_id, winner, method)
          .then((epicTaunt: string | null) => {
            if (epicTaunt) {
              triggerTaunt(userWon ? 'lose' : 'win'); // AI 'loses' when user wins, AI 'wins' when user loses
            }
          })
          .catch((err: Error) => {
            console.error("Epic taunt generation failed", err);
          });
        
        // Only process wallet/transactions if user is logged in
        if (user?.id) {
          supabase
            .rpc('process_ai_match', { p_amount: pointsAtStake, p_user_won: userWon, p_user_id: user.id })
            .then(async ({ error }) => {
              if (error) {
                console.error('Error processing AI match:', error);
              } else {
                console.log('AI Match processed successfully');
                if (wallet.refresh) wallet.refresh();
              }
            });
        }
        
        // Persist to CRM via AI Worker
        notifyGameEnd(
          winner,
          loser,
          method,
          finalScore,
          state.board,
          matchPlayers.white,
          matchPlayers.black
        );

        logTelemetry('GAME_END', { winner, method, score: finalScore, totalGanado });
        
        // SELF-CRITICISM: Log for future AI training
        logGameResult(
          state.game_id || '00000000-0000-0000-0000-000000000000',
          winner,
          method,
          state.board,
          computerPlayer
        );
      }
    }
  }, [state.winner, state.cube, state.board, user, matchPlayers.white, matchPlayers.black, notifyGameEnd, initialRoomId, matchPlayers, stakeInicial, syncToCRM, isVsComputer, wallet, triggerTaunt, state.game_id, myColor, computerPlayer]);
  
  // RESET SAVE FLAG ON NEW GAME
  useEffect(() => {
    if (!state.winner) {
      hasSavedResult.current = false;
    }
  }, [state.winner]);

  // Import rollDice utility at top if not imported, or just use Math.random here?
  // Better to use the utility. I need to check imports.
  // Assuming rollDice is available or imported.
  // Wait, rollDice is in utils.ts. I need to import it.
  
  const handleRollDice = useCallback(() => {
    // ENFORCE TURN: Only roll if it's my turn OR if it's the computer's turn in AI mode!
    const isComputerTurn = isVsComputer && state.dice.length === 0 && state.turn === computerPlayer; // Dynamic computer player
    if (!isTurnActive && !isComputerTurn) {
        console.warn('Cannot roll dice: Not your turn!');
        return;
    }

    // BLOCK ROLL IF DOUBLE OFFER IS PENDING
    const isDoubleOffered = state.cubeOwner === null && state.cube > 1;
    if (isDoubleOffered) {
        console.warn('Cannot roll dice: Double offer is pending. Accept or reject the double first.');
        return;
    }
    
    startTransition(() => {
      console.log('[GameBoard] handleRollDice triggered. Turn Active?', isTurnActive);
      
      const dice = rollDice();
      console.log('[GameBoard] Rolling Dice:', dice);

      // 2. Dispatch Local
      dispatch({ type: 'ROLL_DICE', dice });
      
      // 3. Broadcast Network
broadcastGameUpdate('ROLL_DICE', { dice });
    });
    
    // AI Taunts based on who's rolling
    if (isVsComputer) {
      if (isComputerTurn) {
        // AI rolling - sassy comments (DISABLED to prevent double comments with 'thinking')
        // triggerTaunt(aiRollingTaunts, 'roll');
      } else if (isTurnActive) {
        // User rolling - sassy comments (DISABLED to prevent double comments with user moves)
        // triggerTaunt(userRollingTaunts, 'roll');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, broadcastGameUpdate, isTurnActive, isVsComputer, state.turn, state.dice.length, state.cubeOwner, state.cube, triggerTaunt]);

  const handleNewGame = useCallback(() => {
    // 1. Clear the stake reservation so the new game starts fresh
    if (user?.id) {
      const storageKey = initialRoomId 
        ? `vivo_bet_${initialRoomId}_${user.id}`
        : `vivo_bet_ai_${user.id}`;
      localStorage.removeItem(storageKey);
      hasReservedStake.current = false;
    }

    // 2. Start a 10-second countdown for DB sync, then reset the game
    setNewGameCountdown(10);
    let count = 10;
    const countdownTimer = setInterval(() => {
      count -= 1;
      setNewGameCountdown(count);
      if (count <= 0) {
        clearInterval(countdownTimer);
        setNewGameCountdown(null);
        startTransition(() => {
          dispatch({ type: 'NEW_GAME' });
          broadcastGameUpdate('NEW_GAME');
        });
      }
    }, 1000);
  }, [dispatch, broadcastGameUpdate, initialRoomId, user?.id]);

  const handleUndo = useCallback(() => {
    startTransition(() => {
      dispatch({ type: 'UNDO_MOVE' });
      broadcastGameUpdate('UNDO_MOVE');
    });
  }, [dispatch, broadcastGameUpdate]);

  // Doubling Cube Handlers
  const handleDropDouble = useCallback(() => {
    startTransition(() => {
      dispatch({ type: 'DROP_DOUBLE' });
      broadcastGameUpdate('DROP_DOUBLE');
      
      // Add to history and update messages
      const actorColor = state.turn;
      const loserColor = actorColor;
      const winnerColor = actorColor === 'white' ? 'black' : 'white';
      const previousCubeValue = state.cube / 2;
      const totalLost = stakeInicial * previousCubeValue;
      
      const message = `${actorColor === 'white' ? 'BLANCAS' : 'ROJAS'} rechazan el doble (pierden automáticamente)`;
      setBettingMessages(prev => [...prev, message]);
      
      // Add to cube history
      if (initialRoomId && user?.id && matchPlayers[actorColor]) {
        cubeHistory.addHistoryEntry(
          initialRoomId,
          matchPlayers[actorColor]!,
          actorColor,
          'deny',
          state.cube,
          state.cubeOwner,
          null
        ).catch(console.error);
      }
      
      // Process financial result immediately when double is rejected
      if (initialRoomId && matchPlayers.white && matchPlayers.black) {
        // First, get match_id from room_id
        supabase
          .from('matches')
          .select('id')
          .eq('room_id', initialRoomId)
          .single()
          .then(({ data: matchData, error: matchError }) => {
            if (matchError || !matchData) {
              console.error('Error fetching match on drop:', matchError);
              return;
            }
            
            const matchId = matchData.id;
            
            // Update match record
            supabase
              .from('matches')
              .update({
                status: 'finished',
                winner_id: matchPlayers[winnerColor],
                winner_color: winnerColor,
                cube_value: previousCubeValue,
                win_method: 'normal',
                final_score: previousCubeValue,
                winner_payout: totalLost,
                finished_at: new Date().toISOString(),
              })
              .eq('id', matchId)
              .then(({ error }) => {
                if (error) {
                  console.error('Error updating match on drop:', error);
                  return;
                }
                
                // Process wallet updates
                supabase
                  .rpc('process_match_result', { p_match_id: matchId })
                  .then(({ error }) => {
                    if (error) {
                      console.error('Error processing match result on drop:', error);
                    } else {
                      // Get transaction ID
                      supabase
                        .from('transactions')
                        .select('tx_id')
                        .eq('match_id', matchId)
                        .eq('user_id', matchPlayers[winnerColor])
                        .eq('tipo', 'win')
                        .order('timestamp', { ascending: false })
                        .limit(1)
                        .single()
                        .then(({ data }) => {
                          if (data) {
                            setTransactionId(data.tx_id);
                            // Sync to CRM
                            syncToCRM(
                              initialRoomId,
                              winnerColor,
                              loserColor,
                              stakeInicial,
                              previousCubeValue,
                              'normal',
                              totalLost,
                              data.tx_id
                            );
                          }
                        });
                    }
                  });
              });
          });
      }
    });
  }, [dispatch, broadcastGameUpdate, state.turn, state.cube, state.cubeOwner, initialRoomId, user?.id, matchPlayers, cubeHistory, stakeInicial, syncToCRM]);
  
  const handleAcceptDouble = useCallback(() => {
    startTransition(() => {
      dispatch({ type: 'TAKE_DOUBLE' });
      broadcastGameUpdate('TAKE_DOUBLE');
      
      // Update reserved stake for both players
      const newStake = stakeInicial * state.cube * 2;
      if (user?.id) {
        wallet.updateReservedStake(newStake).catch(console.error);
      }
      
      // Add to history and update messages
      const actorColor = state.turn;
      const message = `${actorColor === 'white' ? 'BLANCAS' : 'ROJAS'} aceptan el doble`;
      setBettingMessages(prev => [...prev, message]);
      
      // Add to cube history
      if (initialRoomId && user?.id && matchPlayers[actorColor]) {
        cubeHistory.addHistoryEntry(
          initialRoomId,
          matchPlayers[actorColor]!,
          actorColor,
          'accept',
          state.cube * 2,
          null,
          actorColor
        ).catch(console.error);
      }
    });
  }, [dispatch, broadcastGameUpdate, state.turn, state.cube, stakeInicial, user?.id, wallet, initialRoomId, matchPlayers, cubeHistory, setBettingMessages]);
  
  const handleOfferDoubleAction = useCallback(() => {
    startTransition(() => {
      dispatch({ type: 'OFFER_DOUBLE' });
      broadcastGameUpdate('OFFER_DOUBLE');
      
      // Update reserved stake
      const newStake = stakeInicial * state.cube * 2;
      if (user?.id) {
        wallet.updateReservedStake(newStake).catch(console.error);
      }
      
      // Add to history and update messages
      const actorColor = state.turn;
      const message = `${actorColor === 'white' ? 'BLANCAS' : 'ROJAS'} ofrecen doblar a x${state.cube * 2}`;
      setBettingMessages(prev => [...prev, message]);
      
      // Add to cube history
      if (initialRoomId && user?.id && matchPlayers[actorColor]) {
        cubeHistory.addHistoryEntry(
          initialRoomId,
          matchPlayers[actorColor]!,
          actorColor,
          'offer',
          state.cube * 2,
          state.cubeOwner,
          null
        ).catch(console.error);
      }
    });
  }, [dispatch, broadcastGameUpdate, state.turn, state.cube, state.cubeOwner, stakeInicial, user?.id, wallet, initialRoomId, matchPlayers, cubeHistory, setBettingMessages]);

  // Auto-trigger AI if it's computer's turn
  useEffect(() => {
    // 1. SAFETY CHECKS
    if (
      isVsComputer && 
      state.turn === computerPlayer && 
      !isThinking && 
      !isPending && 
      !state.needsTurnConfirmation &&
      !aiLockRef.current &&    // Check Lock
      state.dice.length > 0
    ) {
        const availableDice = getAvailableDice(state.dice, state.usedDice);
        if (availableDice.length > 0) {
           triggerAIMove(state.board, availableDice, state);
        }
    }
    
    // Cleanup: Unlock on unmount
    return () => {
        // We do *not* unlock here because unmount might happen during strict mode re-run
        // safely handled by timeout in triggerAIMove
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- state tracked via granular properties to avoid infinite re-renders
  }, [state.board, state.turn, state.dice, state.usedDice, isVsComputer, isThinking, isPending, state.needsTurnConfirmation, triggerAIMove]);

  // Auto-Roll for AI (but not if double is offered)
  useEffect(() => {
    const isDoubleOffered = state.cubeOwner === null && state.cube > 1;
    if (isVsComputer && state.turn === computerPlayer && state.dice.length === 0 && !isPending && !isThinking && !isDoubleOffered) {
        const timer = setTimeout(() => {
            handleRollDice();
        }, 500); // 0.5s after turn start
        return () => clearTimeout(timer);
    }
  }, [state.turn, state.dice.length, isVsComputer, isPending, isThinking, state.cubeOwner, state.cube, handleRollDice, computerPlayer]);

  // AI Response to Double Offers
  useEffect(() => {
    const isDoubleOffered = state.cubeOwner === null && state.cube > 1;
    
    // If it's AI's turn and there's a double offer pending (user offered double)
    // AI should respond (accept or reject)
    if (isVsComputer && isDoubleOffered && state.turn === computerPlayer && state.dice.length === 0 && !isThinking && !isPending) {
        const timer = setTimeout(() => {
            // AI always accepts doubles for now (simple logic)
            console.log('[AI] Accepting double offer!');
            triggerTaunt('double');
            startTransition(() => {
                dispatch({ type: 'TAKE_DOUBLE' });
                broadcastGameUpdate('TAKE_DOUBLE');
            });
        }, 1500); // AI thinks for 1.5s before responding
        return () => clearTimeout(timer);
    }
  }, [state.turn, state.cubeOwner, state.cube, state.dice.length, isVsComputer, isThinking, isPending, dispatch, broadcastGameUpdate, triggerTaunt, computerPlayer]);

  return (
    <div ref={rootRef} className={`
        relative grid h-screen w-full overflow-hidden bg-[#0a0a0a]
        transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]
        grid-cols-1 ${isSidebarOpen ? 'lg:grid-cols-[20rem_1fr]' : 'lg:grid-cols-[0px_1fr]'}
        [transform:translateZ(0)]
    `}>
      {insufficientFunds && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-panel border border-rose-500/50 p-6 rounded-2xl max-w-sm text-center shadow-[0_0_50px_rgba(244,63,94,0.3)]">
            <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-rose-500 mb-2 font-display">¡Saldo Insuficiente!</h2>
            <p className="text-muted-foreground mb-6">
              No tienes suficientes puntos para cubrir la apuesta inicial de esta partida ({stakeInicial} puntos).
            </p>
            {wallet.saldo_reservado > 0 && (
              <button
                onClick={async () => {
                  // Call the new server-side RPC that safely releases orphaned stakes.
                  // It checks there's no active game in the last 10 min before releasing.
                  const { data, error } = await supabase.rpc('recover_my_stakes');
                  if (error) {
                    console.error('[Recuperar] RPC error:', error.message);
                    alert('No se pudieron liberar los puntos: ' + error.message);
                    return;
                  }
                  if (!data?.success) {
                    // Server says no: active game still detected
                    alert(data?.error ?? 'No se pueden liberar los puntos ahora mismo.');
                    return;
                  }
                  // Success — refresh wallet in place, dismiss modal
                  await wallet.refresh();
                  setInsufficientFunds(false);
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-all mb-3 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer"
              >
                Recuperar {wallet.saldo_reservado} Puntos Atrapados
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition-all cursor-pointer"
            >
              Volver al Lobby
            </button>
          </div>
        </div>
      )}

      {/* ── 10-second New Game Countdown ───────────────────────────────── */}
      {newGameCountdown !== null && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6">
            {/* Countdown ring */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="#1a1a1a" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="54" fill="none"
                  stroke="#f59e0b" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 54}`}
                  strokeDashoffset={`${2 * Math.PI * 54 * (newGameCountdown / 10)}`}
                  strokeLinecap="round"
                  className="transition-all duration-1000"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-5xl font-black text-amber-400 tabular-nums">
                {newGameCountdown}
              </span>
            </div>
            <div className="text-center space-y-1">
              <p className="text-white font-bold text-lg">Sincronizando datos…</p>
              <p className="text-muted-foreground text-sm">La nueva partida comenzará en {newGameCountdown}s</p>
            </div>
          </div>
        </div>
      )}

      {initialMode === 'human' && !isOpponentPresent && connectionStatus !== 'connected' && !state.winner && !opponentAbandoned && !insufficientFunds && (
        <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="bg-panel border border-emerald-500/30 p-8 rounded-2xl max-w-md text-center shadow-[0_0_40px_rgba(16,185,129,0.2)] animate-pulse pointer-events-auto">
            <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2 font-display">Esperando a tu oponente...</h2>
            <p className="text-emerald-400/80">
              La partida comenzará automáticamente cuando tu oponente se conecte a la sala.
            </p>
          </div>
        </div>
      )}

      {showCalibration && (
        <CalibrationOverlay 
          onClose={() => setShowCalibration(false)} 
          boardGeometry={dimensions}
          onCalibrate={(points) => {
            console.log("Calibrated:", points);
            localStorage.setItem('vivo_calibration', JSON.stringify(points));
            setIsHandTracking(true);
          }}
        />
      )}

      {/* Hand Tracking Layer (Background Video Only) or Crystal Video Layer */}
      {/* Z-0: Behind everything (Sidebar, Board, etc.) */}
      
      {/* CASE 1: CRYSTAL WINDOW MODE */}
      {isCrystalEnabled && (
         <VideoLayer 
            stream={remoteStream} 
            metrics={metrics}
            // connectionStatus={connectionStatus} // Removed as prop was removed from component
            className="z-0" 
         />
      )}

      {/* CASE 2: LEGACY HAND TRACKING VIDEO (Only if Crystal is OFF) */}
      {/* If Crystal is ON, HandTrackingLayer should NOT show video, only tracking, 
          OR we rely on HandTrackingLayer for local self-view feedback in a corner? 
          For Sprint 1: We stick to the plan -> Remote Video is Background. Local Hand is invisible/ghost. 
          But wait, HandTrackingLayer usually shows the LOCAL camera as background. 
          In Crystal Window, the LOCAL camera is the "User's Eyes". It shouldn't be rendered full screen 
          unless we want that AR effect. 
          Actually, the plan says: Layer 0 = Remote Video. Layer 2 = Local Hand (Ghost?).
          
          Let's MODIFY HandTrackingLayer behavior via props.
      */}

      {/* Legacy Hand Tracking Video (Background) - Disable if Crystal is active & connected? 
          Actually, if Crystal is active, we might want to HIDE the local camera background 
          because Layer 0 is the Remote Peer. 
      */}
      {/* CASE 2: LEGACY HAND TRACKING VIDEO (Only if Crystal is OFF) */}
      {isHandTracking && !showCalibration && !state.winner && !isCrystalEnabled && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <HandTrackingLayer 
            onReady={() => {}} 
            cursor={cursor}
            gesture={gesture}
            isHandActive={isHandActive}
            showVideo={true}
            showOverlay={false} 
            isActive={true} 
          />
        </div>
      )}
      
      {/* If Crystal is Enabled: 1. Invisible Local Tracker, 2. Ghost Hand Layer */}
      {isHandTracking && !showCalibration && !state.winner && isCrystalEnabled && (
         <>
             <div className="absolute opacity-0 pointer-events-none" style={{ visibility: 'hidden' }}>
                 {/* Invisible logic-only layer but needs to be in DOM for video ref */}
                 {/* Note: visibility:hidden might stop video rendering in some browsers, opacity-0 is safer */}
             </div>
             <div className="absolute inset-0 opacity-0 pointer-events-none">
                <HandTrackingLayer
                    onReady={() => {}} 
                    cursor={cursor}
                    gesture={gesture}
                    isHandActive={isHandActive}
                    showVideo={true} 
                    showOverlay={false}
                    isActive={true}
                />
             </div>
             {/* Ghost Hand Layer (Receives Data) */}
             <GhostHandLayer />
         </>
      )}

      {/* LEFT SIDEBAR - Controls & Stats */}
      {/* 2. ÁREA DE JUEGO: Sidebar en flujo normal para Desktop (LG+) */}
      <aside className="hidden lg:flex h-full border-r border-white/10 bg-black overflow-hidden relative z-40">
        <div className="w-80 h-full flex-shrink-0">
            <GameSidebar
            state={optimisticState}
            isHandTracking={isHandTracking}
            onToggleHandTracking={() => setIsHandTracking(!isHandTracking)}
            onNewGame={handleNewGame}
            onExit={() => handleExitGame('/')}
            onSetOpacity={setBoardOpacity}
            boardOpacity={boardOpacity}
            variant="sidebar"
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            isBettingMode={!!(user && initialMode === 'human')}
            stakeInicial={stakeInicial}
            myColor={myColor}
            onAcceptDouble={handleAcceptDouble}
            onDenyDouble={handleDropDouble}
            />
        </div>
      </aside>

      {/* MOBILE SIDEBAR (Drawer) - Visible on Mobile & Tablet (Portrait/Landscape < 1024px) */}
      <div className="lg:hidden">
          <GameSidebar
            state={optimisticState}
            isHandTracking={isHandTracking}
            onToggleHandTracking={() => setIsHandTracking(!isHandTracking)}
            onNewGame={handleNewGame}
            onExit={() => handleExitGame('/')}
            onSetOpacity={setBoardOpacity}
            boardOpacity={boardOpacity}
            variant="drawer"
            isOpen={isSidebarOpen}
            onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
            isBettingMode={!!(user && initialMode === 'human')}
            stakeInicial={stakeInicial}
            myColor={myColor}
            onAcceptDouble={handleAcceptDouble}
            onDenyDouble={handleDropDouble}
          />
      </div>

      {/* MAIN GAME AREA */}
      {/* Crystal Window: Transparent Background when enabled */}
      <main className={`relative h-full flex items-center justify-center overflow-hidden ${isCrystalEnabled || isHandTracking ? 'bg-transparent' : 'bg-[#0a0a0a]'}`}>
        
        {/* Open Sidebar Button (Visible when closed) */}
        <AnimatePresence>
          {!isSidebarOpen && (
               <motion.button 
                  initial={{ x: -100, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -100, opacity: 0 }}
                  onClick={() => setIsSidebarOpen(true)}
                  className="absolute top-4 left-4 z-[60] p-4 bg-[#cc0000] text-white rounded-xl border border-white/20 shadow-[0_0_20px_rgba(204,0,0,0.4)] hover:bg-[#ff0000] hover:scale-105 active:scale-95 transition-all hidden lg:flex items-center gap-2 group"
                  title="Abrir Menú"
               >
                  <PanelLeftClose className="rotate-180" size={20} />
                  <span className="text-[10px] font-black uppercase tracking-widest overflow-hidden w-0 group-hover:w-16 transition-all duration-300">MENÚ</span>
               </motion.button>
          )}
        </AnimatePresence>

        {/* TURN INDICATOR REMOVED PER USER REQUEST */}

        <div 
          className="relative w-full h-full max-w-[100vw] max-h-[100vh] flex items-center justify-center p-2 landscape:px-32 lg:p-6 lg:px-6 pb-4 lg:pb-6"
          style={{
             paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' // Reduced mobile bottom space
          }}
        >
          {/* Eliminado: Equity Bar. Gemini devuelve resultados erróneos de la posición. */}
          {/* ── LEFT FAB STRIP: Roll Dice + Undo ─────────────────────────────────
               Always visible on the left edge of the game area (all screen sizes).
               On desktop the full sidebar already has these, but they're still
               useful as quick-access buttons without opening the sidebar.
               Positioned so they don't overlap the board on any breakpoint. */}
          <div
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 pointer-events-auto"
            style={{ left: 'max(0.5rem, env(safe-area-inset-left))' }}
          >
            {/* Roll Dice FAB */}
            {optimisticState.dice.length === 0 && !state.winner && isTurnActive && !(state.cubeOwner === null && state.cube > 1) && (
              <DiceButton
                onClick={handleRollDice}
                disabled={isPending}
                size="md"
                className="shadow-2xl"
              />
            )}
            {/* Undo FAB */}
            {optimisticState.history.length > 0 && (
              <button
                onClick={handleUndo}
                aria-label="Deshacer"
                className="w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-zinc-800/90 hover:bg-zinc-700 border border-white/10 active:scale-95 text-white shadow-lg flex items-center justify-center transition-all duration-200"
              >
                <RotateCcw size={18} />
              </button>
            )}
            
            {/* Coach Hint FAB - Only available in AI Mode */}
            {isVsComputer && optimisticState.dice.length > 0 && !state.winner && state.turn === myColor && (
              <button
                onClick={handleRequestHint}
                aria-label="Pedir Pista"
                disabled={isHintLoading}
                className={"w-12 h-12 lg:w-14 lg:h-14 rounded-2xl bg-amber-500/90 hover:bg-amber-400 border border-amber-300/50 active:scale-95 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)] flex items-center justify-center transition-all duration-200 " + (isHintLoading ? "animate-pulse" : "")}
              >
                 {/* Verified against Error Log: [H2H pedagogical leakage] avoided. */}
                 <span className="text-xl lg:text-2xl">💡</span>
              </button>
            )}
          </div>
          
           <Board 
           state={optimisticState} 
           selectedPoint={selectedPoint}
           validTargetPoints={validTargetPoints}
           myColor={myColor}
           onPointTap={(pointId) => {
              if (!isTurnActive) return; // Prevent move if not my turn
              if (validTargetPoints.includes(pointId)) {
                  executeMove(pointId);
              } else {
                  selectPiece(pointId);
              }
           }}
           onCheckerTap={(pointId) => {
               if (!isTurnActive) return; // Prevent move if not my turn
               if (validTargetPoints.includes(pointId)) {
                   executeMove(pointId); 
               } else {
                   selectPiece(pointId);
               }
            }}
            onCubeClick={() => {
              if (!state.winner && user) {
                setShowDoublingModal(true);
              }
            }}
            onAcceptDouble={handleAcceptDouble}
            onDenyDouble={handleDropDouble}
            isTrainingMode={isTrainingModeActive}
            containerRef={containerRef}
            dimensions={dimensions}
            getPixelCoordinates={getPixelCoordinates}
            boardOpacity={boardOpacity}
            isPending={isPending}
          />
         
         {/* Betting Info - Mobile version (right side) REMOVED — now inside sidebar */}

         {/* Compact Bet Badge — number only, no label, no subtitle.
              Positioned absolute-center so it floats just below the doubling cube
              in the middle vertical band of the board. Uses clamp() so it auto-scales
              from iPhone SE (375px) to 4K without media queries. H2H auth only. */}
         {/* Bet badge removed — stake amount shown inline in BettingStatusBar at the bottom */}
    </div>

         {/* Dice Overlay */}
         <div 
            className={`
                absolute right-2 md:right-8 top-1/2 -translate-y-1/2 pointer-events-none z-[70] flex flex-col gap-4
                transition-all duration-500 ease-in-out
                ${showConfirmationModal ? 'opacity-50' : 'opacity-100'}
                ${state.turn === myColor 
                    ? 'scale-100 opacity-100' // My Turn: Fully visible
                    : 'scale-90 opacity-60'   // Opponent Turn: Slightly smaller/faded
                }
            `}
         >
             {/* New Connect Button (Manual Trigger for Peer Connection) */}
             {isCrystalEnabled && connectionStatus === 'new' && (
                 <button 
                    onClick={() => startCall()}
                    className="pointer-events-auto px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl shadow-2xl animate-pulse text-xl uppercase tracking-widest z-[80]"
                 >
                    Start Call (Connect)
                 </button>
             )}

             {/* DESKTOP ROLL BUTTON REMOVED PER USER REQUEST - Using Small Button Only */}

            {(() => {
              const usedCounts: Record<number, number> = {};
              state.usedDice.forEach(d => usedCounts[d] = (usedCounts[d] || 0) + 1);

              return state.dice.map((die, i) => {
                const count = usedCounts[die] || 0;
                const isUsed = count > 0;
                if (isUsed) {
                  usedCounts[die] = count - 1;
                }

                const isWhiteTurn = state.turn === 'white';
                const dieBg = isWhiteTurn 
                    ? 'linear-gradient(135deg, #fff 0%, #e0e0e0 100%)'
                    : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)';
                
                const dotColor = isWhiteTurn ? 'text-black' : 'text-white';
                const borderColor = isWhiteTurn ? 'border-gray-300' : 'border-red-900';

                return (
                  <div 
                    key={`die-${i}-${state.dice.join('')}`}
                    className={`
                      w-[clamp(28px,12vw,64px)] h-[clamp(28px,12vw,64px)] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center
                      text-[clamp(1rem,8vw,2.25rem)] font-black ${dotColor} border-2 ${borderColor}
                      ${isUsed ? 'opacity-40 grayscale blur-sm' : 'opacity-100 scale-110'}
                      animate-[diceRoll_2s_ease-out_forwards]
                    `}
                    style={{
                      background: dieBg,
                      boxShadow: isUsed ? 'none' : '0 20px 40px rgba(0,0,0,0.4), inset -2px -2px 5px rgba(0,0,0,0.1)'
                    }}
                  >
                    <style>{`
                      @keyframes diceRoll {
                        0% { transform: translateY(-300px) rotate(720deg) scale(0.5); opacity: 0; }
                        60% { transform: translateY(20px) rotate(10deg) scale(1.1); opacity: 1; }
                        80% { transform: translateY(-10px) rotate(-5deg) scale(1.05); }
                        100% { transform: translateY(0) rotate(0) scale(1.1); }
                      }
                    `}</style>
                    {die}
                  </div>
                );
              });
            })()}
         </div>

          {/* Waiting Message REMOVED Per User Request */}

{/* AI Status */}
          {isThinking && (
               <div className="absolute top-8 right-8 z-[90] flex items-center gap-3 bg-cyan-500/20 px-6 py-3 rounded-full border border-cyan-500/30 backdrop-blur-md animate-pulse">
                 <Cpu size={20} className="text-cyan-400 animate-spin" /> 
                 <span className="text-cyan-300 text-xs font-black uppercase tracking-widest">IA PENSANDO...</span>
               </div>
          )}

          {/* AI Taunt Bubble - Shows sassy AI comments */}
          <AiTauntBubble isVisible={showTaunt} message={tauntMessage} />

         {/* Turn Confirmation Modal — compact, board-scoped, doesn't cover whole board */}
         {showConfirmationModal && (
            <div className={`
                absolute inset-0 z-50 flex items-end justify-center pb-[clamp(5rem,14vh,11rem)]
                transition-opacity duration-300 ease-in-out pointer-events-none
                ${isFadingOut ? 'opacity-0' : 'opacity-100'}
            `}>
               <div className="bg-zinc-900/95 border border-white/10 px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200 pointer-events-auto mx-4 max-w-[260px] w-full">
                  <p className="text-sm font-black text-white uppercase tracking-wider text-center">
                     {optimisticState.dice.length > optimisticState.usedDice.length ? 'Sin movimientos' : 'Turno listo'}
                  </p>
                  <button 
                    onClick={() => {
                        setIsFadingOut(true);
                          setTimeout(() => {
                            startTransition(() => {
                                dispatch({ type: 'CONFIRM_TURN_END' });
                                broadcastGameUpdate('CONFIRM_TURN_END');
                            });
                          }, 200);
                    }}
                    className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold uppercase tracking-widest rounded-xl transition-all shadow-[0_0_16px_rgba(6,182,212,0.4)] cursor-pointer text-xs"
                  >
                    CONFIRMAR
                  </button>
               </div>
            </div>
         )}
         
         {/* Debug Ripple */}
         {lastTouch && (
            <div 
              className="fixed pointer-events-none z-[100] w-12 h-12 rounded-full border-4 border-cyan-400 animate-ping"
              style={{ left: lastTouch.x, top: lastTouch.y, transform: 'translate(-50%, -50%)' }}
            />
         )}

          {/* Player Betting Indicators - Only if authenticated */}
          {user && initialMode === 'human' && matchPlayers.white && matchPlayers.black && (
            <div className="absolute top-4 left-4 right-4 flex justify-between z-50 pointer-events-none">
              <div className="w-48">
                <PlayerBettingIndicator
                  playerColor="white"
                  playerName="BLANCAS"
                  saldo={myColor === 'white' ? wallet.saldo_actual : opponentWallet.saldo}
                  apuestaReservada={myColor === 'white' ? wallet.saldo_reservado : opponentWallet.apuestaReservada}
                  isMyColor={myColor === 'white'}
                />
              </div>
              <div className="w-48">
                <PlayerBettingIndicator
                  playerColor="black"
                  playerName="ROJAS"
                  saldo={myColor === 'black' ? wallet.saldo_actual : opponentWallet.saldo}
                  apuestaReservada={myColor === 'black' ? wallet.saldo_reservado : opponentWallet.apuestaReservada}
                  isMyColor={myColor === 'black'}
                />
              </div>
            </div>
          )}

          {/* Cube History Column — LEFT side, hidden on mobile to prevent board overlap.
               Responsive layout:
               - Mobile (<lg): hidden completely (no board overlap, no freeze)
               - Tablet/Desktop (lg+): narrow column on left, below the BettingInfo slot
               - Uses pointer-events-none on wrapper, auto on the card itself so it doesn't block board touches
               Only shown in H2H mode for authenticated users. */}
          {user && initialMode === 'human' && (
            <div className="hidden lg:block absolute left-2 xl:left-4 top-1/2 -translate-y-1/2 z-40 pointer-events-none"
                 style={{ width: 'clamp(140px, 12vw, 192px)', maxHeight: 'calc(100dvh - 12rem)' }}>
              <div className="h-full bg-black/40 backdrop-blur-md rounded-xl border border-amber-700/30 p-3 pointer-events-auto overflow-hidden flex flex-col gap-2">
                <div className="text-[10px] font-bold text-amber-200/70 uppercase tracking-widest shrink-0">
                  Historial del Cubo
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  <CubeHistory
                    entries={cubeHistory.history.map(entry => ({
                      id: entry.id,
                      actor: entry.actor,
                      accion: entry.accion,
                      valor_cubo: entry.valor_cubo,
                      timestamp: entry.timestamp,
                    }))}
                    myColor={myColor}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Betting Status Bar (Bottom) - Only if authenticated */}
          {user && (
            <div className="absolute bottom-0 left-0 right-0 z-50">
              <BettingStatusBar
                messages={bettingMessages}
                currentStake={initialMode === 'human' ? stakeInicial * state.cube : undefined}
              />
            </div>
          )}

          {/* Victory Modal - Betting Result - Only if authenticated */}
          {state.winner && user && (
            <BettingResultModal
              isOpen={!!state.winner}
              winner={state.winner}
              myColor={myColor || (user ? 'white' : null)}
              stakeInicial={stakeInicial}
              cubeFinal={state.cube}
              winMethod={(() => {
                const loser = state.winner === 'white' ? 'black' : 'white';
                const offWhiteSize = state.board[28] || 0;
                const offBlackSize = Math.abs(state.board[29] || 0);
                const loserOffCount = loser === 'white' ? offWhiteSize : offBlackSize;
                
                if (loserOffCount === 0) {
                  const isWhiteWinner = state.winner === 'white';
                  const loserBarIdx = isWhiteWinner ? 27 : 26;
                  const winnerHomeStart = isWhiteWinner ? 1 : 19;
                  const winnerHomeEnd = isWhiteWinner ? 6 : 24;
                  
                  let piecesInWinnerHome = Math.abs(state.board[loserBarIdx] || 0);
                  for (let i = winnerHomeStart; i <= winnerHomeEnd; i++) {
                    const val = state.board[i] || 0;
                    if ((isWhiteWinner && val < 0) || (!isWhiteWinner && val > 0)) {
                      piecesInWinnerHome += Math.abs(val);
                    }
                  }
                  
                  return piecesInWinnerHome > 0 ? 'backgammon' : 'gammon';
                }
                return 'normal';
              })()}
              totalGanado={stakeInicial * state.cube * (state.winner === 'white' ? 
                (state.board[29] === -15 ? ((state.board[27] ?? 0) < 0 || Array.from({length: 6}, (_, i) => state.board[19 + i] ?? 0).some(v => v < 0) ? 3 : 2) : 1) :
                (state.board[28] === 15 ? ((state.board[26] ?? 0) > 0 || Array.from({length: 6}, (_, i) => state.board[1 + i] ?? 0).some(v => v > 0) ? 3 : 2) : 1)
              )}
              onPlayAgain={handleNewGame}
              onExit={() => handleExitGame('/')}
            />
          )}

          {/* Anonymous Win/Lose Modal */}
          {state.winner && !user && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-panel border border-border rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl">
                <div className="text-6xl mb-4">
                  {state.winner === 'white' ? '🏆' : '😢'}
                </div>
                <h2 className="text-2xl font-black text-foreground mb-2">
                  {state.winner === 'white' ? '¡VICTORIA!' : 'Derrota'}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {state.winner === 'white' 
                    ? '¡Has vencido al Gran Maestro! Inicia sesión para guardar tu progreso y ganar puntos.'
                    : 'El Gran Maestro gana esta vez. Inicia sesión para seguir mejorando.'}
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={handleNewGame}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-opacity"
                  >
                    Jugar de Nuevo
                  </button>
                  <button
                    onClick={() => window.location.href = '/auth/login'}
                    className="px-6 py-3 bg-amber-500 text-white rounded-lg font-bold hover:opacity-90 transition-opacity"
                  >
                    Iniciar Sesión
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Doubling Cube Modal - Only if authenticated */}
          {user && (
            <DoublingCubeModal
              isOpen={showDoublingModal}
              onClose={() => setShowDoublingModal(false)}
              cubeValue={state.cube}
              cubeOwner={state.cubeOwner}
              myColor={myColor}
              currentTurn={state.turn}
              diceRolled={state.dice.length > 0}
              onOfferDouble={handleOfferDoubleAction}
              onTakeDouble={handleAcceptDouble}
              onDropDouble={handleDropDouble}
            />
          )}

          {/* H2H Leave Confirmation Modal */}
          {showLeaveConfirm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-all duration-300">
              <div className="bg-panel border border-border rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-xl font-black text-foreground mb-2">
                  ¿Abandonar Partida?
                </h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Si sales, perderás la partida automáticamente y tu oponente será declarado ganador.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setShowLeaveConfirm(false)}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all duration-300 cursor-pointer"
                  >
                    Continuar Jugando
                  </button>
                  <button
                    onClick={confirmLeaveGame}
                    className="px-6 py-3 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-all duration-300 cursor-pointer"
                  >
                    Salir y Perder
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* H2H Opponent Abandoned Modal */}
          {opponentAbandoned && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-all duration-300">
              <div className="bg-panel border border-border rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-xl font-black text-foreground mb-2">
                  ¡Tu oponente ha abandonado la partida!
                </h2>
                <p className="text-muted-foreground mb-6 text-sm">
                  Puedes esperar 10 segundos o reclamar la victoria ahora para recibir tus puntos.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setOpponentAbandoned(false)}
                    className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-bold hover:opacity-90 transition-all duration-300 cursor-pointer"
                  >
                    Continuar Esperando
                  </button>
                  <button
                    onClick={async () => {
                      const opponentId = matchPlayers.white === user?.id ? matchPlayers.black : matchPlayers.white;
                      if (opponentId) await handleAbandon(opponentId);
                      navigate('/');
                    }}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all duration-300 cursor-pointer"
                  >
                    Reclamar Victoria
                  </button>
                </div>
              </div>
            </div>
          )}
      </main>
      {/* Hand Tracking Layer (Foreground Cursor Only) */}
      {/* Z-100: Top of everything (Above Chips) */}
      {/* HIDE CURSOR IF GAME ENDED */}
      {isHandTracking && !showCalibration && !state.winner && (
          <div className="absolute inset-0 z-[100] pointer-events-none">
             <HandTrackingLayer 
               onReady={() => {}} // No-op, handled by background
               cursor={cursor}
               gesture={gesture}
               isHandActive={isHandActive}
               showVideo={false} // Hide Video Here
               showOverlay={true} // Show Cursor Here
               isActive={isTurnActive} // Only show overlay when actively playing
             />
          </div>
      )}
    </div>
  );
}
