#!/usr/bin/env bash
# 后端启动（默认部署目标：pyf 服务器 / panyifeng.xyz）.
set -e
cd "$(dirname "$0")"

# 1) 加载 DeepSeek key（~/bin/.deepseek.env 优先；也可以已经通过 env 传入）
if [ -z "$DEEPSEEK_API_KEY" ] && [ -f "$HOME/bin/.deepseek.env" ]; then
  set -a; . "$HOME/bin/.deepseek.env"; set +a
fi
if [ -z "$DEEPSEEK_API_KEY" ]; then
  echo "[run.sh] ⚠ DEEPSEEK_API_KEY 未设置；从 ~/bin/.deepseek.env 也找不到。" >&2
  echo "         请确认服务器上有 ~/bin/.deepseek.env 或导出 DEEPSEEK_API_KEY 再启动。" >&2
fi

# 2) HuggingFace 镜像（faster-whisper 拉模型走 hf-mirror，pyf 服务器国内直连）
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"

# 3) tts-edge / claude / 任何项目 CLI 加进 PATH
export PATH="$HOME/claw/bin:$HOME/.local/bin:$PATH"

# 4) 一次性 venv + 装依赖
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi

# 5) 启动。监听 0.0.0.0:8765；前面挂 nginx/caddy 终结 HTTPS（详见 README）
export PORT="${PORT:-8765}"
export DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-v4-flash}"
export WHISPER_SIZE="${WHISPER_SIZE:-tiny.en}"

echo "[run.sh] listening :$PORT  model=$DEEPSEEK_MODEL  whisper=$WHISPER_SIZE"
exec ./.venv/bin/python server.py
