import { useEffect, useState, useCallback } from 'react';
import {
  Mail,
  Send,
  Loader2,
  ArrowLeft,
  Eye,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { EMAIL_DEFINITIONS, SAMPLE_PARAMS, buildEmail } from '@/emails/definitions';
import type { EmailType, EmailParams } from '@/emails/types';
import { previewEmail, sendTestEmail } from '@/emails/email-service';
import { renderMasterTemplate } from '@/emails/master-template';

const EMAIL_TYPE_KEYS = Object.keys(EMAIL_DEFINITIONS) as EmailType[];

export function EmailPreviewPage() {
  const [selectedType, setSelectedType] = useState<EmailType>('welcome');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [error, setError] = useState(false);

  const selectedDef = EMAIL_DEFINITIONS[selectedType];
  const sampleParams = SAMPLE_PARAMS[selectedType];

  const renderPreview = useCallback(() => {
    const { subject, params } = buildEmail(selectedType, sampleParams);
    setPreviewSubject(subject);
    setPreviewHtml(renderMasterTemplate(params));
  }, [selectedType, sampleParams]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  const handleSendTest = async () => {
    if (!testEmail.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const result = await sendTestEmail(selectedType, testEmail.trim(), sampleParams);
      if (result.success) {
        setSendResult({ success: true, message: `Test email sent to ${testEmail.trim()}` });
      } else {
        setSendResult({ success: false, message: result.error ?? 'Failed to send test email' });
      }
    } catch (err) {
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-12">
          <ErrorBanner
            message="Unable to load the email preview. Please try again."
            onRetry={() => window.location.reload()}
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <a
            href="/admin"
            className="flex items-center gap-2 text-sm text-ink-400 hover:text-ink-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </a>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <Mail className="w-6 h-6 text-gold-400" />
          <h1 className="font-display text-2xl font-bold text-ink-100">Email Preview</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar: email type list */}
          <div className="space-y-1">
            {EMAIL_TYPE_KEYS.map((type) => {
              const def = EMAIL_DEFINITIONS[type];
              const isActive = type === selectedType;
              return (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedType(type);
                    setSendResult(null);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-gold-500/15 border border-gold-500/30 text-gold-200'
                      : 'border border-transparent text-ink-300 hover:bg-ink-800/40 hover:text-ink-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isActive ? 'bg-gold-400' : 'bg-ink-600'
                      }`}
                    />
                    <span className="text-sm font-medium">{def.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Main: preview + send */}
          <div className="space-y-6">
            {/* Subject + preview text */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-gold-400" />
                <h2 className="font-display text-base font-semibold text-ink-100">
                  {selectedDef.label}
                </h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-ink-500 font-medium min-w-fit">Subject:</span>
                  <span className="text-ink-200">{previewSubject}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-ink-500 font-medium min-w-fit">Preview:</span>
                  <span className="text-ink-400">{selectedDef.previewText(SAMPLE_PARAMS[selectedType] as EmailParams)}</span>
                </div>
              </div>
            </div>

            {/* Email HTML preview */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-ink-800/50 flex items-center gap-2">
                <Mail className="w-4 h-4 text-gold-400" />
                <span className="text-sm font-medium text-ink-300">HTML Preview</span>
              </div>
              <div className="bg-white">
                <iframe
                  title="Email Preview"
                  srcDoc={previewHtml}
                  className="w-full"
                  style={{ minHeight: '600px', border: 'none' }}
                />
              </div>
            </div>

            {/* Send test email */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Send className="w-4 h-4 text-gold-400" />
                <h3 className="font-display text-base font-semibold text-ink-100">
                  Send Test Email
                </h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="recipient@example.com"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-ink-900/60 border border-ink-700/50 text-ink-100 text-sm placeholder:text-ink-600 focus:outline-none focus:border-gold-500/40 transition-colors"
                />
                <button
                  onClick={handleSendTest}
                  disabled={sending || !testEmail.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: 'linear-gradient(135deg,#333333,#1A1815)',
                    color: '#FFFFFF',
                    boxShadow: '0 4px 16px rgba(17,17,17,0.25)',
                  }}
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send Test
                </button>
              </div>

              {sendResult && (
                <div
                  className={`mt-4 flex items-start gap-2 p-3 rounded-lg text-sm ${
                    sendResult.success
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border border-red-500/20 text-red-300'
                  }`}
                >
                  {sendResult.success ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{sendResult.message}</span>
                </div>
              )}

              <p className="mt-3 text-xs text-ink-500">
                The test email will be sent from <span className="text-ink-400 font-mono">noreply@mail.theundergroundblackempire.com</span> using the same branded template shown above.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default EmailPreviewPage;
