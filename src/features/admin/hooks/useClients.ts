import { useState, useEffect } from "react";
import { supabase } from "../../../shared/api/supabase";
import type { ClientData } from "../../../entities/tournament/types";
import { isRecentlyActive } from "../../../shared/lib/presence";

export const useClients = () => {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        // Fetch profiles with their wallet balances in one go
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("*, wallets!user_id(saldo_actual)");

        if (profilesError) throw profilesError;

        // Transform to ClientData — use real presence data
        const now = Date.now();

        const mappedClients: ClientData[] = profiles.map((p) => {
          // Determine real online status using heartbeat recency (last_seen).
          // The `status` column alone is sticky (never auto-reset offline on
          // mobile/crash) → online is derived ONLY from a recent last_seen.
          const isRecentlyActiveStatus = isRecentlyActive(p.last_seen, now);
          let realStatus: ClientData["status"] = "offline";
          if (
            isRecentlyActiveStatus &&
            ["online", "active", "in-game"].includes(p.status)
          ) {
            realStatus = p.status === "in-game" ? "in-game" : "online";
          } else if (p.status === "blocked") {
            realStatus = "blocked";
          } else if (p.status === "paused") {
            realStatus = "paused";
          }

          return {
            id: p.id,
            firstName: p.username || "Unknown",
            lastName: "",
            email: p.email || "",
            phone: "",
            avatar: p.avatar_url || "https://via.placeholder.com/150",
            role: p.role || "user",
            status: realStatus,
            joinedDate: p.created_at,
            last_seen: p.last_seen || undefined,
            kycStatus: p.kyc_status || "none",
            skillRating: p.skill_rating ?? 1200,
            walletBalance:
              (Array.isArray(p.wallets)
                ? p.wallets[0]?.saldo_actual
                : p.wallets?.saldo_actual) ??
              p.wallet_balance ??
              500,
            stats: {
              tournamentsPlayed: p.tournaments_played ?? 0,
              tournamentsWon: p.tournaments_won ?? 0,
              totalEntryFees: p.total_entry_fees ?? 0,
              totalPrizeMoney: p.total_prizes ?? 0,
              netResults: (p.total_prizes ?? 0) - (p.total_entry_fees ?? 0),
            },
            history: [],
            messages: [],
            internalNotes: p.internal_notes || "",
            clientNotes: p.client_notes || "",
            rankCurrent: p.rank_current || undefined,
            rankHighest: p.rank_highest || undefined,
            currentStreak: p.current_streak ?? 0,
          };
        });

        setClients(mappedClients);
      } catch (err: unknown) {
        console.error("Error fetching clients:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchClients();

    // Subscribe to real-time wallet and profile updates
    const channel = supabase
      .channel("admin-realtime-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "wallets" },
        (payload) => {
          setClients((prev) =>
            prev.map((client) => {
              if (client.id === payload.new.user_id) {
                return {
                  ...client,
                  walletBalance:
                    typeof payload.new.saldo_actual === "number"
                      ? payload.new.saldo_actual
                      : client.walletBalance,
                };
              }
              return client;
            }),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setClients((prev) =>
            prev.map((client) => {
              if (client.id === payload.new.id) {
                // Re-calculate realStatus using the same logic as the initial map
                const now = Date.now();
                const isRecentlyActiveStatus = isRecentlyActive(payload.new.last_seen, now);

                let realStatus: ClientData["status"] = "offline";
                if (
                  isRecentlyActiveStatus &&
                  ["online", "active", "in-game"].includes(payload.new.status)
                ) {
                  realStatus = payload.new.status === "in-game" ? "in-game" : "online";
                } else if (payload.new.status === "blocked") {
                  realStatus = "blocked";
                } else if (payload.new.status === "paused") {
                  realStatus = "paused";
                }

                return {
                  ...client,
                  firstName: payload.new.username || client.firstName,
                  status: realStatus,
                  last_seen: payload.new.last_seen || client.last_seen,
                  walletBalance:
                    typeof payload.new.wallet_balance === "number"
                      ? payload.new.wallet_balance
                      : client.walletBalance,
                  skillRating: payload.new.skill_rating ?? client.skillRating,
                };
              }
              return client;
            }),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { clients, loading, error };
};
