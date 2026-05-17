/**
 * WhatsApp MCP — Local stdio server
 *
 * Everything runs on the client's machine.
 * No cloud, no servers, developer sees nothing.
 *
 * Claude Desktop config:
 * {
 *   "mcpServers": {
 *     "whatsapp": {
 *       "command": "node",
 *       "args": ["--import", "tsx", "/path/to/whatsapp-mcp-local/src/index.ts"]
 *     }
 *   }
 * }
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initWhatsApp, getStatus, sendMessage } from './whatsapp.js';
import * as db from './database.js';

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new McpServer({
  name: 'WhatsApp MCP',
  version: '1.0.0',
});

// ── Tools ─────────────────────────────────────────────────────────────────────

server.tool(
  'whatsapp_status',
  'Check if WhatsApp is connected and see database stats (total messages, how far back history goes)',
  {},
  async () => {
    const { status, phoneNumber } = getStatus();
    const stats = db.getStats();

    if (status === 'connected') {
      const lines = [
        `✅ Connected — +${phoneNumber}`,
        `📦 ${stats.totalMessages.toLocaleString()} messages stored across ${stats.totalChats} chats`,
        stats.oldestMessage ? `📅 History goes back to: ${stats.oldestMessage}` : '',
        `👥 ${stats.totalContacts} contacts indexed`,
      ].filter(Boolean);
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
    if (status === 'qr') {
      return { content: [{ type: 'text', text: '⏳ Waiting for QR scan — check your browser at http://localhost:3000' }] };
    }
    if (status === 'startup') {
      return { content: [{ type: 'text', text: '⏳ Connecting to WhatsApp…' }] };
    }
    return { content: [{ type: 'text', text: '❌ Disconnected. Restart the MCP server to reconnect.' }] };
  },
);

server.tool(
  'whatsapp_list_chats',
  'List WhatsApp chats sorted by most recent. Returns chat IDs needed for other tools.',
  {
    limit: z.number().optional().describe('Max chats to return (default 50)'),
  },
  async ({ limit }) => {
    const chats = db.listChats(limit ?? 50);
    if (!chats.length) {
      return { content: [{ type: 'text', text: 'No chats yet. Make sure WhatsApp is connected and wait for history to sync.' }] };
    }
    const lines = chats.map(c => {
      const tag = c.is_group ? '[Group]' : '[DM]';
      const name = c.name ?? c.jid.split('@')[0];
      const unread = c.unread_count > 0 ? ` (${c.unread_count} unread)` : '';
      const preview = c.last_message ? ` — "${c.last_message.slice(0, 60)}"` : '';
      const time = c.last_message_time
        ? ` · ${new Date(c.last_message_time * 1000).toLocaleDateString()}`
        : '';
      return `${tag} ${name}${unread}${time}\n  ID: ${c.jid}${preview}`;
    });
    return { content: [{ type: 'text', text: `${chats.length} chats:\n\n${lines.join('\n\n')}` }] };
  },
);

server.tool(
  'whatsapp_list_groups',
  'List only WhatsApp group chats',
  {},
  async () => {
    const groups = db.listChats(200).filter(c => c.is_group);
    if (!groups.length) return { content: [{ type: 'text', text: 'No group chats found.' }] };
    const lines = groups.map(g => {
      const unread = g.unread_count > 0 ? ` (${g.unread_count} unread)` : '';
      return `${g.name ?? g.jid}${unread}\n  ID: ${g.jid}`;
    });
    return { content: [{ type: 'text', text: lines.join('\n\n') }] };
  },
);

server.tool(
  'whatsapp_get_messages',
  'Get messages from a specific chat. Use whatsapp_list_chats to find the chat ID (JID). Returns messages from the local SQLite database — full history going back to when the account was created.',
  {
    jid: z.string().describe('Chat ID from whatsapp_list_chats (e.g. 923001234567@s.whatsapp.net)'),
    limit: z.number().optional().describe('Number of messages to return (default 50, max 500)'),
  },
  async ({ jid, limit }) => {
    const msgs = db.getMessages(jid, Math.min(limit ?? 50, 500));
    if (!msgs.length) return { content: [{ type: 'text', text: `No messages found for ${jid}.` }] };
    const lines = msgs
      .sort((a, b) => a.timestamp - b.timestamp) // oldest first
      .map(m => {
        const who = m.is_from_me ? 'You' : (m.from_name ?? m.from_jid?.split('@')[0] ?? '?');
        const time = new Date(m.timestamp * 1000).toLocaleString();
        return `[${time}] ${who}: ${m.body}`;
      });
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
);

server.tool(
  'whatsapp_send_message',
  'Send a WhatsApp message to a contact or group',
  {
    jid: z.string().describe('Recipient chat ID (JID)'),
    text: z.string().describe('Message text to send'),
  },
  async ({ jid, text }) => {
    try {
      await sendMessage(jid, text);
      return { content: [{ type: 'text', text: `✅ Message sent to ${jid}` }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ Failed: ${err}` }] };
    }
  },
);

server.tool(
  'whatsapp_find_contact',
  'Search for a contact by name or phone number to get their chat ID (JID). Useful when a contact name shows as a number or @lid.',
  {
    query: z.string().describe('Name or phone number to search for (e.g. "Moiz" or "923112294157")'),
  },
  async ({ query }) => {
    const contacts = db.searchContacts(query);

    // Also check if the raw number exists as a JID
    const cleanNumber = query.replace(/[^0-9]/g, '');
    const directJid = cleanNumber ? `${cleanNumber}@s.whatsapp.net` : null;
    const directMessages = directJid ? db.getMessages(directJid, 1) : [];

    const lines: string[] = [];

    if (contacts.length > 0) {
      lines.push(`Found ${contacts.length} contact(s):`);
      for (const c of contacts) {
        const msgs = db.getMessages(c.jid, 1);
        const hasMsgs = msgs.length > 0 ? ' ✅ has messages' : ' (no messages synced yet)';
        lines.push(`\n👤 ${c.name}\n   JID: ${c.jid}${hasMsgs}`);
      }
    }

    if (directJid && directMessages.length > 0 && !contacts.find(c => c.jid === directJid)) {
      lines.push(`\nDirect JID match: ${directJid} ✅ has messages`);
    }

    if (lines.length === 0) {
      return { content: [{ type: 'text', text: `No contact found for "${query}". They may not have a synced chat yet — WhatsApp only sends recent history on initial sync.` }] };
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  },
),

server.tool(
  'whatsapp_search_messages',
  'Full-text search across ALL stored WhatsApp messages, including history going back years. Much faster and more complete than the cloud version.',
  {
    query: z.string().describe('Text to search for'),
    limit: z.number().optional().describe('Max results (default 30)'),
  },
  async ({ query, limit }) => {
    const results = db.searchMessages(query, limit ?? 30);
    if (!results.length) return { content: [{ type: 'text', text: `No messages found matching "${query}".` }] };
    const lines = results.map(r => {
      const who = r.is_from_me ? 'You' : (r.from_name ?? r.jid.split('@')[0]);
      const time = new Date(r.timestamp * 1000).toLocaleString();
      return `[${time}] ${r.jid} — ${who}: ${r.snippet ?? r.body}`;
    });
    return { content: [{ type: 'text', text: `${results.length} results for "${query}":\n\n${lines.join('\n')}` }] };
  },
);

// ── Start ─────────────────────────────────────────────────────────────────────

// MCP transport must start first — Claude Desktop is already waiting
const transport = new StdioServerTransport();
await server.connect(transport);

// WhatsApp connects in the background
initWhatsApp().catch(err => console.error('[whatsapp-mcp] Init error:', err));
