#!/bin/bash
# 自动寻找可用 Node.js (>= 22)
NODE_BIN=$(command -v node 2>/dev/null)
if [ -z "$NODE_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN=$(ls -1d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n 1)
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="/usr/local/bin/node"
fi

exec "$NODE_BIN" --disable-warning=ExperimentalWarning "$HOME/.gemini/antigravity/scripts/antigravity-font-daemon.mjs" "$@"
