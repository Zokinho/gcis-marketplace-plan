import { Resend } from 'resend';
import logger from '../utils/logger';

// ─── Resend Client ───

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@harvex.ca';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export const isEmailConfigured = !!RESEND_API_KEY;

let resend: Resend | null = null;
if (RESEND_API_KEY) {
  resend = new Resend(RESEND_API_KEY);
}

// ─── Core Send ───

interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: SENDER_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err : { message: String(err) }, to: input.to, subject: input.subject }, '[EMAIL] Failed to send');
  }
}

// ─── Shared Layout ───

function wrap(title: string, content: string, footerExtra?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<!-- Header -->
<tr><td style="background-color:#265463;padding:24px 32px;text-align:center;">
<div style="font-size:24px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Harvex</div>
</td></tr>
<!-- Content -->
<tr><td style="padding:32px;">
${content}
</td></tr>
<!-- Footer -->
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Harvex &mdash; B2B Cannabis Marketplace</p>
${footerExtra || `<a href="${FRONTEND_URL}/settings" style="font-size:12px;color:#265463;text-decoration:underline;">Manage email preferences</a>`}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background-color:#265463;border-radius:8px;padding:12px 28px;">
<a href="${href}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${label}</a>
</td></tr></table>`;
}

// ─── Specific Emails ───

export function sendPasswordResetEmail(email: string, token: string): void {
  const url = `${FRONTEND_URL}/reset-password/${token}`;
  const html = wrap('Reset your password', `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Reset your password</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      We received a request to reset your Harvex password. Click the button below to create a new password.
    </p>
    ${btn(url, 'Reset Password')}
    <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
  `, '');
  sendEmail({ to: email, subject: 'Reset your Harvex password', html });
}

export function sendWelcomeEmail(email: string, firstName: string | null): void {
  const name = firstName || 'there';
  const html = wrap('Welcome to Harvex', `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Welcome to Harvex, ${name}!</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Thanks for signing up. Your account is being reviewed by our team. You'll receive an email once it's approved.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      In the meantime, make sure you've completed the onboarding steps: accept the EULA and upload your agreements.
    </p>
    ${btn(FRONTEND_URL, 'Go to Harvex')}
  `);
  sendEmail({ to: email, subject: 'Welcome to Harvex', html });
}

export function sendAccountApprovedEmail(email: string, firstName: string | null): void {
  const name = firstName || 'there';
  const html = wrap('Account Approved', `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">You're approved, ${name}!</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Your Harvex account has been approved. You now have full access to the marketplace.
    </p>
    ${btn(`${FRONTEND_URL}/marketplace`, 'Browse Marketplace')}
  `);
  sendEmail({ to: email, subject: 'Your Harvex account is approved', html });
}

export function sendAccountRejectedEmail(email: string, firstName: string | null): void {
  const name = firstName || 'there';
  const html = wrap('Account Update', `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Account update</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      Hi ${name}, unfortunately your Harvex account application was not approved at this time.
      If you believe this is an error, please contact our team.
    </p>
  `, '');
  sendEmail({ to: email, subject: 'Harvex account update', html });
}

export function sendAdminNewUserAlert(adminEmails: string[], newUser: { email: string; firstName: string | null; lastName: string | null; companyName: string | null; contactType: string | null }): void {
  const name = [newUser.firstName, newUser.lastName].filter(Boolean).join(' ') || newUser.email;
  const html = wrap('New User Pending Approval', `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">New user pending approval</h2>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      A new user has registered on Harvex and is awaiting approval.
    </p>
    <table style="width:100%;font-size:14px;color:#374151;margin-bottom:16px;" cellpadding="4" cellspacing="0">
      <tr><td style="font-weight:600;width:100px;">Name</td><td>${name}</td></tr>
      <tr><td style="font-weight:600;">Email</td><td>${newUser.email}</td></tr>
      <tr><td style="font-weight:600;">Company</td><td>${newUser.companyName || 'N/A'}</td></tr>
      <tr><td style="font-weight:600;">Type</td><td>${newUser.contactType || 'N/A'}</td></tr>
    </table>
    ${btn(`${FRONTEND_URL}/users`, 'Review Users')}
  `, '');
  sendEmail({ to: adminEmails, subject: `New user pending approval: ${name}`, html });
}

// ─── Notification Emails ───

interface NotificationEmailInput {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export function sendNotificationEmail(user: { email: string; firstName: string | null }, notification: NotificationEmailInput): void {
  const subjectMap: Record<string, string> = {
    BID_RECEIVED: 'New bid on your product',
    BID_ACCEPTED: 'Your bid was accepted',
    BID_REJECTED: 'Bid update',
    BID_COUNTERED: 'Counter offer received',
    BID_OUTCOME: 'Delivery outcome recorded',
    PRODUCT_APPROVED: 'Your listing is live',
    PRODUCT_NEW: 'New product on Harvex',
    PRODUCT_PRICE: 'Price change alert',
    PRODUCT_STOCK: 'Stock update',
    MATCH_SUGGESTION: 'New product match for you',
    COA_PROCESSED: 'CoA processing complete',
    PREDICTION_DUE: 'Reorder reminder',
    SHORTLIST_PRICE_DROP: 'Price drop on saved product',
    ISO_MATCH_FOUND: 'We found a match for your request',
    ISO_SELLER_RESPONSE: 'A seller responded to your request',
    EDIT_APPROVED: 'Your listing edit was approved',
    EDIT_REJECTED: 'Listing edit update',
    SYSTEM_ANNOUNCEMENT: notification.title,
  };

  const subject = subjectMap[notification.type] || notification.title;
  const name = user.firstName || 'there';

  // Build a CTA link based on notification type
  let ctaUrl = FRONTEND_URL;
  let ctaLabel = 'Go to Harvex';
  const data = notification.data || {};

  if (data.productId) {
    ctaUrl = `${FRONTEND_URL}/marketplace/${data.productId}`;
    ctaLabel = 'View Product';
  }
  if (data.bidId || notification.type.startsWith('BID_')) {
    ctaUrl = `${FRONTEND_URL}/orders`;
    ctaLabel = 'View Orders';
  }
  if (notification.type === 'ISO_MATCH_FOUND' || notification.type === 'ISO_SELLER_RESPONSE') {
    ctaUrl = `${FRONTEND_URL}/iso`;
    ctaLabel = 'View ISO Board';
  }
  if (notification.type === 'MATCH_SUGGESTION') {
    ctaUrl = `${FRONTEND_URL}/my-matches`;
    ctaLabel = 'View Matches';
  }

  const html = wrap(subject, `
    <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Hi ${name},</h2>
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#111827;">${notification.title}</p>
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      ${notification.body}
    </p>
    ${btn(ctaUrl, ctaLabel)}
  `);

  sendEmail({ to: user.email, subject, html });
}
