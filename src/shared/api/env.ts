/**
 * Supabase environment resolution
 *
 * Supports both naming conventions:
 *  - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (local .env convention)
 *  - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase
 *    integration provisioned vars, exposed via `envPrefix` in vite.config.ts)
 */

const env = import.meta.env as Record<string, string | undefined>;

function firstDefined(...keys: string[]): string {
  for (const key of keys) {
    const value = env[key];
    if (value && value.length > 0) return value;
  }
  return '';
}

export const SUPABASE_URL = firstDefined(
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
);

export const SUPABASE_ANON_KEY = firstDefined(
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
);

/** True when both the project URL and a public key are available. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.error(
    '[Supabase] Missing environment variables. Expected VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ' +
      'or NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  );
}
