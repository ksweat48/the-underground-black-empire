import { supabase } from '@/shared/supabase-client';
import type { EmailParams, EmailType } from '@/emails/types';

export interface SendEmailOptions {
  type: EmailType;
  to: string;
  params?: Partial<EmailParams>;
}

export interface EmailPreviewResponse {
  subject: string;
  html: string;
  text: string;
  params: EmailParams;
}

export async function sendEmail({ type, to, params }: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { type, to, params, preview: false },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return { success: true, messageId: data?.messageId };
}

export async function previewEmail(type: EmailType, params?: Partial<EmailParams>): Promise<EmailPreviewResponse | null> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { type, params, preview: true },
  });

  if (error || data?.error) {
    console.error('Email preview failed:', error ?? data?.error);
    return null;
  }

  return data as EmailPreviewResponse;
}

export async function sendTestEmail(type: EmailType, to: string, params?: Partial<EmailParams>): Promise<{ success: boolean; error?: string }> {
  const result = await sendEmail({ type, to, params });
  return result;
}
