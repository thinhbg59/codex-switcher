#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$(basename "$DIR")" = "scripts" ]; then
    ROOT_DIR="$(cd "$DIR/.." && pwd)"
else
    ROOT_DIR="$DIR"
fi

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

# Auto-launch Tailscale in background if not running
if ! pgrep -i -f "Tailscale" > /dev/null 2>&1; then
    echo "[Tailscale] Launching Tailscale in background..."
    open -g -a Tailscale 2>/dev/null || open -g -a "/Applications/Tailscale.app" 2>/dev/null || true
fi

NODE_BIN="$(which node 2>/dev/null)"
if [ -z "$NODE_BIN" ]; then
    if [ -x "/opt/homebrew/bin/node" ]; then
        NODE_BIN="/opt/homebrew/bin/node"
    elif [ -x "/usr/local/bin/node" ]; then
        NODE_BIN="/usr/local/bin/node"
    fi
fi

if [ -z "$NODE_BIN" ]; then
    echo "[Error] Node.js not found in PATH" >&2
    exit 1
fi

cd "$ROOT_DIR"
if [ -f "$ROOT_DIR/web-server.mjs" ]; then
    exec "$NODE_BIN" "$ROOT_DIR/web-server.mjs"
elif [ -f "$ROOT_DIR/scripts/web-server.mjs" ]; then
    exec "$NODE_BIN" "$ROOT_DIR/scripts/web-server.mjs"
else
    echo "[Error] web-server.mjs not found in $ROOT_DIR" >&2
    exit 1
fi
