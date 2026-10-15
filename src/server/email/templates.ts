// Plain, branded email bodies (HTML + text). Colors are inlined because mail clients ignore stylesheets.
// Vermilion is only used for the rule and the button fill, never for body text.
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const INK = "#141414";
const PAPER = "#f4f2ed";
const VERMILION = "#e4402b";

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function layout(opts: { preheader: string; heading: string; paragraphs: string[]; cta: { label: string; url: string }; footer: string }): string {
  const paragraphs = opts.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${INK};">${escapeHtml(p)}</p>`).join("");
  const url = escapeHtml(opts.cta.url);
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:${PAPER};font-family:Georgia,'Times New Roman',serif;color:${INK};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:2px solid ${INK};box-shadow:6px 6px 0 ${VERMILION};">
<tr><td style="padding:28px;">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${INK};">Overload</p>
<h1 style="margin:0 0 20px;padding-bottom:12px;border-bottom:2px solid ${VERMILION};font-size:30px;font-weight:400;color:${INK};">${escapeHtml(opts.heading)}</h1>
${paragraphs}
<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:${VERMILION};color:#ffffff;text-decoration:none;font-size:16px;">${escapeHtml(opts.cta.label)}</a></p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${INK};">If the button does not work, paste this link into your browser:<br><a href="${url}" style="color:${INK};word-break:break-all;">${url}</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:${INK};opacity:.75;">${escapeHtml(opts.footer)}</p>
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
