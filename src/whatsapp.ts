import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import * as db from './database.js';
import { startSetupServer, pushQR, pushConnected } from './setup.js';
import { DATA_DIR } from './database.js';

const SESSIONS_DIR = path.join(DATA_DIR, 'session');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const silent = pino({ level: 'silent' });

export type WaStatus = 'startup' | 'qr' | 'connected' | 'disconnected';

let status: WaStatus = 'startup';
let phoneNumber: string | null = null;
let socket: ReturnType<typeof makeWASocket> | null = null;

export function getStatus() {
  return { status, phoneNumber };
}

// ── Message body extractor ────────────────────────────────────────────────────
function extractBody(msg: proto.IWebMessageInfo): string {
  const c = msg.message;
  if (!c) return '';
  const inner = c.ephemeralMessage?.message ?? c.viewOnceMessage?.message ??
    c.viewOnceMessageV2?.message ?? c.documentWithCaptionMessage?.message ??
    c.editedMessage?.message;
  if (inner) return extractBody({ ...msg, message: inner });
  if (c.conversation) return c.conversation;
  if (c.extendedTextMessage?.text) return c.extendedTextMessage.text;
  if (c.imageMessage) return c.imageMessage.caption ? `[Image: ${c.imageMessage.caption}]` : '[Image]';
  if (c.videoMessage) return c.videoMessage.caption ? `[Video: ${c.videoMessage.caption}]` : '[Video]';
  if (c.audioMessage) return c.audioMessage.ptt ? '[Voice message]' : '[Audio]';
  if (c.documentMessage) return `[Document: ${c.documentMessage.fileName ?? 'file'}]`;
  if (c.stickerMessage) return '[Sticker]';
  if (c.locationMessage) return c.locationMessage.name ? `[Location: ${c.locationMessage.name}]` : '[Location]';
  if (c.contactMessage) return `[Contact: ${c.contactMessage.displayName ?? ''}]`;
  if (c.reactionMessage) return `[Reaction: ${c.reactionMessage.text}]`;
  if (c.pollCreationMessage) return `[Poll: ${c.pollCreationMessage.name}]`;
  if (c.pollCreationMessageV3) return `[Poll: ${c.pollCreationMessageV3.name}]`;
  if (c.groupInviteMessage) return `[Group invite: ${c.groupInviteMessage.groupName ?? ''}]`;
  if (c.listMessage) return `[List: ${c.listMessage.title ?? ''}]`;
  if (c.protocolMessage?.type === proto.Message.ProtocolMessage.Type.REVOKE) return '[Deleted message]';
  return '[Message]';
}

function resolveName(jid: string): string {
  return db.getContactName(jid) ?? jid.split('@')[0];
}

function toMsg(jid: string, msg: proto.IWebMessageInfo) {
  return {
    id: msg.key.id!,
    jid,
    fromJid: msg.key.participant ?? msg.key.remoteJid ?? jid,
    fromName: resolveName(msg.key.participant ?? msg.key.remoteJid ?? jid),
    body: extractBody(msg),
    timestamp: Number(msg.messageTimestamp ?? 0),
    isFromMe: msg.key.fromMe ?? false,
  };
}

// ── Main init ─────────────────────────────────────────────────────────────────
export async function initWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(SESSIONS_DIR);
  const { version } = await fetchLatestBaileysVersion();

  // If no credentials exist, show the QR setup page
  const isNewSession = !fs.existsSync(path.join(SESSIONS_DIR, 'creds.json'));
  if (isNewSession) {
    startSetupServer();
  }

  socket = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: silent,
    markOnlineOnConnect: false,
    syncFullHistory: true,
    getMessage: async (key) => {
      const rows = db.getMessages(key.remoteJid!, 200);
      const found = rows.find(r => r.id === key.id);
      return found ? { conversation: found.body } as proto.IMessage : undefined;
    },
  });

  socket.ev.on('creds.update', saveCreds);

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      status = 'qr';
      const dataUrl = await qrcode.toDataURL(qr);
      pushQR(dataUrl);
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        status = 'disconnected';
        socket = null;
        // Remove local auth so user can re-pair
        fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      } else {
        setTimeout(() => initWhatsApp(), 3000);
      }
    } else if (connection === 'open') {
      status = 'connected';
      phoneNumber = socket?.user?.id?.split(':')[0] ?? null;
      console.error(`[whatsapp-mcp] Connected as +${phoneNumber}`);
      if (isNewSession) pushConnected(phoneNumber ?? '');
    }
  });

  // ── Full history sync (every batch goes deeper in time) ───────────────────
  socket.ev.on('messaging-history.set', ({ chats: hChats, contacts: hContacts, messages: hMsgs, isLatest }) => {
    // Contacts first so names resolve
    for (const c of hContacts) {
      const name = c.name ?? c.notify ?? c.verifiedName;
      if (name) db.upsertContact(c.id, name);
    }

    for (const chat of hChats) {
      db.upsertChat({
        jid: chat.id,
        name: (chat as any).name ?? undefined,
        isGroup: chat.id.endsWith('@g.us'),
        unreadCount: (chat as any).unreadCount ?? 0,
        lastMessageTime: (chat as any).conversationTimestamp
          ? Number((chat as any).conversationTimestamp)
          : undefined,
      });
    }

    const msgs = hMsgs
      .filter(m => m.message && m.key.remoteJid)
      .map(m => toMsg(m.key.remoteJid!, m));

    db.insertMessageBatch(msgs);

    console.error(
      `[whatsapp-mcp] History: ${hChats.length} chats / ${msgs.length} msgs / isLatest=${isLatest} | db=${db.getStats().totalMessages} msgs`
    );
  });

  // ── Incremental updates ───────────────────────────────────────────────────
  socket.ev.on('chats.upsert', (chats) => {
    for (const chat of chats) {
      db.upsertChat({
        jid: chat.id,
        name: (chat as any).name,
        isGroup: chat.id.endsWith('@g.us'),
        unreadCount: (chat as any).unreadCount ?? 0,
        lastMessageTime: (chat as any).conversationTimestamp
          ? Number((chat as any).conversationTimestamp)
          : undefined,
      });
    }
  });

  socket.ev.on('contacts.upsert', (contacts) => {
    for (const c of contacts) {
      const name = c.name ?? c.notify ?? c.verifiedName;
      if (name) db.upsertContact(c.id, name);
    }
  });

  socket.ev.on('messages.upsert', ({ messages: msgs }) => {
    for (const msg of msgs) {
      if (!msg.message || !msg.key.remoteJid) continue;
      const jid = msg.key.remoteJid;
      const entry = toMsg(jid, msg);
      db.insertMessage(entry);
      db.upsertChat({
        jid,
        lastMessage: entry.body,
        lastMessageTime: entry.timestamp,
      });
    }
  });

  socket.ev.on('contacts.update', (updates) => {
    for (const c of updates) {
      const name = c.name ?? c.notify ?? c.verifiedName;
      if (name) db.upsertContact(c.id, name);
    }
  });
}

export async function sendMessage(jid: string, text: string): Promise<void> {
  if (!socket || status !== 'connected') throw new Error('WhatsApp not connected');
  await socket.sendMessage(jid, { text });
}
