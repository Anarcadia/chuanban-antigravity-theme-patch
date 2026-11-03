#!/bin/bash
# ==============================================================================
# Antigravity 界面字体与注入守护控制工具 (Issue D143)
# 用法:
#   antigravity-font-ctl.sh status        - 查看当前守护状态、CDP端口与生效字体
#   antigravity-font-ctl.sh restart       - 重启 LaunchAgent 守护服务
#   antigravity-font-ctl.sh inject        - 立即执行一次热注入
#   antigravity-font-ctl.sh mode font     - 一键切换到【纯字体版】
#   antigravity-font-ctl.sh mode i18n     - 一键切换到【字体+汉化版】
#   antigravity-font-ctl.sh log           - 查看最新运行日志
#   antigravity-font-ctl.sh insiders status - 查看 Insiders 独立调试端口与状态
#   antigravity-font-ctl.sh insiders inject - 对 Insiders 实例执行单次热注入
#   antigravity-font-ctl.sh insiders watch  - 前台运行 Insiders 守护（用于分支开发调试）
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_SCRIPT="$SCRIPT_DIR/antigravity-font-daemon.mjs"
INSIDERS_DAEMON_SCRIPT="$SCRIPT_DIR/antigravity-font-daemon.insiders.mjs"
PURE_FONT_SCRIPT="$HOME/.gemini/antigravity/scripts/antigravity-font-daemon.pure-font.mjs"
I18N_SCRIPT="$HOME/.gemini/antigravity/scripts/antigravity-font-daemon.i18n.mjs"
PLIST_FILE="$HOME/Library/LaunchAgents/com.antigravity.customfont.plist"
PORT_FILE="$HOME/Library/Application Support/Antigravity/DevToolsActivePort"
INSIDERS_PORT_FILE="$HOME/Library/Application Support/Antigravity - Insiders/DevToolsActivePort"
LOG_FILE="/tmp/antigravity-font.log"

NODE_BIN="$HOME/.nvm/versions/node/v24.16.0/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(which node 2>/dev/null || echo "/usr/local/bin/node")
fi

