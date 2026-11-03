#!/bin/bash
# 自动寻找可用 node
NODE_BIN="$HOME/.nvm/versions/node/v24.16.0/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(which node 2>/dev/null || echo "/usr/local/bin/node")
fi

exec "$NODE_BIN" "$HOME/.gemini/antigravity/scripts/antigravity-font-daemon.mjs"
