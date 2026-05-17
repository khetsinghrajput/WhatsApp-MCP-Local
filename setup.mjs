#!/usr/bin/env node
/**
 * WhatsApp MCP — One-command setup
 * Automatically configures Claude Desktop on any machine.
 *
 * Run: npm run setup
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, platform } from 'os';
import { fileURLToPath } from 'url';

const PROJECT_DIR = dirname(fileURLToPath(import.meta.url));

// ── Find Claude Desktop config path (cross-platform) ─────────────────────────
function getConfigPath() {
  switch (platform()) {
    case 'win32':
      return join(
        process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      );
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    default: // linux
      return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
}

// ── Build the mcpServers entry for this machine ───────────────────────────────
function buildMcpEntry() {
  const tsxCli  = join(PROJECT_DIR, 'node_modules', 'tsx', 'dist', 'cli.cjs');
  const indexTs = join(PROJECT_DIR, 'src', 'index.ts');

  // Use the full path to node so it works regardless of where Claude runs from
  const nodeBin = process.execPath;

  return {
    command: nodeBin,
    args: [tsxCli, indexTs],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const configPath = getConfigPath();
const configDir  = dirname(configPath);

console.log('\n🔧 WhatsApp MCP Setup\n');

// Ensure Claude config directory exists
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
  console.log(`Created: ${configDir}`);
}

// Read existing config (preserve preferences, other servers, etc.)
let config = {};
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
    console.log(`Found existing config: ${configPath}`);
  } catch {
    console.warn('⚠️  Existing config has invalid JSON — starting fresh.');
  }
} else {
  console.log(`Creating new config: ${configPath}`);
}

// Add / update our server entry
if (!config.mcpServers || typeof config.mcpServers !== 'object') {
  config.mcpServers = {};
}
config.mcpServers['whatsapp'] = buildMcpEntry();

// Write back
writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

const entry = buildMcpEntry();
console.log('\n✅ Done! Config written:\n');
console.log(`   Server  : whatsapp`);
console.log(`   Command : ${entry.command}`);
console.log(`   Script  : ${entry.args[1]}`);
console.log(`\n📋 Next steps:`);
console.log(`   1. Fully quit Claude Desktop (system tray → Quit)`);
console.log(`   2. Reopen Claude Desktop`);
console.log(`   3. Your browser opens at http://localhost:3000 — scan the QR with WhatsApp`);
console.log(`   4. Done! Use whatsapp_status in Claude to confirm.\n`);
