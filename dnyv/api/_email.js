// Transactional email via Resend. Sending must never block or fail the caller's
// primary action (a submission, a determination, a waitlist signup) — callers
// wrap these and ignore failures.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

const SIGNOFF = '— Department of New Yorker Verification, City of New York';
const CONTACT_TEXT = 'Correspondence regarding your file may be directed to verify@dnyv.nyc. The Department reads its mail.';
const CONTACT_HTML = 'Correspondence regarding your file may be directed to <a href="mailto:verify@dnyv.nyc" style="color:#103FEF;">verify@dnyv.nyc</a>. The Department reads its mail.';

// Wraps inner HTML in the Department letterhead used by every message.
const shell = (inner) => `<!doctype html><html><body style="margin:0;background:#f5f5f5;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ddd;">
    <tr><td style="background:#050560;padding:20px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:16px;"><img src="https://dnyv.nyc/assets/dnyv-seal.png" width="52" height="52" alt="Department of New Yorker Verification seal" style="display:block;border:0;"></td>
        <td valign="middle">
          <div style="color:#b5c4ff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;">City of New York</div>
          <div style="color:#fff;font-size:18px;font-weight:600;margin-top:2px;">Department of New Yorker Verification</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px;font-size:15px;line-height:1.6;">${inner}</td></tr>
  </table></body></html>`;

const p = (html, extra = '') => `<p style="margin:0 0 16px;${extra}">${html}</p>`;
const textDoc = (lines) => `Department of New Yorker Verification\nCity of New York\n\n` + lines.join('\n');

