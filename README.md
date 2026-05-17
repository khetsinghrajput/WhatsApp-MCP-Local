# WhatsApp MCP — Local

100% local. Zero cloud. Developer sees nothing. Full history in SQLite.

## What it does

- Runs as a local process on the client's machine
- Connects their WhatsApp via QR code (like WhatsApp Web)
- Stores **all messages** in a local SQLite database (`~/.whatsapp-mcp/whatsapp.db`)
- Exposes 6 MCP tools to Claude Desktop
- Full-text search across complete chat history going back to day 1

## Data stays on the client's machine

```
~/.whatsapp-mcp/
  session/           ← WhatsApp auth keys (never leaves this machine)
    creds.json
    pre-key-*.json
  whatsapp.db        ← All messages, chats, contacts (SQLite)
```

No cloud. No servers. No one else can see anything.

---

## Setup (one-time)

### 1. Install dependencies

```bash
cd "WhatsApp MCP Local"
npm install
```

### 2. Add to Claude Desktop config

Open `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["--import", "tsx", "C:/full/path/to/WhatsApp MCP Local/src/index.ts"]
    }
  }
}
```

> Replace `C:/full/path/to/` with the actual path on your machine.

### 3. Restart Claude Desktop

When Claude starts, it launches the WhatsApp MCP process automatically.
Your browser will open at `http://localhost:3000` — scan the QR code with WhatsApp.

### 4. Wait for history sync

The first time, WhatsApp syncs your full message history. Watch the Claude Desktop
developer console (or terminal) for progress:

```
[whatsapp-mcp] History: 180 chats / 4200 msgs / isLatest=false | db=4200 msgs
[whatsapp-mcp] History: 140 chats / 3100 msgs / isLatest=false | db=7300 msgs
[whatsapp-mcp] History: 90 chats  / 890 msgs  / isLatest=true  | db=8190 msgs
```

Once `isLatest=true`, all history is in SQLite and available for search.

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `whatsapp_status` | Connection status + database stats (total messages, oldest date) |
| `whatsapp_list_chats` | All chats sorted by recent |
| `whatsapp_list_groups` | Group chats only |
| `whatsapp_get_messages` | Messages from a chat (full history from SQLite) |
| `whatsapp_send_message` | Send a message |
| `whatsapp_search_messages` | Full-text search across ALL messages |

---

## Privacy

- WhatsApp auth credentials: stored only in `~/.whatsapp-mcp/session/`
- Messages: stored only in `~/.whatsapp-mcp/whatsapp.db`
- Nothing is sent to any server
- The developer of this tool has zero access to your data
- To fully remove: delete `~/.whatsapp-mcp/` and remove from Claude config

## Unlink from WhatsApp

On your phone: **WhatsApp → Settings → Linked Devices** → find the MCP entry → Log Out

Then delete `~/.whatsapp-mcp/session/` and restart — you'll get a fresh QR code.
