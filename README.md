# WhatsApp MCP — Local

Connect your WhatsApp to Claude Desktop. **Everything stays on your machine** — no cloud, no servers, developer sees nothing.

- 📦 All messages stored in a local SQLite database (`~/.whatsapp-mcp/whatsapp.db`)
- 🔒 Auth keys stored only in `~/.whatsapp-mcp/session/` — never leave your machine
- 🔍 Full-text search across complete chat history
- 📥 Import old chats via WhatsApp's Export Chat feature

---

## Prerequisites

- **Node.js v20+** — download from [nodejs.org](https://nodejs.org) (LTS version)
- **Claude Desktop** — download from [claude.ai/download](https://claude.ai/download)
- **Git** — download from [git-scm.com](https://git-scm.com)

---

## Setup (Fresh Machine)

### 1 — Clone the repo

```bash
git clone https://github.com/khetsinghrajput/WhatsApp-MCP-Local.git
cd WhatsApp-MCP-Local
npm install
```

### 2 — Find your full folder path

**Windows:** Open the folder in File Explorer, click the address bar — copy the full path.
It will look like: `C:\Users\YourName\WhatsApp-MCP-Local`

**Mac/Linux:** Run `pwd` in the terminal inside the folder.

### 3 — Add to Claude Desktop config

Open the config file:
- **Windows:** `C:\Users\YourName\AppData\Roaming\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

If the file doesn't exist, create it. Add this (replace the path with yours):

**Windows:**
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "C:/Users/YourName/WhatsApp-MCP-Local/node_modules/.bin/tsx.cmd",
      "args": ["C:/Users/YourName/WhatsApp-MCP-Local/src/index.ts"]
    }
  }
}
```

> ⚠️ **Windows paths must use forward slashes `/` not backslashes `\`**

**Mac/Linux:**
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": [
        "/Users/YourName/WhatsApp-MCP-Local/node_modules/tsx/dist/cli.cjs",
        "/Users/YourName/WhatsApp-MCP-Local/src/index.ts"
      ]
    }
  }
}
```

> If the file already has a `"preferences"` section, add `"mcpServers"` alongside it — don't replace the whole file.

### 4 — Restart Claude Desktop

Fully quit Claude Desktop (system tray → right-click → **Quit**), then reopen it.

### 5 — Scan the QR code

Your browser will automatically open at `http://localhost:3000`.

On your phone: **WhatsApp → Settings → Linked Devices → Link a Device** → scan the QR.

### 6 — Wait for history sync

Watch the status in Claude:

```
whatsapp_status
→ 📦 1,240 messages stored across 108 chats
→ 📅 History goes back to: 25/05/2025
```

The count will grow as WhatsApp syncs older messages in the background.

---

## Available Tools

| Tool | What it does |
|------|-------------|
| `whatsapp_status` | Connection status + database stats |
| `whatsapp_list_chats` | All chats sorted by most recent |
| `whatsapp_list_groups` | Group chats only |
| `whatsapp_find_contact` | Search contacts by name or phone number |
| `whatsapp_get_messages` | Read messages from a chat (full history) |
| `whatsapp_send_message` | Send a message |
| `whatsapp_search_messages` | Full-text search across all messages |

---

## Import Old Chats

WhatsApp only sends recent history during initial sync. To get older messages:

### Step 1 — Export from your phone

1. Open the chat in WhatsApp
2. Tap **⋮ → More → Export Chat**
3. Choose **Without Media**
4. Send the `.txt` file to your computer

### Step 2 — Run the importer

First find the contact's JID using `whatsapp_find_contact "Their Name"` in Claude, then:

```bash
npm run import -- "C:/path/to/WhatsApp Chat with Moiz Ada.txt" "923112294157@s.whatsapp.net" "Moiz Ada"
```

The importer shows:
```
✅ Import complete!
   Contact  : Moiz Ada
   Messages : 1,847 imported
   Range    : 15/03/2023 → 17/05/2026

📦 Database now has 3,091 messages across 109 chats
```

Messages are de-duplicated automatically — safe to run multiple times.

---

## Your Data

```
~/.whatsapp-mcp/
  session/          ← WhatsApp auth keys (never shared)
    creds.json
    pre-key-*.json
  whatsapp.db       ← All messages, searchable forever
```

**To unlink from WhatsApp:** Phone → Settings → Linked Devices → find WhatsApp MCP → Log Out.
Then delete `~/.whatsapp-mcp/session/` and restart Claude Desktop — you'll get a new QR.

**To fully remove:** Delete `~/.whatsapp-mcp/` and remove the `mcpServers` block from the config.

---

## Troubleshooting

**"Server disconnected" error on Windows:**
Make sure you used `tsx.cmd` (not `tsx`) in the config and paths use `/` not `\`.

**Browser doesn't open automatically:**
Visit `http://localhost:3000` manually.

**Chats show as numbers instead of names:**
Normal on first connect — names load as WhatsApp syncs contacts. Wait 30 seconds and check again.

**Contact not found:**
Use `whatsapp_find_contact "name"` — if it shows "no messages synced yet", export the chat and use the importer.
