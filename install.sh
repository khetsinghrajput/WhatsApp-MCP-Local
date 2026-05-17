#!/bin/bash
set -e

echo ""
echo " ================================"
echo "  WhatsApp MCP — Setup"
echo " ================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo " [ERROR] Node.js is not installed."
  echo " Download from: https://nodejs.org"
  exit 1
fi

echo " Node.js $(node --version) found."
echo ""

# Install dependencies
echo " Installing dependencies..."
npm install
echo ""

# Configure Claude Desktop
echo " Configuring Claude Desktop..."
node setup.mjs

echo ""
echo " ================================"
echo "  Setup Complete!"
echo " ================================"
echo ""
echo " Next steps:"
echo "  1. Quit Claude Desktop (menu bar → Quit)"
echo "  2. Reopen Claude Desktop"
echo "  3. Browser opens at http://localhost:3000 — scan QR with WhatsApp"
echo ""
