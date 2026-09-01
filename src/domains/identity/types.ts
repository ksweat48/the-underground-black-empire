import type { User } from '@supabase/supabase-js';

export interface AuthSession {
  user: User;
}

export interface AuthState {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'NETWORK_ERROR'
  | 'SESSION_EXPIRED'
  | 'UNKNOWN_ERROR';
