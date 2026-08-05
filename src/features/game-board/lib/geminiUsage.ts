import { supabase } from '../../../shared/api/supabase';

/**
 * Gemini usage tracker (free-tier quota awareness).
 *
 * The Gemini free tier limits requests per day (RPD) per API key, shared by ALL
 * players. The authoritative daily counter lives server-side: the gemini-proxy
 * edge function increments a `gemini_usage` row per day (UTC). This module also
 * keeps a per-browser tally in localStorage (per game / offline fallback).
 *
 * Limits: free tier of gemini-3.5-flash-lite is ~1,000 RPD (configurable via
 * GEMINI_DAILY_LIMIT). The counter resets automatically when the date changes.
 */

const STORAGE_KEY = 'vivo_gemini_usage_v1';
const DAILY_LIMIT = Number(import.meta.env.VITE_GEMINI_DAILY_LIMIT ?? 1000);

interface GeminiUsage {
  /** ISO date string (YYYY-MM-DD) the tally belongs to */
  date: string;
  /** Calls made today across all games */
  today: number;
  /** Calls made in the current game */
  game: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** UTC date key, matching the day the gemini-proxy edge function increments. */
function todayUTCKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readUsage(): GeminiUsage {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GeminiUsage>;
      if (parsed.date === today) {
        return {
          date: today,
          today: typeof parsed.today === 'number' ? parsed.today : 0,
          game: typeof parsed.game === 'number' ? parsed.game : 0,
        };
      }
    }
  } catch {
    // corrupted entry — fall through to a fresh tally
  }
  return { date: today, today: 0, game: 0 };
}

function writeUsage(usage: GeminiUsage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
  } catch {
    // storage unavailable (private mode / quota) — silently ignore
  }
}

/** Record one Gemini call. Returns the updated tally. */
export function recordGeminiCall(): { today: number; game: number } {
  const usage = readUsage();
  usage.today += 1;
  usage.game += 1;
  writeUsage(usage);
  return { today: usage.today, game: usage.game };
}

/** Calls made today (across all games). */
export function getTodayCalls(): number {
  return readUsage().today;
}

/** Calls made in the current game. */
export function getGameCalls(): number {
  return readUsage().game;
}

/**
 * Global calls made today across ALL players (server-side counter incremented by
 * the gemini-proxy edge function). This is the real shared daily consumption.
 * Falls back to the local browser tally if the read fails (offline / not deployed).
 */
export async function getGlobalTodayCalls(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('gemini_usage')
      .select('calls')
      .eq('id', todayUTCKey())
      .maybeSingle();
    if (error) throw error;
    // data null = no row yet for today = zero global calls.
    return typeof data?.calls === 'number' ? data.calls : 0;
  } catch (err) {
    console.warn('geminiUsage: global read failed, falling back to local tally:', err);
    return getTodayCalls();
  }
}

/** Remaining calls for today before hitting the daily limit. */
export function getRemainingCalls(): number {
  return Math.max(0, DAILY_LIMIT - getTodayCalls());
}

/** Daily limit currently in effect (defaults to 1000). */
export function getDailyLimit(): number {
  return DAILY_LIMIT;
}

/**
 * Tailwind text-color class for the usage counter based on calls used today.
 * 0-300 → green (plenty), 301-600 → yellow (half), 601+ → red (almost out).
 */
export function getGeminiUsageColor(todayCalls: number): string {
  if (todayCalls <= 300) return 'text-emerald-400';
  if (todayCalls <= 600) return 'text-amber-400';
  return 'text-rose-400';
}

/** Reset the per-game counter (e.g. when a new game starts). */
export function resetGameCalls(): void {
  const usage = readUsage();
  usage.game = 0;
  writeUsage(usage);
}
