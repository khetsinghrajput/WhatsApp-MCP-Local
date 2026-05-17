/**
 * WhatsApp Chat Export Importer
 *
 * Usage:
 *   npm run import -- "C:/path/to/WhatsApp Chat with Moiz Ada.txt" "923112294157@s.whatsapp.net" "Moiz Ada"
 *
 * Export the chat from WhatsApp on your phone:
 *   Chat → ⋮ → More → Export Chat → Without Media → save the .txt file
 */
import { readFileSync } from 'fs';
import * as db from './database.js';

// Handles both WhatsApp export formats:
// Format A (newer): [17/05/2026, 10:30:45 AM] Sender: Message
// Format B (older): 17/05/2026, 10:30 - Sender: Message
const PATTERNS = [
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s+([^:]+):\s*(.*)/i,
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s+([^:]+):\s*(.*)/,
];

const SKIP_PHRASES = [
  'Messages and calls are end-to-end encrypted',
  'changed their phone number to a new number',
  'created group',
  'changed the group',
  'changed the subject',
  'added you',
  'You were added',
];

function parseTimestamp(dateStr: string, timeStr: string): number {
  const parts = dateStr.split('/').map(Number);
  // Support both DD/MM/YY and DD/MM/YYYY
  let [day, month, year] = parts;
  if (year < 100) year += 2000;

  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.endsWith('PM');
  const isAM = clean.endsWith('AM');
  const digits = clean.replace(/[AP]M$/, '').trim().split(':').map(Number);

  let [h, m, s] = [digits[0] ?? 0, digits[1] ?? 0, digits[2] ?? 0];
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;

  return Math.floor(new Date(year, month - 1, day, h, m, s).getTime() / 1000);
}

function shouldSkip(sender: string, text: string): boolean {
  return SKIP_PHRASES.some(p => text.startsWith(p) || sender.startsWith(p));
}

function parseExport(
  content: string,
  jid: string,
  contactName?: string,
): Parameters<typeof db.insertMessage>[0][] {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  const results: Parameters<typeof db.insertMessage>[0][] = [];
  let current: (typeof results)[0] | null = null;
  let seq = 0;

  const flush = () => {
    if (current) {
      current.body = current.body.trim();
      if (current.body) results.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    let matched = false;
    for (const pat of PATTERNS) {
      const m = line.match(pat);
      if (!m) continue;

      flush();
      matched = true;

      const [, dateStr, timeStr, rawSender, text] = m;
      const sender = rawSender.trim();
      const isFromMe = sender.toLowerCase() === 'you';
      const body = text.trim() === '<Media omitted>' ? '[Media]' : text.trim();

      if (!shouldSkip(sender, body)) {
        current = {
          id: `import_${jid}_${++seq}`,
          jid,
          fromJid: isFromMe ? undefined : jid,
          fromName: isFromMe ? undefined : (contactName ?? sender),
          body: body || '[empty]',
          timestamp: parseTimestamp(dateStr, timeStr),
          isFromMe,
        };
      }
      break;
    }

    // Multi-line message continuation
    if (!matched && current && line.trim()) {
      current.body += '\n' + line;
    }
  }
  flush();

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const [filePath, jid, contactName] = args;

  if (!filePath || !jid) {
    console.error(`
WhatsApp Chat Export Importer
──────────────────────────────
Usage:
  npm run import -- "<path-to-txt>" "<jid>" "<contact-name>"

Example:
  npm run import -- "C:/Users/You/Downloads/WhatsApp Chat with Moiz Ada.txt" "923112294157@s.whatsapp.net" "Moiz Ada"

How to export a chat from WhatsApp (on your phone):
  1. Open the chat
  2. Tap ⋮ → More → Export Chat
  3. Choose "Without Media"
  4. Save / send the .txt file to your computer
`);
    process.exit(1);
  }

  console.log(`Reading: ${filePath}`);
  const content = readFileSync(filePath, 'utf8');

  console.log('Parsing messages…');
  const messages = parseExport(content, jid, contactName);

  if (messages.length === 0) {
    console.error('No messages found. Check the file format.');
    process.exit(1);
  }

  // Register chat + contact
  db.upsertChat({
    jid,
    name: contactName ?? jid.split('@')[0],
    isGroup: jid.endsWith('@g.us'),
    lastMessageTime: messages.at(-1)?.timestamp,
    lastMessage: messages.at(-1)?.body,
  });
  if (contactName) db.upsertContact(jid, contactName);

  // Bulk insert (de-duplicates automatically via INSERT OR IGNORE)
  db.insertMessageBatch(messages);

  const stats = db.getStats();
  const oldest = messages[0];
  const newest = messages.at(-1);

  console.log(`
✅ Import complete!
   Contact  : ${contactName ?? jid}
   JID      : ${jid}
   Messages : ${messages.length.toLocaleString()} imported
   Range    : ${new Date(oldest!.timestamp * 1000).toLocaleDateString()} → ${new Date(newest!.timestamp * 1000).toLocaleDateString()}

📦 Database now has ${stats.totalMessages.toLocaleString()} messages across ${stats.totalChats} chats
📅 Oldest message: ${stats.oldestMessage}

You can now search these messages in Claude using whatsapp_search_messages.
`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
