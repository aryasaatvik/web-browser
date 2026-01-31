#!/bin/bash
#
# Install web-browser native messaging bridge for Chrome/Chromium browsers
#
# Usage:
#   ./scripts/install.sh [--extension-id <id>] [--uninstall]
#

set -e

# Configuration
HOST_NAME="sh.arya.web_browser"
DEFAULT_EXTENSION_ID="*"  # Allow all extensions in dev mode

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Parse arguments
EXTENSION_ID="$DEFAULT_EXTENSION_ID"
UNINSTALL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --extension-id)
      EXTENSION_ID="$2"
      shift 2
      ;;
    --uninstall)
      UNINSTALL=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--extension-id <id>] [--uninstall]"
      echo ""
      echo "Options:"
      echo "  --extension-id <id>  Chrome extension ID (default: * for all)"
      echo "  --uninstall          Remove the native messaging bridge"
      echo "  --help, -h           Show this help"
      exit 0
      ;;
    *)
      log_error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin)
    PLATFORM="macos"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    PLATFORM="windows"
    ;;
  *)
    log_error "Unsupported operating system: $OS"
    exit 1
    ;;
esac

log_info "Detected platform: $PLATFORM"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Set paths based on platform
case "$PLATFORM" in
  macos)
    INSTALL_DIR="$HOME/.web-browser"
    CHROME_MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    CHROMIUM_MANIFEST_DIR="$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
    BRAVE_MANIFEST_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    EDGE_MANIFEST_DIR="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
    ;;
  linux)
    INSTALL_DIR="$HOME/.web-browser"
    CHROME_MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
    CHROMIUM_MANIFEST_DIR="$HOME/.config/chromium/NativeMessagingHosts"
    BRAVE_MANIFEST_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
    EDGE_MANIFEST_DIR="$HOME/.config/microsoft-edge/NativeMessagingHosts"
    ;;
  windows)
    INSTALL_DIR="$USERPROFILE/.web-browser"
    # Windows uses registry, handled separately
    ;;
esac

HOST_PATH="$INSTALL_DIR/web-browser-bridge"
MANIFEST_FILE="$HOST_NAME.json"

# Uninstall function
uninstall() {
  log_info "Uninstalling Web Browser MCP native messaging bridge..."

  # Remove manifest files
  for dir in "$CHROME_MANIFEST_DIR" "$CHROMIUM_MANIFEST_DIR" "$BRAVE_MANIFEST_DIR" "$EDGE_MANIFEST_DIR"; do
    if [[ -f "$dir/$MANIFEST_FILE" ]]; then
      rm -f "$dir/$MANIFEST_FILE"
      log_info "Removed manifest from $dir"
    fi
  done

  # Remove install directory
  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    log_info "Removed $INSTALL_DIR"
  fi

  log_info "Uninstall complete!"
  exit 0
}

if $UNINSTALL; then
  uninstall
fi

# Build the native host if needed
log_info "Building native host..."
cd "$PROJECT_ROOT"
bun run build:native-host

# Create install directory
log_info "Creating install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Create the native messaging bridge wrapper script
# This is what Chrome spawns via native messaging
log_info "Creating native messaging bridge wrapper..."
cat > "$HOST_PATH" << EOF
#!/bin/bash
# Web Browser MCP Native Messaging Bridge
# Chrome spawns this via browser.runtime.connectNative()
# This bridge connects Chrome's native messaging to the MCP server Unix socket

exec node "$PROJECT_ROOT/packages/native-host/bin/web-browser.js" bridge
EOF

chmod +x "$HOST_PATH"

# Create allowed_origins based on extension ID
if [[ "$EXTENSION_ID" == "*" ]]; then
  # Allow all extensions (dev mode)
  ALLOWED_ORIGINS='["chrome-extension://*/"]'
else
  ALLOWED_ORIGINS="[\"chrome-extension://$EXTENSION_ID/\"]"
fi

# Create manifest JSON
MANIFEST_CONTENT=$(cat << EOF
{
  "name": "$HOST_NAME",
  "description": "Web Browser MCP Native Messaging Bridge - connects Chrome extension to MCP server",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": $ALLOWED_ORIGINS
}
EOF
)

# Install manifest for each browser
install_manifest() {
  local dir="$1"
  local browser="$2"

  if [[ -n "$dir" ]]; then
    mkdir -p "$dir"
    echo "$MANIFEST_CONTENT" > "$dir/$MANIFEST_FILE"
    log_info "Installed manifest for $browser"
  fi
}

log_info "Installing native messaging manifests..."

case "$PLATFORM" in
  macos|linux)
    install_manifest "$CHROME_MANIFEST_DIR" "Google Chrome"
    install_manifest "$CHROMIUM_MANIFEST_DIR" "Chromium"
    install_manifest "$BRAVE_MANIFEST_DIR" "Brave"
    install_manifest "$EDGE_MANIFEST_DIR" "Microsoft Edge"
    ;;
  windows)
    log_warn "Windows installation requires registry entries."
    log_warn "Please run the following in an elevated PowerShell:"
    echo ""
    echo "  New-Item -Path 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\$HOST_NAME' -Force"
    echo "  Set-ItemProperty -Path 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\$HOST_NAME' -Name '(Default)' -Value '$INSTALL_DIR\\$MANIFEST_FILE'"
    echo ""
    # Still create the manifest file
    mkdir -p "$INSTALL_DIR"
    echo "$MANIFEST_CONTENT" > "$INSTALL_DIR/$MANIFEST_FILE"
    log_info "Manifest file created at $INSTALL_DIR/$MANIFEST_FILE"
    ;;
esac

echo ""
log_info "Installation complete!"
echo ""
echo "Architecture:"
echo "  Chrome Extension → Native Messaging → Bridge → Unix Socket → MCP Server → MCP"
echo ""
echo "Usage:"
echo ""
echo "  1. Build the extension:"
echo "     bun run build:extension"
echo ""
echo "  2. Load the extension in Chrome:"
echo "     - Go to chrome://extensions"
echo "     - Enable 'Developer mode'"
echo "     - Click 'Load unpacked'"
echo "     - Select: $PROJECT_ROOT/packages/extension/.output/chrome-mv3"
echo ""
echo "  3. Start the MCP server (for Claude Desktop/Claude Code):"
  echo "     web-browser"
echo ""
echo "  4. Add to Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):"
echo '     {'
echo '       "mcpServers": {'
  echo '         "web-browser": {'
  echo '           "command": "web-browser"'
echo '         }'
echo '       }'
echo '     }'
echo ""
if [[ "$EXTENSION_ID" == "*" ]]; then
  echo "  Note: Currently allowing all extensions (dev mode)."
  echo "  For production, re-run with: $0 --extension-id <your-extension-id>"
fi
