import { useCallback, useEffect, useRef, useState } from 'react';
import { validateSignalPayload } from './validateSignalPayload';
import { sharedCamera } from '../../video-call/lib/sharedCamera';
import { resolveTurnConfig } from './turn';

// Signaling types
export type SignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

// Interface for the Supabase signaling channel
interface SignalingChannel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadcastMove: (move: any) => Promise<void>;
}

interface UseVideoChatProps {
  roomId: string;
  userId: string;
  signalingChannel: SignalingChannel | null;
  enabled?: boolean; // New prop to control media lifecycle
}

export function useVideoChat({ roomId, userId, signalingChannel, enabled = true }: UseVideoChatProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<RTCPeerConnectionState>('new');
  /* Observability Metrics */
  const [metrics, setMetrics] = useState({
     rtt: 0,
     packetLoss: 0,
     fps: 0,
     resolution: '0x0'
  });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]); // NEW: Queue for early candidates
  const unsubscribeSharedRef = useRef<(() => void) | null>(null);
  // Tracks whether the LOCAL outgoing video is muted (camera button). Lets
  // ensureSharedTracks avoid re-attaching the video track while the user
  // intentionally muted it. NEVER touches track.enabled (that would freeze
  // the shared camera / hand tracking).
  const videoMutedRef = useRef(false);
  
  // Rate limiting for connection attempts
  const lastConnectionAttemptRef = useRef<number>(0);

  // Initialize Media (Camera/Mic) — uses the app-wide SHARED camera so the
  // hand tracking and the call never fight over getUserMedia (móvil fix).
  useEffect(() => {
    let isMounted = true;
    let hasClaim = false;

    // If disabled, just return (cleanup of previous effect handles releasing)
    if (!enabled) return;

    const startMedia = async () => {
      try {
        const stream = await sharedCamera.acquire({ video: true, audio: true, mode: 'call' });
        if (!isMounted) {
          sharedCamera.release('call');
          return;
        }
        hasClaim = true;
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        if (isMounted) {
          console.warn('[VideoChat] Media access denied or unavailable. Video features will be disabled, but data sync will continue:', err);
        }
      }
    };

    console.log('[VideoChat] startMedia initiated (shared camera). Enabled:', enabled);

    startMedia();

    return () => {
      isMounted = false;
      if (hasClaim) {
        sharedCamera.release('call');
      }
      localStreamRef.current = null;
      setLocalStream(null);
    };
  }, [enabled]);

  // Keep localStream state in sync if the shared stream is (re)created elsewhere
  useEffect(() => {
    return sharedCamera.subscribe(() => {
      setLocalStream((current) => {
        const shared = sharedCamera.getStream('call');
        if (shared && shared !== current) return shared;
        return current;
      });
    });
  }, []);

  // Build (or rebuild) the PeerConnection with all handlers + shared tracks.
  // Called once on mount (via effect) AND by startCall after a hangUp closes
  // the previous PC (F3 fix: lets the user re-enable the camera for a new call).
  // Deliberately does NOT depend on localStream, so it does not re-run when the
  // media stream arrives (avoids the F!3 teardown race).
  const setupPeerConnection = useCallback((): RTCPeerConnection | null => {
    if (!roomId || !userId || !signalingChannel) {
      console.log('[VideoChat] Skipping PC init. Missing deps:', { roomId, userId, hasSignaling: !!signalingChannel });
      return null;
    }

    // Cleanup a previous PC (re-created after hangUp/failure) so we never leak
    // shared-camera subscriptions or stats intervals. F3-gap: without this,
    // every startCall/handleSignal rebuild would stack listeners.
    if (unsubscribeSharedRef.current) {
      unsubscribeSharedRef.current();
      unsubscribeSharedRef.current = null;
    }
    if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'closed') {
      try { peerConnectionRef.current.close(); } catch { /* ignore */ }
    }

    const turnConfig = resolveTurnConfig();
    let iceServers = turnConfig.iceServers;

    // RACE-FIX (F!3): create the PC synchronously and assign the ref NOW,
    // before any async TURN fetch, so startCall never sees a null PC.
    const pc = new RTCPeerConnection({ iceServers });
    peerConnectionRef.current = pc;

    // Async TURN fetch (fire-and-forget). Applies credentials when ready.
    if (turnConfig.source === 'edge') {
      (async () => {
        try {
          const turnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/turn-credentials`;
          const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const res = await fetch(turnUrl, anonKey ? {
            headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }
          } : undefined);
          if (res.ok) {
            const creds = await res.json();
            const servers: RTCIceServer[] = Array.isArray(creds?.iceServers) ? creds.iceServers : [];
            if (servers.length > 0) {
              try { pc.setConfiguration({ iceServers: servers }); } catch { /* ignore */ }
              console.log('[VideoChat] Using TURN credentials from Edge Function');
            }
          }
        } catch (e) {
          console.warn('[Security] TURN fetch failed, falling back to', turnConfig.source, e);
        }
      })();
    } else if (turnConfig.source === 'override') {
      console.log('[VideoChat] Using TURN override config');
    } else {
      console.log('[VideoChat] Using STUN-only fallback');
    }

    // 2. Data Channel Setup (For receiving)
    pc.ondatachannel = (event) => {
      const receiveChannel = event.channel;
      receiveChannel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (validateSignalPayload(data)) {
            const customEvent = new CustomEvent('vivo-data-message', { detail: data });
            window.dispatchEvent(customEvent);
          }
        } catch { /* ignore invalid json */ }
      };
      dataChannelRef.current = receiveChannel;
    };

    // F4 fix: renegotiate when a track is added to the PC after the initial
    // offer/answer (e.g. the audio track appears on the shared stream later, or
    // a late video track). Without this, the peer never receives the new media
    // track. We only auto-renegotiate once the call is already connected —
    // the INITIAL offer is created by startCall (avoids glare at setup).
    pc.onnegotiationneeded = async () => {
      if (!pc || pc.connectionState === 'closed') return;
      if (pc.connectionState !== 'connected' || pc.signalingState !== 'stable') return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalingChannel?.broadcastMove({
          type: 'signal',
          target: 'peer',
          payload: { type: 'offer', sdp: offer }
        });
        console.log('[VideoChat] Renegotiating for late-added track');
      } catch (e) {
        console.warn('[VideoChat] onnegotiationneeded failed:', e);
      }
    };

    // Shared camera tracks (video + audio) are attached via ensureSharedTracks
    // so we never fight over getUserMedia and the video track stays enabled
    // (hand tracking keeps working). This replaces the old localStream addTrack.
    const ensureSharedTracks = () => {
      const shared = sharedCamera.getStream();
      if (!shared || !peerConnectionRef.current) return;
      const existing = new Set(peerConnectionRef.current.getSenders().map(s => s.track));
      shared.getTracks().forEach((track) => {
        if (track.kind === 'video' && videoMutedRef.current) return;
        if (!existing.has(track)) {
          try {
            peerConnectionRef.current?.addTrack(track, shared);
          } catch (e) {
            console.warn('[VideoChat] Could not add late track:', e);
          }
        }
      });
    };
    ensureSharedTracks();
    const unsubShared = sharedCamera.subscribe(ensureSharedTracks);
    unsubscribeSharedRef.current = unsubShared;

    // 3. Handle Remote Track
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    // 4. Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingChannel?.broadcastMove({
          type: 'signal',
          target: 'peer',
          payload: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      setConnectionStatus(pc.connectionState);
      // Reconnection: if the D2D/ICE link drops unexpectedly (not a
      // deliberate hangup), request an ICE restart to re-establish media.
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn('[VideoChat] Connection dropped; restarting ICE...');
        try { pc.restartIce(); } catch (e) { console.warn('[VideoChat] restartIce failed (non-fatal):', e); }
      }
    };

    // 5. Start Stats Loop (Observability)
    const statsInterval = setInterval(async () => {
      if (pc.connectionState !== 'connected') return;
      const stats = await pc.getStats();
      const newMetrics = { rtt: 0, packetLoss: 0, fps: 0, resolution: '0x0' };

      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          newMetrics.rtt = report.currentRoundTripTime * 1000;
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          newMetrics.packetLoss = report.packetsLost;
          newMetrics.fps = report.framesPerSecond;
        }
      });
      setMetrics(prev => ({ ...prev, ...newMetrics }));
    }, 1000);

    // Cleanup stats on PC close
    const originalClose = pc.close.bind(pc);
    pc.close = () => {
      clearInterval(statsInterval);
      originalClose();
    };

    return pc;
  }, [roomId, userId, signalingChannel]);

  // Initialize Peer Connection & Signaling
  useEffect(() => {
    setupPeerConnection();

    // Cleanup
    return () => {
      if (unsubscribeSharedRef.current) {
        unsubscribeSharedRef.current();
        unsubscribeSharedRef.current = null;
      }
      if (dataChannelRef.current) dataChannelRef.current.close();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [setupPeerConnection]);

  // Handle Incoming Signals (Offer/Answer/ICE)
  const handleSignal = useCallback(async (data: SignalData) => {
    // P0: Strict Payload Validation
    console.log('[VideoChat] handleSignal received:', data.type, data);

    if (!validateSignalPayload(data)) {
        console.warn('[Security] Rejected malformed signal payload:', data);
        return;
    }

    // F3-gap fix: the PC may be null, closed or failed (e.g. after hangUp or an
    // ICE failure). If so, rebuild it BEFORE processing the incoming offer —
    // otherwise a remote re-call would be rejected because signalingState on a
    // closed PC is 'closed' (never 'stable') and the offer gets dropped.
    let pc = peerConnectionRef.current;
    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        console.log('[VideoChat] handleSignal: rebuilding closed/failed/null PC');
        setupPeerConnection();
        pc = peerConnectionRef.current;
    }
    if (!pc) {
        console.warn('[VideoChat] handleSignal ignored: PeerConnection not initialized');
        return;
    }

    try {
      if (data.type === 'offer') {
        // GLARE HANDLING: si ambos peers inician a la vez, ambos tienen una
        // oferta local pendiente. El que pierde la carrera hace rollback de su
        // oferta y acepta la del rival (patrón "polite" estándar de WebRTC).
        if (pc.signalingState === 'have-local-offer') {
          console.warn('[VideoChat] Glare detected (offer while have-local-offer). Rolling back to accept remote offer.');
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (e) {
            console.warn('[VideoChat] Rollback failed:', e);
          }
        }

        // Avoiding race conditions or state errors
        if (pc.signalingState !== 'stable') {
            console.warn('[VideoChat] Received offer but signaling state is not stable:', pc.signalingState);
            return; 
        } 
        
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        
        // Process queued candidates
        if (iceCandidateQueue.current.length > 0) {
             console.log('[VideoChat] Processing queued ICE candidates:', iceCandidateQueue.current.length);
             for (const candidate of iceCandidateQueue.current) {
                 await pc.addIceCandidate(new RTCIceCandidate(candidate));
             }
             iceCandidateQueue.current = [];
        }

        const answer = await pc.createAnswer();
        console.log('[VideoChat] Created Answer, setting local description...');
        await pc.setLocalDescription(answer);
        
        console.log('[VideoChat] Broadcasting Answer via Signaling Channel:', !!signalingChannel);
        if (signalingChannel) {
             await signalingChannel.broadcastMove({
               type: 'signal',
               target: 'peer',
               payload: { type: 'answer', sdp: answer }
             });
             console.log('[VideoChat] Answer broadcasted successfully.');
        } else {
             console.error('[VideoChat] CRITICAL: Signaling channel unavailable when trying to send answer!');
        }
      } 
      else if (data.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        
        // Process queued candidates
        if (iceCandidateQueue.current.length > 0) {
             console.log('[VideoChat] Processing queued ICE candidates (Start Call side):', iceCandidateQueue.current.length);
             for (const candidate of iceCandidateQueue.current) {
                 await pc.addIceCandidate(new RTCIceCandidate(candidate));
             }
             iceCandidateQueue.current = [];
        }
      } 
      else if (data.type === 'ice-candidate') {
        try {
            if (pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                console.log('[VideoChat] Queuing ICE candidate (remote description not ready)');
                iceCandidateQueue.current.push(data.candidate);
            }
        } catch (e) {
            console.warn('[VideoChat] Failed to add ICE candidate (likely non-fatal):', e);
        }
      }
    } catch (err) {
      console.error('Signaling Error:', err);
    }
  }, [signalingChannel, setupPeerConnection]);

  // Initiator Logic (Call Button)
  const startCall = useCallback(async () => {
    // F3 fix: if the previous call was hung up (PC closed/failed/null) or never
    // initialized, rebuild the PeerConnection before creating a fresh offer.
    let pc = peerConnectionRef.current;
    if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        console.log('[VideoChat] startCall: rebuilding closed/failed PC');
        setupPeerConnection();
        pc = peerConnectionRef.current;
    }
    if (!pc) {
        console.error('[VideoChat] startCall failed: PeerConnection not initialized');
        return;
    }

    // P0: Rate Limiting
    const now = Date.now();
    if (now - lastConnectionAttemptRef.current < 2000) {
        console.warn('[Security] Connection attempt rate limited');
        return;
    }
    lastConnectionAttemptRef.current = now;

    // Si en el ínterin ya negociamos (recibimos oferta del rival), no crear otra
    if (pc.signalingState !== 'stable') {
        console.warn('[VideoChat] startCall skipped: signaling state is', pc.signalingState);
        return;
    }

    setConnectionStatus('connecting');

    // Create Data Channel (Initiator only)
    const dc = pc.createDataChannel('vivo-sync');
    dc.onopen = () => console.log('Data Channel Open');
    dc.onmessage = (e) => {
       try {
          const data = JSON.parse(e.data);
          if (validateSignalPayload(data)) {
              const customEvent = new CustomEvent('vivo-data-message', { detail: data });
              window.dispatchEvent(customEvent);
          }
       } catch { /* ignore */ }
    };
    dataChannelRef.current = dc;

    const offer = await pc.createOffer();
    console.log('[VideoChat] Created Offer, setting local description...');
    await pc.setLocalDescription(offer);

    console.log('[VideoChat] Broadcasting Offer...');
    signalingChannel?.broadcastMove({
      type: 'signal',
      target: 'peer',
      payload: { type: 'offer', sdp: offer }
    });
  }, [signalingChannel, setupPeerConnection]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendData = useCallback((data: any): boolean => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      // P0: Ensure we don't send massive blobs even if we think it's clean
      const json = JSON.stringify(data);
      if (json.length < 10000) {
          try {
              dataChannelRef.current.send(json);
              return true;
          } catch (e) {
              console.warn('[VideoChat] Failed to send on open data channel:', e);
              return false;
          }
      }
    }
    return false;
  }, []);

  // Media Controls (Privacy)
  // Microphone: enable/disable the AUDIO track on the shared stream. This never
  // touches the video track, so hand tracking is unaffected. The audio track is
  // guaranteed to exist via sharedCamera.ensureAudio (see F4 in the fix notes).
  const toggleAudio = useCallback((enabled: boolean) => {
      const stream = localStream || sharedCamera.getStream();
      if (stream) {
          stream.getAudioTracks().forEach(track => { track.enabled = enabled; });
      } else {
          console.warn('[VideoChat] toggleAudio: no local stream yet');
      }
  }, [localStream]);

  // Camera (outgoing video) mute/unmute.
  // Uses RTCRtpSender.replaceTrack(null) so the LOCAL video track stays
  // enabled=true and the hand tracking (MediaPipe) keeps reading frames.
  // Unlike track.enabled=false, this only stops SENDING our video to the peer
  // (they see black), without freezing our own tracking. Re-enabling restores
  // the same track. This is the safe fix that preserves hand tracking (F2).
  const toggleVideo = useCallback((enabled: boolean) => {
      const pc = peerConnectionRef.current;
      if (!pc) {
          console.warn('[VideoChat] toggleVideo: no PeerConnection');
          return;
      }
      const videoTrack = sharedCamera.getStream()?.getVideoTracks()[0] ?? null;
      videoMutedRef.current = !enabled;
      // IMPORTANT (F2/F5): after replaceTrack(null) the sender's track is null,
      // so checking `sender.track?.kind === 'video'` never matches again and the
      // camera can NEVER be re-enabled. Instead iterate the transceivers: the
      // receiver keeps its kind even while the sender is nulled.
      pc.getTransceivers().forEach((transceiver) => {
          const kind = transceiver.sender.track?.kind ?? transceiver.receiver.track?.kind;
          if (kind === 'video') {
              try {
                  transceiver.sender.replaceTrack(enabled ? videoTrack : null);
              } catch (e) {
                  console.warn('[VideoChat] replaceTrack failed:', e);
              }
          }
      });
      // If the connection wasn't up yet and the track wasn't attached, the next
      // ensureSharedTracks (subscribed in the PC-init effect) will respect
      // videoMutedRef and skip the video track until unmuted.
  }, []);

  // Full Revocation (Privacy): disable tracks instead of stopping hardware,
  // because the camera is SHARED with hand tracking.
  const stopAllTracks = useCallback(() => {
      if (localStream) {
          localStream.getTracks().forEach(track => track.enabled = false);
      }
  }, [localStream]);

  // Hang up the call (privacy): close the peer connection + data channel, but
  // KEEP hand tracking alive and allow re-calling. F3 fix:
  //  - We must NOT disable the shared VIDEO track (it freezes MediaPipe).
  //  - We must NOT null out peerConnectionRef permanently (startCall would die).
  //  - We stop SENDING our video+audio (replaceTrack(null) on senders, like
  //    toggleVideo), so the peer hears/sees nothing, but the LOCAL tracks stay
  //    enabled=true (hand tracking keeps reading frames; the mic is live again
  //    on the next call).
  //  - The PC is closed (releases ICE) but startCall recreates it if needed.
  const hangUp = useCallback(() => {
      console.log('[VideoChat] Hanging up call. Game + hand tracking continue.');
      const pc = peerConnectionRef.current;
      if (pc) {
          // Stop sending our video+audio to the peer, but keep the LOCAL tracks
          // enabled (video for MediaPipe, audio so the mic is live again on the
          // next call). Same replaceTrack(null) approach as toggleVideo(false).
          // F4 fix: never set the shared audio track enabled=false here — that
          // disables the mic persistently (a re-call would be silent even though
          // the UI shows the mic as on). replaceTrack(null) stops the peer from
          // hearing us without touching the shared track's enabled state.
          try {
              pc.getSenders().forEach((sender) => {
                  if (sender.track?.kind === 'video' || sender.track?.kind === 'audio') {
                      try { sender.replaceTrack(null); } catch { /* ignore */ }
                  }
              });
          } catch (e) {
              console.warn('[VideoChat] hangUp replaceTrack error:', e);
          }
          try {
              pc.close(); // releases ICE; startCall will recreate if needed
          } catch (e) {
              console.warn('[VideoChat] hangUp pc.close error:', e);
          }
      }
      if (dataChannelRef.current) {
          try { dataChannelRef.current.close(); } catch { /* ignore */ }
          dataChannelRef.current = null;
      }
      // Reset mute state so the next call starts unmuted (outgoing video on).
      videoMutedRef.current = false;
      setRemoteStream(null);
      setConnectionStatus('closed');
      setMetrics({ rtt: 0, packetLoss: 0, fps: 0, resolution: '0x0' });
  }, []);

  return {
    localStream,
    remoteStream,
    connectionStatus,
    startCall,
    handleSignal,
    sendData,
    toggleAudio,
    toggleVideo,
    stopAllTracks,
    hangUp,
    metrics // Export metrics
  };
}
