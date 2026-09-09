import { supabase } from '@/shared/supabase-client';
import { parseSupabaseError } from '@/shared/errors';
import type { AuthSession } from './types';

export interface SignUpParams {
  email: string;
  password: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export async function signUp({ email, password }: SignUpParams): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(parseSupabaseError(error));
  if (!data.session) throw new Error('Sign up succeeded but no session was returned. Please sign in.');
  return { user: data.session.user };
}

export async function signIn({ email, password }: SignInParams): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(parseSupabaseError(error));
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error && !/auth session missing/i.test(error.message)) {
    throw new Error(parseSupabaseError(error));
  }
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  if (!data.session) return null;
  return { user: data.session.user };
}
