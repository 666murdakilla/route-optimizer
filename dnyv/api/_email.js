// Transactional email via Resend. Sending must never block or fail an
// applicant's submission — callers wrap this and ignore failures.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

export async function sendApplicationReceived({ to, name, fileNumber }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const bcc = process.env.EMAIL_BCC || undefined;
  if (!apiKey || !from) {
    console.error('email: missing RESEND_API_KEY / EMAIL_FROM');
    return { ok: false };
  }

  const subject = `Your application has been received — ${fileNumber}`;
  const lines = [
    `Dear ${name},`,
    ``,
    `The Department has received your application for Verification by Origin (Track 1). Your file number is ${fileNumber}. Keep it; all correspondence regarding your application will reference it.`,
    ``,
    `Your file is now in the queue for review. Every application is examined by a human Borough Verifier, in the order received. The Department does not adjudicate status by telephone, and it will not do so on the street, however forcefully asked.`,
    ``,
    `You will be notified of your determination — Verified, Denied, or Returned for Insufficient Suffering — in due course. No further action is required at this time.`,
    ``,
    `Correspondence regarding your file may be directed to verify@dnyv.nyc. The Department reads its mail.`,
    ``,
    `— Department of New Yorker Verification, City of New York`,
  ];
  const text = `Department of New Yorker Verification\nCity of New York\n\n` + lines.join('\n');

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd;">
    <tr><td style="background:#050560;padding:20px 28px;">
      <div style="color:#b5c4ff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">City of New York</div>
      <div style="color:#fff;font-size:18px;font-weight:600;margin-top:2px;">Department of New Yorker Verification</div>
    </td></tr>
    <tr><td style="padding:28px;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px;">Dear ${esc(name)},</p>
      <p style="margin:0 0 16px;">The Department has received your application for Verification by Origin (Track&nbsp;1). Your file number is <strong>${esc(fileNumber)}</strong>. Keep it; all correspondence regarding your application will reference it.</p>
      <p style="margin:0 0 16px;">Your file is now in the queue for review. Every application is examined by a human Borough Verifier, in the order received. The Department does not adjudicate status by telephone, and it will not do so on the street, however forcefully asked.</p>
      <p style="margin:0 0 16px;">You will be notified of your determination — Verified, Denied, or Returned for Insufficient Suffering — in due course. No further action is required at this time.</p>
      <p style="margin:0 0 16px;color:#555;">Correspondence regarding your file may be directed to <a href="mailto:verify@dnyv.nyc" style="color:#103FEF;">verify@dnyv.nyc</a>. The Department reads its mail.</p>
      <p style="margin:24px 0 0;color:#555;font-size:14px;">— Department of New Yorker Verification, City of New York</p>
    </td></tr>
  </table></body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, bcc, reply_to: 'verify@dnyv.nyc', subject, text, html }),
    });
    if (!res.ok) {
      console.error('email: resend responded', res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('email: send failed', err);
    return { ok: false };
  }
}
