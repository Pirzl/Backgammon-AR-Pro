import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../../shared/api/supabase';

import type { SignalData } from './useVideoChat';

import { generateUUID } from '../../../shared/utils/uuid';

// Define the shape of our signaling messages
export interface SignalingMessage {
  type: 'signal';
  target: 'peer' | 'broadcast';
  payload: SignalData; // SDP or ICE candidate
  senderId?: string;
  instanceId?: string; // New: For echo cancellation (same user multiple tabs)
}

// Interface matching what useVideoChat expects
export interface SignalingChannel {
  broadcastMove: (move: SignalingMessage) => Promise<void>;
  close: () => void;
}

export class SupabaseSignaling implements SignalingChannel {
  private channel: RealtimeChannel | null = null;
  private roomId: string;
  private userId: string;
  private instanceId: string; // Unique per instance/tab
  private onSignal: (msg: SignalData) => void;

  constructor(roomId: string, userId: string, onSignal: (msg: SignalData) => void) {
    this.roomId = roomId;
    this.userId = userId;
    this.instanceId = generateUUID(); // Generate unique ID
    this.onSignal = onSignal;
    this.initialize();
  }

  private initialize() {
    console.log(`[Signaling] Initializing channel: room:${this.roomId}`);
    
    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: { broadcast: { self: false, ack: false } }
    })
      .on('broadcast', { event: 'signal' }, (payload) => {
        // Ignore own messages (Echo cancellation via instanceId)
        if (payload.payload.instanceId === this.instanceId) return;
        
        console.log('[Signaling] Received:', payload.payload);
        this.onSignal(payload.payload.payload); // Unwrap to get the actual signal data (sdp/ice)
      })
      .subscribe((status) => {
        console.log(`[Signaling] Channel status: ${status}`);
      });
  }

  public async broadcastMove(message: SignalingMessage): Promise<void> {
    if (!this.channel) return;

    // Attach senderId and instanceId
    const fullMessage = { 
        ...message, 
        senderId: this.userId, 
        instanceId: this.instanceId 
    };
    
    await this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: fullMessage
    });
  }

  public close() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}
