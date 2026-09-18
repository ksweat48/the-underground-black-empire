import type { EmailParams } from './types';
import { SENDER_NAME, WEBSITE_URL, REPLY_TO } from './types';

const FONT_DISPLAY = "'Outfit', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const COLOR_BLACK = '#1A1815';
const COLOR_IVORY = '#2C2823';
const COLOR_TEXT_SECONDARY = '#6B655B';
const COLOR_TEXT_MUTED = '#9A9388';
const COLOR_EMERALD = '#3D8A6B';
const COLOR_PLUM = '#8A6BB1';
const COLOR_BG = '#FAFAFA';
const COLOR_CARD = '#FFFFFF';
const COLOR_BORDER = 'rgba(26,24,21,0.08)';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildButton(text: string, url: string): string {
  if (!text || !url) return '';
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
    <tr>
      <td style="border-radius:8px;overflow:hidden;">
        <a href="${escapeHtml(url)}"
           style="display:inline-block;padding:14px 36px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;background:linear-gradient(135deg,#333333,#1A1815);box-shadow:0 4px 16px rgba(17,17,17,0.25);">
          ${escapeHtml(text)}
        </a>
      </td>
    </tr>
  </table>`;
}

function buildSecondaryText(text: string): string {
  if (!text) return '';
  return `
  <p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${COLOR_TEXT_SECONDARY};">
    ${escapeHtml(text)}
  </p>`;
}

export function renderMasterTemplate(params: EmailParams): string {
  const { firstName, emailTitle, message, buttonText, buttonUrl, secondaryText } = params;
  const greeting = firstName
    ? `<p style="margin:0 0 20px;font-family:${FONT_BODY};font-size:16px;color:${COLOR_IVORY};">Hello ${escapeHtml(firstName)},</p>`
    : '';

  const messageHtml = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${COLOR_IVORY};">${escapeHtml(line)}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="x-apple-data-detectors" content="0">
  <meta name="color-scheme" content="light only">
  <title>${escapeHtml(emailTitle)}</title>
  <!--[if mso]>
  <style>table,tr,td{border-collapse:collapse;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${COLOR_BG};">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLOR_CARD};border:1px solid ${COLOR_BORDER};border-radius:12px;overflow:hidden;box-shadow:0 16px 36px rgba(26,24,21,0.10),0 4px 12px rgba(26,24,21,0.04);">

      <tr>
        <td style="padding:0;">
          <div style="height:4px;background:linear-gradient(90deg,${COLOR_EMERALD} 0%,${COLOR_EMERALD} 30%,${COLOR_PLUM} 30%,${COLOR_PLUM} 70%,${COLOR_EMERALD} 70%,${COLOR_EMERALD} 100%);"></div>
        </td>
      </tr>

      <tr>
        <td style="padding:36px 40px 0;text-align:center;">
          <p style="margin:0;font-family:${FONT_DISPLAY};font-size:22px;font-weight:700;letter-spacing:0.04em;color:${COLOR_BLACK};text-transform:uppercase;">
            The Underground Black Empire
          </p>
          <div style="width:40px;height:2px;margin:12px auto 0;background:${COLOR_EMERALD};border-radius:1px;"></div>
        </td>
      </tr>

      <tr>
        <td style="padding:28px 40px 0;">
          <h1 style="margin:0;font-family:${FONT_DISPLAY};font-size:24px;font-weight:700;line-height:1.25;color:${COLOR_BLACK};text-align:center;">
            ${escapeHtml(emailTitle)}
          </h1>
        </td>
      </tr>

      <tr>
        <td style="padding:24px 40px 8px;">
          ${greeting}
          ${messageHtml}
        </td>
      </tr>

      <tr>
        <td style="padding:0 40px 8px;">
          ${buildButton(buttonText ?? '', buttonUrl ?? '')}
          ${buildSecondaryText(secondaryText ?? '')}
        </td>
      </tr>

      <tr>
        <td style="padding:28px 40px 36px;">
          <div style="border-top:1px solid ${COLOR_BORDER};padding-top:20px;text-align:center;">
            <p style="margin:0 0 6px;font-family:${FONT_BODY};font-size:13px;color:${COLOR_TEXT_MUTED};">
              The Underground Black Empire &middot; ${escapeHtml(WEBSITE_URL)}
            </p>
            <p style="margin:0 0 4px;font-family:${FONT_BODY};font-size:12px;color:${COLOR_TEXT_MUTED};">
              Need help? Reply to this email or contact
              <a href="mailto:${escapeHtml(REPLY_TO)}" style="color:${COLOR_EMERALD};text-decoration:none;">${escapeHtml(REPLY_TO)}</a>
            </p>
            <p style="margin:0;font-family:${FONT_BODY};font-size:11px;color:${COLOR_TEXT_MUTED};">
              You are receiving this email because you are a member of The Underground Black Empire.
              <br>
              <a href="${escapeHtml(WEBSITE_URL)}/profile" style="color:${COLOR_TEXT_MUTED};text-decoration:underline;">Manage your email preferences</a>
            </p>
          </div>
        </td>
      </tr>

      <tr>
        <td style="padding:0;">
          <div style="height:4px;background:linear-gradient(90deg,${COLOR_PLUM} 0%,${COLOR_PLUM} 30%,${COLOR_EMERALD} 30%,${COLOR_EMERALD} 70%,${COLOR_PLUM} 70%,${COLOR_PLUM} 100%);"></div>
        </td>
      </tr>
    </table>

    <p style="margin:16px 0 0;text-align:center;font-family:${FONT_BODY};font-size:11px;color:${COLOR_TEXT_MUTED};">
      &copy; ${new Date().getFullYear()} The Underground Black Empire. All rights reserved.
    </p>
  </div>
</body>
</html>`;
}

export function renderPlainText(params: EmailParams): string {
  const { firstName, emailTitle, message, buttonText, buttonUrl, secondaryText } = params;
  const lines: string[] = [
    'THE UNDERGROUND BLACK EMPIRE',
    '================================',
    '',
    emailTitle,
    '',
  ];
  if (firstName) lines.push(`Hello ${firstName},`, '');
  if (message) {
    lines.push(message, '');
  }
  if (buttonText && buttonUrl) {
    lines.push(`${buttonText}: ${buttonUrl}`, '');
  }
  if (secondaryText) {
    lines.push(secondaryText, '');
  }
  lines.push(
    '---',
    `The Underground Black Empire`,
    WEBSITE_URL,
    `Support: ${REPLY_TO}`,
    '',
    'You are receiving this email because you are a member of The Underground Black Empire.',
  );
  return lines.join('\n');
}