async function deliver({ to, subject, text, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const bcc = process.env.EMAIL_BCC || undefined;
  if (!apiKey || !from) {
    console.error('email: missing RESEND_API_KEY / EMAIL_FROM');
    return { ok: false };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, bcc, reply_to: 'verify@dnyv.nyc', subject, text, html, ...(attachments ? { attachments } : {}) }),
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

// ---- Application received (on finalize) --------------------------------------
export async function sendApplicationReceived({ to, name, fileNumber }) {
  const subject = `Your application has been received — ${fileNumber}`;
  const lines = [
    `Dear ${name},`, ``,
    `The Department has received your application for Verification by Origin (Track 1). Your file number is ${fileNumber}. Keep it; all correspondence regarding your application will reference it.`, ``,
    `Your file is now in the queue for review. Every application is examined by a human Borough Verifier, in the order received. The Department does not adjudicate status by telephone, and it will not do so on the street, however forcefully asked.`, ``,
    `You will be notified of your determination — Verified, Denied, or Returned for Insufficient Suffering — in due course. No further action is required at this time.`, ``,
    CONTACT_TEXT, ``, SIGNOFF,
  ];
  const html = shell(
    p(`Dear ${esc(name)},`) +
    p(`The Department has received your application for Verification by Origin (Track&nbsp;1). Your file number is <strong>${esc(fileNumber)}</strong>. Keep it; all correspondence regarding your application will reference it.`) +
    p(`Your file is now in the queue for review. Every application is examined by a human Borough Verifier, in the order received. The Department does not adjudicate status by telephone, and it will not do so on the street, however forcefully asked.`) +
    p(`You will be notified of your determination — Verified, Denied, or Returned for Insufficient Suffering — in due course. No further action is required at this time.`) +
    p(CONTACT_HTML, 'color:#555;') +
    p(SIGNOFF, 'margin-top:24px;color:#555;font-size:14px;')
  );
  return deliver({ to, subject, text: textDoc(lines), html });
}

// ---- Verified (determination) ------------------------------------------------
// certPdf: Uint8Array/Buffer of the Certificate of Verification. cardUrl: the
// token-gated link where the recipient views and prints their ID card.
export async function sendVerified({ to, name, fileNumber, cardUrl, certPdf }) {
  const subject = `Congratulations! You are a Verified New Yorker — ${fileNumber}`;
  const lines = [
    `Dear ${name},`, ``,
    `The Department has completed its review of your application for Verification by Origin (Track 1), file number ${fileNumber}, and has reached a determination.`, ``,
    `You are Verified.`, ``,
    `By documentary evidence, you have established that you came of age in New York City, and the Title of New Yorker is conferred to you. It is permanent. It does not lapse when you leave, and it cannot be revoked by the passage of time or the acquisition of a lawn. Once a New Yorker, always a New Yorker — subject only to the Code of Conduct, which binds the native and the verified alike.`, ``,
    `Your Certificate of Verification is attached to this message, suitable for printing and framing.`, ``,
    `Your New Yorker identification card — bearing your file number and photograph — is ready to view, download, and print here:`, ``,
    cardUrl, ``,
    `The link is issued for your file alone. Keep it to yourself.`, ``,
    `If you would prefer an official printed identification card — issued on Department stock and mailed to you — write to verify@dnyv.nyc with your file number, and the Department will arrange it.`, ``,
    `Carry the Title with the standing it deserves. You have nothing left to prove — though you will, of course, go on proving it anyway. That is the condition.`, ``,
    CONTACT_TEXT, ``, SIGNOFF,
  ];
  const html = shell(
    p(`Dear ${esc(name)},`) +
    p(`The Department has completed its review of your application for Verification by Origin (Track&nbsp;1), file number <strong>${esc(fileNumber)}</strong>, and has reached a determination.`) +
    p(`<span style="font-size:20px;font-weight:700;color:#050560;">You are Verified.</span>`) +
    p(`By documentary evidence, you have established that you came of age in New York City, and the Title of New Yorker is conferred to you. It is permanent. It does not lapse when you leave, and it cannot be revoked by the passage of time or the acquisition of a lawn. Once a New Yorker, always a New Yorker — subject only to the Code of Conduct, which binds the native and the verified alike.`) +
    p(`Your <strong>Certificate of Verification</strong> is attached to this message, suitable for printing and framing.`) +
    p(`Your <strong>New Yorker identification card</strong> — bearing your file number and photograph — is ready to view, download, and print:`) +
    `<p style="margin:0 0 8px;"><a href="${esc(cardUrl)}" style="display:inline-block;background:#103FEF;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:2px;">View your New Yorker ID card &rarr;</a></p>` +
    p(`The link is issued for your file alone. Keep it to yourself.`, 'color:#555;font-size:13px;') +
    p(`If you would prefer an official printed identification card — issued on Department stock and mailed to you — write to <a href="mailto:verify@dnyv.nyc" style="color:#103FEF;">verify@dnyv.nyc</a> with your file number, and the Department will arrange it.`) +
    p(`Carry the Title with the standing it deserves. You have nothing left to prove — though you will, of course, go on proving it anyway. That is the condition.`) +
    p(CONTACT_HTML, 'color:#555;') +
    p(SIGNOFF, 'margin-top:24px;color:#555;font-size:14px;')
  );
  const attachments = certPdf
    ? [{ filename: `Certificate of Verification — ${fileNumber}.pdf`, content: Buffer.from(certPdf).toString('base64') }]
    : undefined;
  return deliver({ to, subject, text: textDoc(lines), html, attachments });
}

// ---- Denied (determination) --------------------------------------------------
export async function sendDenied({ to, name, fileNumber, note }) {
  const subject = `A determination on your application — ${fileNumber}`;
  const reasonText = note
    ? `The reason, and the point at which your claim failed: ${note}`
    : `The evidence submitted did not establish the requirements of the Track under which you applied.`;
  const reasonHtml = note
    ? `The reason, and the point at which your claim failed: ${esc(note)}`
    : `The evidence submitted did not establish the requirements of the Track under which you applied.`;
  const lines = [
    `Dear ${name},`, ``,
    `The Department has completed its review of your application for Verification by Origin (Track 1), file number ${fileNumber}, and has reached a determination.`, ``,
    `Status is refused.`, ``,
    reasonText, ``,
    `This is not a statement about your character, your affection for the city, or the number of years you have given it. It is a statement about the evidence. The Department does not verify feeling. It verifies proof.`, ``,
    `You may appeal this determination once, no later than 90 days from the date of this letter. The filing fee is one documented act of genuine kindness performed for a stranger. There is no monetary fee. Instructions accompany the appeal on request.`, ``,
    CONTACT_TEXT, ``, SIGNOFF,
  ];
  const html = shell(
    p(`Dear ${esc(name)},`) +
    p(`The Department has completed its review of your application for Verification by Origin (Track&nbsp;1), file number <strong>${esc(fileNumber)}</strong>, and has reached a determination.`) +
    p(`<span style="font-size:18px;font-weight:700;">Status is refused.</span>`) +
    p(reasonHtml) +
    p(`This is not a statement about your character, your affection for the city, or the number of years you have given it. It is a statement about the evidence. The Department does not verify feeling. It verifies proof.`) +
    p(`You may appeal this determination once, no later than 90 days from the date of this letter. The filing fee is one documented act of genuine kindness performed for a stranger. There is no monetary fee. Instructions accompany the appeal on request.`) +
    p(CONTACT_HTML, 'color:#555;') +
    p(SIGNOFF, 'margin-top:24px;color:#555;font-size:14px;')
  );
  return deliver({ to, subject, text: textDoc(lines), html });
}

// ---- Returned for Insufficient Suffering (determination) ---------------------
export async function sendReturned({ to, name, fileNumber, note }) {
  const subject = `Your application has been returned — ${fileNumber}`;
  const lines = [
    `Dear ${name},`, ``,
    `The Department has completed its review of your application, file number ${fileNumber}, and has reached a determination.`, ``,
    `Your application is Returned for Insufficient Suffering.`, ``,
    `Understand what this is, and what it is not. You met the point threshold. Your tenure, your labor, your accumulated experience of the city are not in question. What is missing is hardship — endured, survived, and learned from. The Mandatory Suffering Clause is not a formality, and it cannot be waived. The Department does not recognize a New Yorker who has not suffered.`, ``,
    `This is not a denial. It is an instruction. Go live a little more. Miss the last train. Get some bedbugs. Lose the apartment. Invite some rats to live in your walls. Get your heart broken on the platform. Come back when the city has cost you something, and bring the proof.`, ``,
    ...(note ? [note, ``] : []),
    `Your file remains open. No new application is required for reconsideration; when you are ready, and have lived a bit more, write to the Department and say so.`, ``,
    CONTACT_TEXT, ``, SIGNOFF,
  ];
  const html = shell(
    p(`Dear ${esc(name)},`) +
    p(`The Department has completed its review of your application, file number <strong>${esc(fileNumber)}</strong>, and has reached a determination.`) +
    p(`<span style="font-size:18px;font-weight:700;">Your application is Returned for Insufficient Suffering.</span>`) +
    p(`Understand what this is, and what it is not. You met the point threshold. Your tenure, your labor, your accumulated experience of the city are not in question. What is missing is hardship — endured, survived, and learned from. The Mandatory Suffering Clause is not a formality, and it cannot be waived. The Department does not recognize a New Yorker who has not suffered.`) +
    p(`This is not a denial. It is an instruction. Go live a little more. Miss the last train. Get some bedbugs. Lose the apartment. Invite some rats to live in your walls. Get your heart broken on the platform. Come back when the city has cost you something, and bring the proof.`) +
    (note ? p(esc(note), 'color:#555;') : '') +
    p(`Your file remains open. No new application is required for reconsideration; when you are ready, and have lived a bit more, write to the Department and say so.`) +
    p(CONTACT_HTML, 'color:#555;') +
    p(SIGNOFF, 'margin-top:24px;color:#555;font-size:14px;')
  );
  return deliver({ to, subject, text: textDoc(lines), html });
}

// ---- Waitlist confirmation (Track 2 "Get notified") --------------------------
export async function sendWaitlistConfirmation({ to }) {
  const subject = `You're on the list — Track 2 (Verification by Experience)`;
  const trackUrl = 'https://dnyv.nyc/#apply-track1';
  const lines = [
    `Dear prospective New Yorker,`, ``,
    `The Department has recorded your request to be notified when Verification by Experience (Track 2) opens.`, ``,
    `You're on the list. When the schedule of qualifying experiences is finalized and Track 2 opens for applications, the Department will write to this address. It will not otherwise write to you, and it will not share your address with anyone.`, ``,
    `Until then there is nothing to do but keep living here — which, if you are the sort of person who signed up for this, you were going to do anyway.`, ``,
    `One thing worth knowing while you wait: Track 2 is not the easy road. It is a petition to be admitted, on merit, to a people, and the threshold is high on purpose. But if you came of age in New York City, you may not need to wait at all — you may already qualify for Track 1, Verification by Origin, which is open now: ${trackUrl}`, ``,
    SIGNOFF,
  ];
  const html = shell(
    p(`Dear prospective New Yorker,`) +
    p(`The Department has recorded your request to be notified when Verification by Experience (Track&nbsp;2) opens.`) +
    p(`<strong>You're on the list.</strong> When the schedule of qualifying experiences is finalized and Track 2 opens for applications, the Department will write to this address. It will not otherwise write to you, and it will not share your address with anyone.`) +
    p(`Until then there is nothing to do but keep living here — which, if you are the sort of person who signed up for this, you were going to do anyway.`) +
    p(`One thing worth knowing while you wait: Track 2 is not the easy road. It is a petition to be admitted, on merit, to a people, and the threshold is high on purpose. But if you came of age in New York City, you may not need to wait at all — you may already qualify for <a href="${trackUrl}" style="color:#103FEF;">Track 1, Verification by Origin, which is open now</a>.`) +
    p(SIGNOFF, 'margin-top:24px;color:#555;font-size:14px;')
  );
  return deliver({ to, subject, text: textDoc(lines), html });
}
