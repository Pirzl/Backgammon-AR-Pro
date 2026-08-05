/**
 * PresenceManager - Singleton para gestión de presencia en tiempo real.
 * Usa Supabase Realtime Presence (WebSocket) como fuente primaria.
 * Heartbeat unificado vía RPC update_user_presence cada 20s.
 */
import { supabase } from '../api/supabase';

type PresenceCallback = (onlineUserIds: string[]) => void;

class PresenceManagerSingleton {
  private _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _presenceChannel: ReturnType<typeof supabase.channel> | null = null;
  private _userId: string | null = null;
  private _callbacks: Set<PresenceCallback> = new Set();
  private _onlineUserIds: string[] = [];
  private _heartbeatMs = 20_000;

  get isRunning(): boolean {
    return this._heartbeatInterval !== null;
  }

  get onlineUserIds(): string[] {
    return this._onlineUserIds;
  }

  start(userId: string): void {
    if (this._heartbeatInterval) return;
    this._userId = userId;

    this._sendHeartbeat();

    this._heartbeatInterval = setInterval(() => {
      this._sendHeartbeat();
    }, this._heartbeatMs);

    this._subscribePresence();
  }

  stop(): void {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._presenceChannel) {
      this._presenceChannel.untrack();
      supabase.removeChannel(this._presenceChannel);
      this._presenceChannel = null;
    }
    this._userId = null;
    this._onlineUserIds = [];
  }

  subscribe(callback: PresenceCallback): () => void {
    this._callbacks.add(callback);
    callback(this._onlineUserIds);
    return () => {
      this._callbacks.delete(callback);
    };
  }

  private _sendHeartbeat(): void {
    if (!this._userId) return;
    void supabase.rpc('update_user_presence', { p_user_id: this._userId });
  }

  private _subscribePresence(): void {
    if (!this._userId) return;
    this._presenceChannel = supabase.channel('online-users');
    this._presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (!this._presenceChannel) return;
        const state = this._presenceChannel.presenceState();
        const ids: string[] = [];
        Object.values(state).forEach((entries) => {
          (entries as Array<Record<string, unknown>>).forEach((entry) => {
            if (entry.user_id) ids.push(entry.user_id as string);
          });
        });
        this._onlineUserIds = [...new Set(ids)];
        this._callbacks.forEach((cb) => cb(this._onlineUserIds));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this._presenceChannel?.track({
            user_id: this._userId,
            online_at: new Date().toISOString(),
          });
        }
      });
  }
}

export const presenceManager = new PresenceManagerSingleton();
