import { supabase } from '@/shared/supabase-client';

export interface AppNotification {
  id: string;
  member_id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

export async function fetchNotifications(limit: number = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, member_id, type, title, body, link_url, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_unread_notification_count');

  if (error) throw error;
  return Number(data ?? 0);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);

  if (error) throw error;
}

export function subscribeToNotifications(callback: () => void): () => void {
  const channel = supabase
    .channel('notifications-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      () => callback()
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications' },
      () => callback()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
