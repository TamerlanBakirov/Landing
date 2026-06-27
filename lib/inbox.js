import { ImapFlow } from 'imapflow';
import { loadEnv } from './env.js';

loadEnv();

// Reads the agency Gmail inbox over IMAP and returns the set of email
// addresses that have replied (i.e. sent us a message). Used so follow-up
// emails are never sent to a business that already answered.
// Requires SMTP_USER + SMTP_PASS (Gmail App Password works for IMAP too).
export async function getRepliedAddresses(sinceDays = 30) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.log('[Inbox] SMTP_USER/SMTP_PASS not set; skipping inbox check.');
    return new Set();
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false
  });

  const replied = new Set();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const from = msg.envelope?.from?.[0]?.address;
        if (from) replied.add(from.trim().toLowerCase());
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.log(`[Inbox] IMAP error: ${err.message}`);
  } finally {
    try { await client.logout(); } catch {}
  }

  return replied;
}
