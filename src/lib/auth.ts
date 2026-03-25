import { supabase } from './supabase';

// ── Synchronous initial read from localStorage ──────────────────────────────
function _readStoredSession(): { token: string | null; email: string | null } {
  if (typeof window === 'undefined') return { token: null, email: null };
  try {
    // Supabase stores session under sb-<project-ref>-auth-token
    // We scan all keys to find it without hardcoding the project ref
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = JSON.parse(localStorage.getItem(key)!);
        const expiresAt: number = val?.expires_at ?? 0;
        if (expiresAt && Date.now() / 1000 > expiresAt) {
          localStorage.removeItem(key);
          return { token: null, email: null };
        }
        return {
          token: val?.access_token ?? null,
          email: val?.user?.email ?? null,
        };
      }
    }
  } catch { /* ignore */ }
  return { token: null, email: null };
}

const _initial = _readStoredSession();
let _token: string | null = _initial.token;
let _email: string | null = _initial.email;

supabase.auth.onAuthStateChange((_event, session) => {
  _token = session?.access_token ?? null;
  _email = session?.user?.email ?? null;
});

/** Sync — available on first render. */
export function getToken(): string | null {
  return _token;
}

/** Sync — returns the user's email. */
export function getEmail(): string | null {
  return _email;
}

/** Sync — true if a non-expired session exists in localStorage. */
export function isLoggedInSync(): boolean {
  return !!_token;
}

/** Async — verified with Supabase server; use for page guards. */
export async function isLoggedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
