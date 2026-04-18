#!/bin/sh
set -e

REPO="huyjack178/claudecode-bedrock"
SETUP_URL="https://raw.githubusercontent.com/${REPO}/main/src/setup.js"

echo ""
echo "Claude Code × Amazon Bedrock — Installer"
echo ""

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[error]  Node.js is required but not found."
  echo "         Install it from https://nodejs.org and re-run this script."
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[error]  Node.js >= 18 is required (found v${NODE_VERSION})."
  echo "         Upgrade at https://nodejs.org"
  exit 1
fi

# Download and run setup
TMP=$(mktemp /tmp/claude-bedrock-setup.XXXXXX.mjs)
curl -fsSL "$SETUP_URL" -o "$TMP"
node "$TMP"
rm -f "$TMP"
