// Plain, branded email bodies (HTML + text). Colors are inlined because mail clients ignore stylesheets, so they are the
// overload-daylight values from src/styles/theme.css (email is always light). Plate blue is only used for the button fill.
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const INK = "#16181a"; // base-content
const MUTED = "#565b62"; // muted
const FLOOR = "#f2f2ef"; // base-100 (page)
const PANEL = "#e5e5e0"; // base-200 (card)
const HAIRLINE = "#c4c6c0"; // base-300
const BLUE = "#2556c4"; // primary (white on it 6.55:1)
const SANS = "Arial,Helvetica,sans-serif";
const DISPLAY = "'Arial Narrow',Arial,Helvetica,sans-serif";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function layout(opts: { preheader: string; heading: string; paragraphs: string[]; cta: { label: string; url: string }; footer: string }): string {
  const paragraphs = opts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK};">${escapeHtml(p)}</p>`).join("");
  const url = escapeHtml(opts.cta.url);
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:${FLOOR};font-family:${SANS};color:${INK};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:${PANEL};border:1px solid ${HAIRLINE};border-radius:6px;">
<tr><td style="padding:28px;">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};">Overload</p>
<h1 style="margin:0 0 20px;padding-bottom:12px;border-bottom:1px solid ${HAIRLINE};font-family:${DISPLAY};font-size:32px;font-style:italic;font-weight:700;text-transform:uppercase;line-height:1.15;color:${INK};">${escapeHtml(opts.heading)}</h1>
${paragraphs}
<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:${BLUE};color:#ffffff;border-radius:4px;text-decoration:none;font-size:16px;font-weight:700;">${escapeHtml(opts.cta.label)}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${INK};">If the button does not work, paste this link into your browser:<br><a href="${url}" style="color:${INK};word-break:break-all;">${url}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(opts.footer)}</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function verificationEmail(opts: { name: string; url: string }): EmailContent {
  const greeting = `Hi ${opts.name || "there"},`;
  const lines = ["Confirm your email address to finish creating your Overload account.", "This link works once and expires in one hour."];
  const footer = "Did not sign up? You can ignore this email and nothing will happen.";
  return {
    subject: "Confirm your Overload email",
    html: layout({
      preheader: "Confirm your email to start logging.",
      heading: "Confirm your email",
      paragraphs: [greeting, ...lines],
      cta: { label: "Confirm email", url: opts.url },
      footer,
    }),
    text: [greeting, "", ...lines, "", `Confirm your email: ${opts.url}`, "", footer].join("\n"),
  };
}

export function passwordResetEmail(opts: { name: string; url: string }): EmailContent {
  const greeting = `Hi ${opts.name || "there"},`;
  const lines = ["Someone asked to reset the password for your Overload account.", "This link works once and expires in one hour."];
  const footer = "Did not ask for this? Ignore this email: your password stays the same.";
  return {
    subject: "Reset your Overload password",
    html: layout({
      preheader: "Choose a new password.",
      heading: "Reset your password",
      paragraphs: [greeting, ...lines],
      cta: { label: "Choose a new password", url: opts.url },
      footer,
    }),
    text: [greeting, "", ...lines, "", `Reset your password: ${opts.url}`, "", footer].join("\n"),
  };
}
