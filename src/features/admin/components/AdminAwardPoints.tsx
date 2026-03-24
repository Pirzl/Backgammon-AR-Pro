/**
 * AdminAwardPoints — Admin tool to award or deduct points from players.
 * Uses the `admin_award_points` RPC + `point_awards` audit log.
 * Live balance reflected via Supabase Realtime (wallets UPDATE events).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Gift, MinusCircle, RefreshCw, CheckCircle, AlertCircle, Search, Clock } from 'lucide-react';
import { supabase } from '../../../shared/api/supabase';
import type { ClientData } from '../../../entities/tournament/types';

interface PointAward {
  id: string;
  awarded_by: string;
  awarded_to: string;
  amount: number;
  reason: string;
  created_at: string;
  awarded_to_name?: string;
  awarded_by_name?: string;
}

interface WalletInfo {
  saldo_actual: number;
  saldo_reservado: number;
}

interface AdminAwardPointsProps {
  clients: ClientData[];
}

const QUICK_AMOUNTS = [50, 100, 200, 500, 1000];
const QUICK_REASONS = [
  '🎂 Cumpleaños',
  '🏆 Premio torneo',
  '🎁 Bienvenida',
  '✅ Corrección de error',
  '⭐ Fidelidad',
  '🔓 Liberar puntos atrapados',
];

export const AdminAwardPoints: React.FC<AdminAwardPointsProps> = ({ clients }) => {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<ClientData | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const [amount, setAmount] = useState<number>(100);
  const [reason, setReason] = useState('');
  const [isDeduct, setIsDeduct] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const [history, setHistory] = useState<PointAward[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── State adjustment during render (React 19 pattern to avoid cascading useEffect) ──
  const currentSelectedUserId = selectedUser?.id ?? null;
  const [prevSelectedUserId, setPrevSelectedUserId] = useState<string | null>(null);
  if (currentSelectedUserId !== prevSelectedUserId) {
    setPrevSelectedUserId(currentSelectedUserId);
    setWallet(null);
    setHistory([]);
    setResult(null);
  }

  // ── Filtered user list ────────────────────────────────────────────────
  const filtered = clients.filter(c => {
    const q = search.toLowerCase();
    return (
      c.firstName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  });

  // ── Fetch wallet + history when user selected ─────────────────────────
  const loadUserData = useCallback(async (userId: string) => {
    setLoadingWallet(true);
    setLoadingHistory(true);

    // Wallet
    const { data: walletData } = await supabase
      .from('wallets')
      .select('saldo_actual, saldo_reservado')
      .eq('user_id', userId)
      .maybeSingle();

    setWallet(walletData ?? { saldo_actual: 0, saldo_reservado: 0 });
    setLoadingWallet(false);

    // Award history for this player
    const { data: awardData } = await supabase
      .from('point_awards')
      .select(`
        id, amount, reason, created_at,
        awarded_by,
        awarded_to
      `)
      .eq('awarded_to', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    setHistory((awardData ?? []) as PointAward[]);
    setLoadingHistory(false);
  }, []);

  // Real-time wallet updates for selected user
  useEffect(() => {
    if (!selectedUser) return;
    
    // Wrap in setTimeout to avoid synchronous setState warnings during effect execution
    const timer = setTimeout(() => {
      loadUserData(selectedUser.id);
    }, 0);

    const channel = supabase
      .channel(`admin-wallet-${selectedUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'wallets', filter: `user_id=eq.${selectedUser.id}` },
        (payload) => {
          setWallet({
            saldo_actual: payload.new.saldo_actual ?? 0,
            saldo_reservado: payload.new.saldo_reservado ?? 0,
          });
        }
      )
      .subscribe();

    return () => { 
      clearTimeout(timer);
      supabase.removeChannel(channel); 
    };
  }, [selectedUser, loadUserData]);

  // ── Submit award ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedUser || !amount || amount <= 0) return;
    setSubmitting(true);
    setResult(null);

    const finalAmount = isDeduct ? -Math.abs(amount) : Math.abs(amount);

    const { data, error } = await supabase.rpc('admin_award_points', {
      p_awarded_to: selectedUser.id,
      p_amount: finalAmount,
      p_reason: reason.trim() || (isDeduct ? 'Deducción manual' : 'Premio manual'),
    });

    if (error || !data?.success) {
      setResult({ success: false, message: error?.message ?? data?.error ?? 'Unknown error' });
    } else {
      setResult({
        success: true,
        message: `✅ ${isDeduct ? 'Deducidos' : 'Otorgados'} ${Math.abs(finalAmount)} pts. Nuevo saldo: ${data.new_balance} pts`,
      });
      setReason('');
      setAmount(100);
      // Refresh history
      await loadUserData(selectedUser.id);
    }

    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Gift className="w-6 h-6 text-amber-500" />
        <div>
          <h3 className="text-xl font-bold text-foreground">Award Points</h3>
          <p className="text-sm text-muted-foreground">
            Otorgar o deducir puntos a cualquier jugador. Cada operación queda registrada en el log de auditoría.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Player selection ── */}
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">1. Seleccionar jugador</h4>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-1">
            {filtered.map(client => (
              <button
                key={client.id}
                onClick={() => setSelectedUser(client)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                  selectedUser?.id === client.id
                    ? 'bg-amber-500/20 border border-amber-500/40 text-foreground'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="font-medium block truncate">{client.firstName}</span>
                <span className="text-xs opacity-60 block truncate">{client.email}</span>
                <span className="text-xs text-amber-400 font-bold">{client.walletBalance} pts disponibles</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin resultados</p>
            )}
          </div>
        </div>

        {/* ── Center: Award form ── */}
        <div className="bg-panel border border-border rounded-xl p-4 space-y-4">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider">2. Configurar premio</h4>

          {selectedUser ? (
            <>
              {/* Current balance */}
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">{selectedUser.firstName} — saldo actual</p>
                {loadingWallet ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Cargando…
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <div>
                      <p className="text-2xl font-black text-amber-400">{wallet?.saldo_actual ?? 0} pts</p>
                      <p className="text-[10px] text-muted-foreground">disponibles</p>
                    </div>
                    {(wallet?.saldo_reservado ?? 0) > 0 && (
                      <div>
                        <p className="text-lg font-bold text-orange-400">{wallet?.saldo_reservado} pts</p>
                        <p className="text-[10px] text-muted-foreground">reservados</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Award / Deduct toggle */}
              <div className="flex rounded-lg overflow-hidden border border-border">
                <button
                  onClick={() => setIsDeduct(false)}
                  className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    !isDeduct ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Gift className="w-4 h-4" /> Otorgar
                </button>
                <button
                  onClick={() => setIsDeduct(true)}
                  className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                    isDeduct ? 'bg-rose-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <MinusCircle className="w-4 h-4" /> Deducir
                </button>
              </div>

              {/* Quick amounts */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Cantidad rápida:</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_AMOUNTS.map(q => (
                    <button
                      key={q}
                      onClick={() => setAmount(q)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        amount === q
                          ? 'bg-amber-500 text-black'
                          : 'bg-muted hover:bg-muted/60 text-foreground border border-border'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Cantidad personalizada</label>
                <input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={e => setAmount(Math.abs(parseInt(e.target.value) || 0))}
                  className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-foreground"
                />
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Motivo</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {QUICK_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className="text-[10px] px-2 py-0.5 bg-muted border border-border rounded hover:bg-muted/60 cursor-pointer transition-colors text-foreground"
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="o escribe el motivo…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>

              {/* Result feedback */}
              {result && (
                <div className={`flex items-start gap-2 text-sm p-3 rounded-lg ${
                  result.success
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                }`}>
                  {result.success
                    ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {result.message}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !amount}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDeduct
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_16px_rgba(220,38,38,0.3)]'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_16px_rgba(245,158,11,0.3)]'
                }`}
              >
                {submitting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Procesando…</>
                ) : (
                  <>{isDeduct ? <MinusCircle className="w-4 h-4" /> : <Gift className="w-4 h-4" />}
                  {isDeduct ? 'Deducir' : 'Otorgar'} {amount} pts a {selectedUser.firstName}</>
                )}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Gift className="w-10 h-10 opacity-30" />
              <p className="text-sm text-center">Selecciona un jugador del panel izquierdo</p>
            </div>
          )}
        </div>

        {/* ── Right: Audit history ── */}
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4" /> Historial de premios
          </h4>

          {!selectedUser && (
            <p className="text-sm text-muted-foreground py-8 text-center">Selecciona un jugador para ver su historial</p>
          )}

          {selectedUser && loadingHistory && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
              <RefreshCw className="w-3 h-3 animate-spin" /> Cargando historial…
            </div>
          )}

          {selectedUser && !loadingHistory && history.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin premios registrados</p>
          )}

          {!loadingHistory && history.length > 0 && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {history.map(award => (
                <div
                  key={award.id}
                  className={`rounded-lg px-3 py-2 border text-sm ${
                    award.amount > 0
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-rose-500/5 border-rose-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-base ${award.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {award.amount > 0 ? '+' : ''}{award.amount} pts
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(award.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {award.reason && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{award.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