case "$1" in
  status)
    echo "=== 1. LaunchAgent 守护状态 ==="
    launchctl list | grep "com.antigravity.customfont" || echo "未在 launchctl 中运行"

    echo ""
    echo "=== 2. 守护进程 PID ==="
    ps aux | grep "[a]ntigravity-font-daemon.mjs" || echo "未找到运行中的 daemon 进程"

    echo ""
    echo "=== 3. 当前运行模式 ==="
    if grep -q "I18N_DICT" "$DAEMON_SCRIPT" 2>/dev/null; then
      echo "当前版本: 【更纱黑体 + 界面汉化版】"
    else
      echo "当前版本: 【纯更纱黑体字体版】"
    fi

    echo ""
    echo "=== 4. Antigravity 调试端口 ==="
    if [ -f "$PORT_FILE" ]; then
      PORT=$(head -n 1 "$PORT_FILE")
      echo "端口文件正常: $PORT_FILE (端口: $PORT)"
    else
      echo "未检测到 Antigravity 正在运行（端口文件不存在）"
    fi

    echo ""
    echo "=== 5. 实时生效字体检测 ==="
    if [ -f "$PORT_FILE" ]; then
      "$NODE_BIN" -e '
        const http = require("http");
        const fs = require("fs");
        const port = fs.readFileSync(process.env.HOME + "/Library/Application Support/Antigravity/DevToolsActivePort", "utf8").trim().split("\n")[0];
        http.get(`http://127.0.0.1:${port}/json`, res => {
          let body = "";
          res.on("data", c => body += c);
          res.on("end", () => {
            try {
              const list = JSON.parse(body);
              const target = list.find(t => t.type === "page");
              if (!target) { console.log("未找到活跃 page 页面"); return; }
              const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
              ws.onopen = () => {
                ws.send(JSON.stringify({
                  id: 1,
                  method: "Runtime.evaluate",
                  params: {
                    expression: `JSON.stringify({
                      hasCustomStyle: !!document.getElementById("ag-custom-fonts"),
                      bodyFont: getComputedStyle(document.body).fontFamily,
                      codeFont: document.querySelector("code") ? getComputedStyle(document.querySelector("code")).fontFamily : "N/A"
                    })`,
                    returnByValue: true
                  }
                }));
              };
              ws.onmessage = ev => {
                const data = JSON.parse(ev.data);
                if (data.id === 1) {
                  console.log("DOM 样式状态:", JSON.parse(data.result?.result?.value || "{}"));
                  ws.close();
                }
              };
            } catch (e) {
              console.log("检测异常:", e.message);
            }
          });
        }).on("error", err => console.log("连接 CDP 失败:", err.message));
      ' 2>/dev/null
    fi
    ;;

  mode)
    if [ "$2" = "font" ]; then
      echo "正在切换为【纯更纱黑体字体版】..."
      if [ -f "$PURE_FONT_SCRIPT" ]; then
        cp "$PURE_FONT_SCRIPT" "$DAEMON_SCRIPT"
        $0 restart
        echo "已切换为纯字体版并完成重启。请刷新或重新打开 Antigravity 页面查看。"
      else
        echo "错误: 未找到 $PURE_FONT_SCRIPT 备份"
      fi
    elif [ "$2" = "i18n" ]; then
      echo "正在切换为【更纱黑体 + 界面汉化版】..."
      if [ -f "$I18N_SCRIPT" ]; then
        cp "$I18N_SCRIPT" "$DAEMON_SCRIPT"
        $0 restart
        echo "已切换为汉化版并完成重启。请刷新或重新打开 Antigravity 页面查看。"
      else
        echo "错误: 未找到 $I18N_SCRIPT 备份"
      fi
    else
      echo "用法: $0 mode {font|i18n}"
    fi
    ;;

  restart)
    echo "重启 LaunchAgent 守护服务..."
    launchctl unload "$PLIST_FILE" 2>/dev/null
    sleep 1
    launchctl load "$PLIST_FILE"
    echo "重启完成。当前状态："
    launchctl list | grep "com.antigravity.customfont"
    ;;

  inject)
    echo "执行单次热注入..."
    "$NODE_BIN" "$DAEMON_SCRIPT" &
    PID=$!
    sleep 3
    kill $PID 2>/dev/null
    echo "热注入完成。"
    ;;

  log)
    tail -n 30 "$LOG_FILE"
    ;;

  insiders)
    case "$2" in
      status)
        echo "=== 1. Antigravity Insiders 调试端口 ==="
        if [ -f "$INSIDERS_PORT_FILE" ]; then
          PORT=$(head -n 1 "$INSIDERS_PORT_FILE")
          echo "Insiders 端口文件正常: $INSIDERS_PORT_FILE (端口: $PORT)"
          curl -s "http://127.0.0.1:$PORT/json/list" | grep -E 'title|url|webSocketDebuggerUrl' || true
        else
          echo "未检测到 Antigravity Insiders 正在运行（端口文件不存在）"
        fi
        ;;

      inject)
        echo "对 Antigravity Insiders 执行单次开发注入..."
        "$NODE_BIN" "$INSIDERS_DAEMON_SCRIPT" &
        PID=$!
        sleep 2
        kill $PID 2>/dev/null
        echo "Insiders 热注入完成。"
        ;;

      watch)
        echo "启动 Antigravity Insiders 前台热守护（Ctrl+C 退出）..."
        exec "$NODE_BIN" "$INSIDERS_DAEMON_SCRIPT"
        ;;

      *)
        echo "用法: $0 insiders {status|inject|watch}"
        exit 1
        ;;
    esac
    ;;

  *)
    echo "用法: $0 {status|mode font|mode i18n|restart|inject|log|insiders}"
    exit 1
    ;;
esac
