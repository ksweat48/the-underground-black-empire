import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      supabase.realtime.disconnect();
      supabase.realtime.connect();
    }
  });
}

export type SupabaseClient = typeof supabase;
