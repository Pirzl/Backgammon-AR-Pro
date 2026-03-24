import { useEffect, useRef, useState, useCallback } from 'react';
import { validateSignalPayload } from './validateSignalPayload';

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
  
  // Rate limiting for connection attempts
  const lastConnectionAttemptRef = useRef<number>(0);

  // Initialize Media (Camera/Mic)
  useEffect(() => {
    let isMounted = true;

    // If disabled, just return (cleanup of previous effect handles stopping)
    if (!enabled) return;

    const startMedia = async () => {
      try {
        if (localStreamRef.current) return; // Already started

        // P0: Constraint hardening - relaxed ideal values to prevent OverconstrainedError
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 },
              facingMode: { ideal: 'user' }
          },
          audio: true
        });
        
        if (isMounted) {
            setLocalStream(stream);
            localStreamRef.current = stream;
        } else {
            // Stream arrived after unmount/disable, stop it immediately
            stream.getTracks().forEach(t => t.stop());
        }
      } catch (err) {
        if (isMounted) {
            console.warn('[VideoChat] Media access denied or unavailable. Video features will be disabled, but data sync will continue:', err);
        }
      }
    };
    
    console.log('[VideoChat] startMedia initiated. Enabled:', enabled);

    startMedia();

    return () => {
      isMounted = false;
      // Cleanup tracks on unmount OR when enabled changes to false
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }
    };
  }, [enabled]);

  // Initialize Peer Connection & Signaling
  useEffect(() => {
    // Relaxed check: localStream is NOT required for Data Channel / Connection
    // We only need the signaling channel and identity
    if (!roomId || !userId || !signalingChannel) {
        console.log('[VideoChat] Skipping PC init. Missing deps:', { roomId, userId, hasSignaling: !!signalingChannel });
        return;
    }

    console.log('[VideoChat] Initializing Peer Connection...');
    const initPeerConnection = async () => {
        // P0: TURN Credential Fetching
        const iceServers: RTCIceServer[] = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ];

        // P0: TURN Credential Fetching (Disabled for now as API is missing)
        /*
        try {
            // Attempt to fetch ephemeral credentials
            // In dev/mock, this might fail, so we fallback to STUN
            const res = await fetch('/api/turn-credentials');
            if (res.ok) {
                const creds = await res.json();
                if (creds.uris && creds.username && creds.password) {
                     iceServers = [{
                         urls: creds.uris,
                         username: creds.username,
                         credential: creds.password
                     }];
                }
            }
        } catch (e) {
            console.warn('[Security] TURN fetch failed, falling back to STUN', e);
        }
        */

        // 1. Create PeerConnection
        const pc = new RTCPeerConnection({ iceServers });

        // 2. Data Channel Setup (For receiving)
        pc.ondatachannel = (event) => {
            const receiveChannel = event.channel;
            receiveChannel.onmessage = (e) => {
                // P0: Validation could be added here for data channel messages too if they carry sensitive actions
                // For cursor syncing, it's low risk, but good practice.
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

        // 3. Add Local Tracks (Only if available)
        if (localStream) {
            console.log('[VideoChat] Adding local tracks to PC');
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        } else {
            console.log('[VideoChat] No local stream available. Proceeding with Data Channel only.');
        }

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
                    // Resolution logic typically requires parsing frameWidth/frameHeight from track stats or similar
                }
            });
            setMetrics(prev => ({ ...prev, ...newMetrics }));
        }, 1000);

        peerConnectionRef.current = pc;

        // Cleanup stats on PC close
        const originalClose = pc.close.bind(pc);
        pc.close = () => {
            clearInterval(statsInterval);
            originalClose();
        };
    };

    initPeerConnection();

    // 5. Cleanup
    return () => {
      if (dataChannelRef.current) dataChannelRef.current.close();
      if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
      }
    };
  }, [roomId, userId, localStream, signalingChannel]);

  // Handle Incoming Signals (Offer/Answer/ICE)
  const handleSignal = useCallback(async (data: SignalData) => {
    // P0: Strict Payload Validation
    console.log('[VideoChat] handleSignal received:', data.type, data);

    if (!validateSignalPayload(data)) {
        console.warn('[Security] Rejected malformed signal payload:', data);
        return;
    }

    const pc = peerConnectionRef.current;
    if (!pc) {
        console.warn('[VideoChat] handleSignal ignored: PeerConnection not initialized');
        return;
    }

    try {
      if (data.type === 'offer') {
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
  }, [signalingChannel]);

  // Initiator Logic (Call Button)
  const startCall = useCallback(async () => {
    const pc = peerConnectionRef.current;
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
  }, [signalingChannel]);

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
  const toggleAudio = useCallback((enabled: boolean) => {
      if (localStream) {
          localStream.getAudioTracks().forEach(track => track.enabled = enabled);
      }
  }, [localStream]);

  const toggleVideo = useCallback((enabled: boolean) => {
      if (localStream) {
          localStream.getVideoTracks().forEach(track => track.enabled = enabled);
      }
  }, [localStream]);

  // Full Revocation (Stop Hardware)
  const stopAllTracks = useCallback(() => {
      if (localStream) {
          localStream.getTracks().forEach(track => track.stop());
          setLocalStream(null);
      }
  }, [localStream]);

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
    metrics // Export metrics
  };
}
