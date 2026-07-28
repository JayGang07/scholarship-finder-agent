/**
 * Mailer service — sends digest emails via Nodemailer SMTP.
 * Falls back to console logging if SMTP is not configured.
 */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Mailer] SMTP not configured — emails will be logged to console');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

/**
 * Send a digest email. Returns { sent: boolean, message: string }.
 */
async function sendDigest(toEmail, htmlBody, subject) {
  const t = getTransporter();

  const mailSubject = subject || `🎓 Scholarship Digest — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  if (!t) {
    console.log('\n' + '='.repeat(60));
    console.log('[Mailer] DIGEST PREVIEW (SMTP not configured)');
    console.log(`To: ${toEmail}`);
    console.log(`Subject: ${mailSubject}`);
    console.log('='.repeat(60));
    console.log('HTML body logged — configure SMTP env vars to send for real.');
    console.log('='.repeat(60) + '\n');
    return { sent: false, message: 'SMTP not configured — digest logged to console' };
  }

  try {
    const info = await t.sendMail({
      from: `"Scholarship Finder" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: mailSubject,
      html: htmlBody,
    });

    console.log(`[Mailer] Digest sent to ${toEmail}: ${info.messageId}`);
    return { sent: true, message: `Email sent: ${info.messageId}` };
  } catch (err) {
    console.error(`[Mailer] Send failed: ${err.message}`);
    return { sent: false, message: `Send failed: ${err.message}` };
  }
}

module.exports = { sendDigest };
