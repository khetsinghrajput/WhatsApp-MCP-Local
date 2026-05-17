import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const DATA_DIR = path.join(os.homedir(), '.whatsapp-mcp');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'whatsapp.db'));

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    jid     TEXT PRIMARY KEY,
    name    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    jid               TEXT PRIMARY KEY,
    name              TEXT,
    is_group          INTEGER DEFAULT 0,
    unread_count      INTEGER DEFAULT 0,
    last_message      TEXT,
    last_message_time INTEGER
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT NOT NULL,
    jid         TEXT NOT NULL,
    from_jid    TEXT,
    from_name   TEXT,
    body        TEXT NOT NULL DEFAULT '',
    timestamp   INTEGER NOT NULL,
    is_from_me  INTEGER DEFAULT 0,
    PRIMARY KEY (id, jid)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_jid_ts ON messages (jid, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_ts     ON messages (timestamp DESC);

  -- Full-text search across all messages
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    body, from_name,
    jid       UNINDEXED,
    id        UNINDEXED,
    timestamp UNINDEXED,
    is_from_me UNINDEXED,
    content   = messages,
    content_rowid = rowid
  );

  CREATE TRIGGER IF NOT EXISTS fts_insert AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts(rowid, body, from_name, jid, id, timestamp, is_from_me)
    VALUES (new.rowid, new.body, new.from_name, new.jid, new.id, new.timestamp, new.is_from_me);
  END;

  CREATE TRIGGER IF NOT EXISTS fts_delete AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts(messages_fts, rowid, body, from_name, jid, id, timestamp, is_from_me)
    VALUES ('delete', old.rowid, old.body, old.from_name, old.jid, old.id, old.timestamp, old.is_from_me);
  END;
`);

// ── Prepared statements ────────────────────────────────────────────────────────
const stmts = {
  upsertContact: db.prepare(`
    INSERT INTO contacts (jid, name) VALUES (?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `),

  upsertChat: db.prepare(`
    INSERT INTO chats (jid, name, is_group, unread_count, last_message, last_message_time)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET
      name              = COALESCE(excluded.name, chats.name),
      unread_count      = excluded.unread_count,
      last_message      = COALESCE(excluded.last_message, chats.last_message),
      last_message_time = MAX(excluded.last_message_time, COALESCE(chats.last_message_time, 0))
  `),

  insertMessage: db.prepare(`
    INSERT OR IGNORE INTO messages (id, jid, from_jid, from_name, body, timestamp, is_from_me)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  getMessages: db.prepare(`
    SELECT * FROM messages WHERE jid = ? ORDER BY timestamp DESC LIMIT ?
  `),

  getChats: db.prepare(`
    SELECT * FROM chats ORDER BY last_message_time DESC LIMIT ?
  `),

  getContactName: db.prepare(`SELECT name FROM contacts WHERE jid = ?`),

  dbStats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM messages) AS total_messages,
      (SELECT COUNT(*) FROM chats)    AS total_chats,
      (SELECT COUNT(*) FROM contacts) AS total_contacts,
      (SELECT MIN(timestamp) FROM messages) AS oldest_message
  `),
};

// ── Public API ────────────────────────────────────────────────────────────────

export function upsertContact(jid: string, name: string) {
  stmts.upsertContact.run(jid, name);
}

export function upsertChat(opts: {
  jid: string;
  name?: string;
  isGroup?: boolean;
  unreadCount?: number;
  lastMessage?: string;
  lastMessageTime?: number;
}) {
  stmts.upsertChat.run(
    opts.jid,
    opts.name ?? null,
    opts.isGroup ? 1 : 0,
    opts.unreadCount ?? 0,
    opts.lastMessage ?? null,
    opts.lastMessageTime ?? null,
  );
}

export function insertMessage(msg: {
  id: string;
  jid: string;
  fromJid?: string;
  fromName?: string;
  body: string;
  timestamp: number;
  isFromMe: boolean;
}) {
  stmts.insertMessage.run(
    msg.id,
    msg.jid,
    msg.fromJid ?? null,
    msg.fromName ?? null,
    msg.body,
    msg.timestamp,
    msg.isFromMe ? 1 : 0,
  );
}

// Batch insert for history sync — much faster
export const insertMessageBatch = db.transaction(
  (msgs: Parameters<typeof insertMessage>[0][]) => {
    for (const m of msgs) insertMessage(m);
  },
);

export function getMessages(jid: string, limit = 50) {
  return stmts.getMessages.all(jid, limit) as {
    id: string; jid: string; from_jid: string; from_name: string;
    body: string; timestamp: number; is_from_me: number;
  }[];
}

export function listChats(limit = 100) {
  return stmts.getChats.all(limit) as {
    jid: string; name: string; is_group: number;
    unread_count: number; last_message: string; last_message_time: number;
  }[];
}

export function searchMessages(query: string, limit = 30) {
  // FTS5 with snippet highlighting
  return db.prepare(`
    SELECT
      m.jid, m.id, m.from_name, m.body, m.timestamp, m.is_from_me,
      snippet(messages_fts, 0, '**', '**', '...', 15) AS snippet
    FROM messages_fts
    JOIN messages m ON messages_fts.rowid = m.rowid
    WHERE messages_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as any[];
}

export function getContactName(jid: string): string | undefined {
  const row = stmts.getContactName.get(jid) as { name: string } | undefined;
  return row?.name;
}

export function getStats() {
  const row = stmts.dbStats.get() as any;
  return {
    totalMessages: row.total_messages as number,
    totalChats: row.total_chats as number,
    totalContacts: row.total_contacts as number,
    oldestMessage: row.oldest_message
      ? new Date(row.oldest_message * 1000).toLocaleDateString()
      : null,
  };
}

export { DATA_DIR };
