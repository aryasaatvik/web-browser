#!/bin/bash

# Install web-browser-mcp native messaging bridge manifest
# This script installs the native messaging host for Chrome/Chromium browsers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
HOST_NAME="sh.arya.web-browser-mcp"

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin)
    TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  Linux)
    TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    TARGET_DIR="$LOCALAPPDATA/Google/Chrome/User Data/NativeMessagingHosts"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Create target directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Get the path to the web-browser-mcp binary
if command -v web-browser-mcp &> /dev/null; then
  HOST_PATH="$(command -v web-browser-mcp)"
elif [ -f "$PACKAGE_DIR/bin/web-browser-mcp.js" ]; then
  HOST_PATH="$PACKAGE_DIR/bin/web-browser-mcp.js"
else
  echo "web-browser-mcp not found. Please install @web-browser/native-host first."
  exit 1
fi

# Get extension ID from environment or use default
EXTENSION_ID="${WEB_BROWSER_MCP_EXTENSION_ID:-*}"

# Generate the manifest
cat > "$TARGET_DIR/$HOST_NAME.json" << EOF
{
  "name": "$HOST_NAME",
  "description": "Web Browser MCP Native Messaging Bridge",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo "Native messaging bridge manifest installed to: $TARGET_DIR/$HOST_NAME.json"
echo "Host path: $HOST_PATH"

if [ "$EXTENSION_ID" = "*" ]; then
  echo ""
  echo "Warning: Extension ID is set to '*' (allow all)."
  echo "For security, set WEB_BROWSER_MCP_EXTENSION_ID to your extension's ID."
fi
