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

### Windows — double-click installer

1. Install **[Node.js LTS](https://nodejs.org)** if you don't have it
2. `git clone https://github.com/khetsinghrajput/WhatsApp-MCP-Local.git`
3. Open the cloned folder → double-click **`install.bat`**

That's it. The batch file handles `npm install` and config automatically. No PowerShell, no manual editing.

### Mac / Linux — terminal

```bash
git clone https://github.com/khetsinghrajput/WhatsApp-MCP-Local.git
cd WhatsApp-MCP-Local
make install
```

> No `make`? Use: `chmod +x install.sh && ./install.sh`

### Manual (any platform)

```bash
npm install
npm run setup
```

> **Windows PowerShell error?** If you see "running scripts is disabled", run this once in PowerShell then retry:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
> ```
> Or just use `install.bat` instead — it uses cmd.exe which never has this problem.

Output looks like:
```
✅ Done! Config written:
   Server  : whatsapp
   Command : C:\Program Files\nodejs\node.exe
   Script  : C:\Users\You\WhatsApp-MCP-Local\src\index.ts

📋 Next steps:
   1. Fully quit Claude Desktop (system tray → Quit)
   2. Reopen Claude Desktop
   3. Your browser opens at http://localhost:3000 — scan the QR with WhatsApp
   4. Done! Use whatsapp_status in Claude to confirm.
```

### After setup

1. **Quit and reopen Claude Desktop**
2. Browser auto-opens at `http://localhost:3000` — scan the QR
3. Wait a few minutes for history to sync

Check progress in Claude:
```
whatsapp_status
→ 📦 1,240 messages stored across 108 chats
→ 📅 History goes back to: 25/05/2025
```

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
npm run import -- "C:/path/to/WhatsApp Chat with John Doe.txt" "923001234567@s.whatsapp.net" "John Doe"
```

The importer shows:
```
✅ Import complete!
   Contact  : John Doe
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
