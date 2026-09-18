import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = [
  "https://theundergroundblackempire.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const SENDER_NAME = "The Underground Black Empire";
const SENDER_EMAIL = "noreply@mail.theundergroundblackempire.com";
const REPLY_TO = "support@mail.theundergroundblackempire.com";
const WEBSITE_URL = "https://theundergroundblackempire.com";

const FONT_DISPLAY = "'Outfit', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const COLOR_BLACK = "#1A1815";
const COLOR_IVORY = "#2C2823";
const COLOR_TEXT_SECONDARY = "#6B655B";
const COLOR_TEXT_MUTED = "#9A9388";
const COLOR_EMERALD = "#3D8A6B";
const COLOR_PLUM = "#8A6BB1";
const COLOR_BG = "#FAFAFA";
const COLOR_CARD = "#FFFFFF";
const COLOR_BORDER = "rgba(26,24,21,0.08)";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildButton(text: string, url: string): string {
  if (!text || !url) return "";
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
  if (!text) return "";
  return `
  <p style="margin:16px 0 0;font-family:${FONT_BODY};font-size:14px;line-height:1.6;color:${COLOR_TEXT_SECONDARY};">
    ${escapeHtml(text)}
  </p>`;
}

interface EmailParams {
  firstName: string;
  emailTitle: string;
  message: string;
  buttonText?: string;
  buttonUrl?: string;
  secondaryText?: string;
}

function renderMasterTemplate(params: EmailParams): string {
  const { firstName, emailTitle, message, buttonText, buttonUrl, secondaryText } = params;
  const greeting = firstName
    ? `<p style="margin:0 0 20px;font-family:${FONT_BODY};font-size:16px;color:${COLOR_IVORY};">Hello ${escapeHtml(firstName)},</p>`
    : "";

  const messageHtml = message
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .map((line: string) => `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:15px;line-height:1.65;color:${COLOR_IVORY};">${escapeHtml(line)}</p>`)
    .join("");

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
          ${buildButton(buttonText ?? "", buttonUrl ?? "")}
          ${buildSecondaryText(secondaryText ?? "")}
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

function renderPlainText(params: EmailParams): string {
  const { firstName, emailTitle, message, buttonText, buttonUrl, secondaryText } = params;
  const lines: string[] = [
    "THE UNDERGROUND BLACK EMPIRE",
    "================================",
    "",
    emailTitle,
    "",
  ];
  if (firstName) lines.push(`Hello ${firstName},`, "");
  if (message) {
    lines.push(message, "");
  }
  if (buttonText && buttonUrl) {
    lines.push(`${buttonText}: ${buttonUrl}`, "");
  }
  if (secondaryText) {
    lines.push(secondaryText, "");
  }
  lines.push(
    "---",
    "The Underground Black Empire",
    WEBSITE_URL,
    `Support: ${REPLY_TO}`,
    "",
    "You are receiving this email because you are a member of The Underground Black Empire.",
  );
  return lines.join("\n");
}

const EMAIL_TYPES = [
  "welcome",
  "email_verification",
  "password_reset",
  "listing_submitted",
  "listing_approved",
  "listing_needs_changes",
  "listing_removed",
  "voting_window_opened",
  "vote_confirmation",
  "city_upgrade",
  "empire_upgrade",
  "quest_notification",
  "leadership_nomination",
  "leadership_election",
  "treasury_funding_vote",
  "general_announcement",
];

const SUBJECTS: Record<string, (p: EmailParams) => string> = {
  welcome: () => "Welcome to The Underground Black Empire",
  email_verification: () => "Verify your email address",
  password_reset: () => "Reset your password",
  listing_submitted: () => "Your listing has been submitted for review",
  listing_approved: () => "Your listing has been approved",
  listing_needs_changes: () => "Your listing needs a few changes",
  listing_removed: () => "Your listing has been removed",
  voting_window_opened: () => "Voting is now open",
  vote_confirmation: () => "Your vote has been recorded",
  city_upgrade: () => "Your city has leveled up",
  empire_upgrade: () => "The Empire has reached a new civilization level",
  quest_notification: () => "New quest available",
  leadership_nomination: () => "You have been nominated for a leadership role",
  leadership_election: () => "Leadership election is now open",
  treasury_funding_vote: () => "Treasury funding vote is open",
  general_announcement: () => "Important announcement from The Empire",
};

const BUILDERS: Record<string, (p: EmailParams) => EmailParams> = {
  welcome: (p) => ({
    firstName: p.firstName,
    emailTitle: "Welcome to the Empire",
    message:
      "Your account has been created and you are now part of the movement.\n\n" +
      "As a member, you will build your city, grow your empire, and leave a legacy for generations to come.\n\n" +
      "Your next step is to select your city and claim your member number.",
    buttonText: "Choose Your City",
    buttonUrl: "https://theundergroundblackempire.com/onboarding/city",
    secondaryText:
      "If you were referred by another member, keep your referral code handy -- you will enter it during onboarding.",
  }),
  email_verification: (p) => ({
    firstName: p.firstName,
    emailTitle: "Verify Your Email",
    message:
      "Please confirm your email address to complete your account setup.\n\n" +
      "Click the button below to verify. This link will expire in 24 hours.",
    buttonText: "Verify Email",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/auth/verify",
    secondaryText: "If you did not create an account, you can safely ignore this email.",
  }),
  password_reset: (p) => ({
    firstName: p.firstName,
    emailTitle: "Reset Your Password",
    message:
      "We received a request to reset your password.\n\n" +
      "Click the button below to choose a new password. This link will expire in 1 hour.",
    buttonText: "Reset Password",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/auth/reset-password",
    secondaryText: "If you did not request a password reset, ignore this email and your password will not change.",
  }),
  listing_submitted: (p) => ({
    firstName: p.firstName,
    emailTitle: "Listing Submitted",
    message:
      "Your marketplace listing has been submitted and is now in the review queue.\n\n" +
      "Our team will review it shortly. You will receive another email once it is approved or if any changes are needed.",
    buttonText: "View Your Listing",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/market",
    secondaryText: "Listings are typically reviewed within 24 hours.",
  }),
  listing_approved: (p) => ({
    firstName: p.firstName,
    emailTitle: "Listing Approved",
    message:
      "Your marketplace listing has been approved and is now live for all members to see.\n\n" +
      "You can view it on the marketplace at any time.",
    buttonText: "View on Marketplace",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/market",
    secondaryText: "Thank you for contributing to the Empire.",
  }),
  listing_needs_changes: (p) => ({
    firstName: p.firstName,
    emailTitle: "Listing Needs Changes",
    message:
      "Your marketplace listing needs a few changes before it can be approved.\n\n" +
      "Please review the feedback below, update your listing, and resubmit it for review.",
    buttonText: "Edit Your Listing",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/market",
    secondaryText: p.secondaryText ?? "See the review notes for specific changes needed.",
  }),
  listing_removed: (p) => ({
    firstName: p.firstName,
    emailTitle: "Listing Removed",
    message:
      "Your marketplace listing has been removed because it did not meet our community guidelines.\n\n" +
      "If you believe this was an error, or if you would like to submit a new listing, please contact support.",
    buttonText: "Contact Support",
    buttonUrl: "mailto:support@mail.theundergroundblackempire.com",
    secondaryText: p.secondaryText ?? "Please review our listing guidelines before submitting again.",
  }),
  voting_window_opened: () => ({
    firstName: "",
    emailTitle: "Voting Window Is Open",
    message:
      "A new voting window has opened. Your voice matters -- every vote shapes the future of the Empire.\n\n" +
      "Review the proposals and cast your vote before the window closes.",
    buttonText: "Cast Your Vote",
    buttonUrl: "https://theundergroundblackempire.com/vote",
    secondaryText: "Your voting power is determined by your membership tier and contributions.",
  }),
  vote_confirmation: () => ({
    firstName: "",
    emailTitle: "Vote Confirmed",
    message:
      "Your vote has been recorded. Thank you for participating in the Empire.\n\n" +
      "Results will be announced once the voting window closes. Stay tuned for the outcome.",
    buttonText: "View Voting Page",
    buttonUrl: "https://theundergroundblackempire.com/vote",
    secondaryText: "You can change your vote at any time before the window closes.",
  }),
  city_upgrade: () => ({
    firstName: "",
    emailTitle: "City Upgrade",
    message:
      "Congratulations! Your city has reached a new tier.\n\n" +
      "This means more influence, more capabilities, and a stronger position in the Empire.\n\n" +
      "Keep growing your population and contributing to unlock even higher tiers.",
    buttonText: "View Your City",
    buttonUrl: "https://theundergroundblackempire.com/empire",
    secondaryText: "The next tier brings new opportunities for your community.",
  }),
  empire_upgrade: () => ({
    firstName: "",
    emailTitle: "Empire Civilization Upgrade",
    message:
      "The Underground Black Empire has reached a new civilization level!\n\n" +
      "This is a collective achievement made possible by every member who has built, contributed, and voted.\n\n" +
      "New features and capabilities are now unlocked for all members.",
    buttonText: "View Empire Dashboard",
    buttonUrl: "https://theundergroundblackempire.com/empire",
    secondaryText: "Thank you for being part of this milestone.",
  }),
  quest_notification: (p) => ({
    firstName: p.firstName,
    emailTitle: "New Quest Available",
    message:
      "A new quest is available for you to complete.\n\n" +
      "Quests are time-limited missions that reward you with influence and recognition.\n\n" +
      "Complete it before the deadline to earn your reward.",
    buttonText: "View Quest",
    buttonUrl: "https://theundergroundblackempire.com/empire",
    secondaryText: p.secondaryText ?? "Check the Empire dashboard for full quest details.",
  }),
  leadership_nomination: (p) => ({
    firstName: p.firstName,
    emailTitle: "Leadership Nomination",
    message:
      "You have been nominated for a leadership role within the Empire.\n\n" +
      "If you accept, your name will appear on the ballot for the upcoming election.\n\n" +
      "You can accept or decline the nomination before the election begins.",
    buttonText: "View Nomination",
    buttonUrl: "https://theundergroundblackempire.com/empire",
    secondaryText: "Leadership is a responsibility -- please consider carefully before accepting.",
  }),
  leadership_election: () => ({
    firstName: "",
    emailTitle: "Leadership Election",
    message:
      "The leadership election is now open.\n\n" +
      "Review the candidates and cast your vote. Your participation determines who will guide the Empire forward.\n\n" +
      "Voting closes soon -- make your voice heard.",
    buttonText: "Vote Now",
    buttonUrl: "https://theundergroundblackempire.com/vote",
    secondaryText: "Each member gets one vote. Choose wisely.",
  }),
  treasury_funding_vote: () => ({
    firstName: "",
    emailTitle: "Treasury Funding Vote",
    message:
      "A treasury funding vote is now open.\n\n" +
      "Review the proposed funding allocations and cast your vote on how Empire resources should be distributed.\n\n" +
      "Your vote directly impacts which initiatives receive funding this cycle.",
    buttonText: "Review & Vote",
    buttonUrl: "https://theundergroundblackempire.com/vote",
    secondaryText: "Funding decisions are final once the voting window closes.",
  }),
  general_announcement: (p) => ({
    firstName: p.firstName,
    emailTitle: p.emailTitle || "Empire Announcement",
    message: p.message || "An important update has been posted to the Empire dashboard.",
    buttonText: p.buttonText ?? "View Empire Dashboard",
    buttonUrl: p.buttonUrl ?? "https://theundergroundblackempire.com/empire",
    secondaryText: p.secondaryText,
  }),
};

interface SendEmailRequest {
  type: string;
  to: string;
  params?: Partial<EmailParams>;
  preview?: boolean;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, authHeader.replace("Bearer ", ""), {
      auth: { persistSession: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const body: SendEmailRequest = await req.json();
    const { type, to, params, preview } = body;

    if (!type || !EMAIL_TYPES.includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid email type" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const baseParams: EmailParams = {
      firstName: params?.firstName ?? "Member",
      emailTitle: params?.emailTitle ?? "",
      message: params?.message ?? "",
      buttonText: params?.buttonText,
      buttonUrl: params?.buttonUrl,
      secondaryText: params?.secondaryText,
    };

    const builder = BUILDERS[type];
    const builtParams = builder(baseParams);
    const subject = SUBJECTS[type](builtParams);
    const html = renderMasterTemplate(builtParams);
    const text = renderPlainText(builtParams);

    if (preview) {
      return new Response(
        JSON.stringify({ subject, html, text, params: builtParams }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Recipient email address is required" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "Email service not configured. RESEND_API_KEY secret is missing." }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: to,
        reply_to: REPLY_TO,
        subject: subject,
        html: html,
        text: text,
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      return new Response(
        JSON.stringify({ error: `Resend API error: ${resendResponse.status}`, details: errorBody }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const result = await resendResponse.json();
    return new Response(
      JSON.stringify({ success: true, messageId: result.id }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
