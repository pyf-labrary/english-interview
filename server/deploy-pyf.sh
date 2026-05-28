#!/usr/bin/env bash
# 一键部署到 ssh pyf（panyifeng.xyz 阿里云）.
# - rsync 后端代码 + CLI 题库/profile + tts-edge + deepseek key
# - 远端 apt install ffmpeg + python venv
# - systemd unit 持久化运行
#
# 用法：./deploy-pyf.sh             # 全套部署
#       ./deploy-pyf.sh --sync      # 仅同步代码（不重装依赖、不重启服务）
#       ./deploy-pyf.sh --restart   # 仅重启 systemd 服务
#
set -euo pipefail
cd "$(dirname "$0")/.."   # → proto/english-interview-web/

SSH_TARGET="${SSH_TARGET:-pyf}"
REMOTE_ROOT="${REMOTE_ROOT:-/root/eng-interview}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_CLI="$REPO_ROOT/cli"
LOCAL_TTS="$REPO_ROOT/bin/tts-edge"
LOCAL_KEY="$HOME/bin/.deepseek.env"

mode="${1:-full}"

echo "→ target: $SSH_TARGET:$REMOTE_ROOT  (mode=$mode)"
ssh "$SSH_TARGET" "mkdir -p $REMOTE_ROOT/cli $REMOTE_ROOT/bin"

echo "→ rsync server/ cli/ tts-edge ..."
rsync -avz --delete \
  --exclude .venv --exclude __pycache__ --exclude '*.pyc' \
  ./server/ "$SSH_TARGET:$REMOTE_ROOT/server/"

rsync -avz --delete \
  --exclude logs --exclude .state.json --exclude __pycache__ \
  "$LOCAL_CLI/" "$SSH_TARGET:$REMOTE_ROOT/cli/"

rsync -avz "$LOCAL_TTS" "$SSH_TARGET:$REMOTE_ROOT/bin/tts-edge"
# tts-edge 用 venv python（默认 #!/usr/bin/env python3 在 pyf 上没装 edge_tts）
ssh "$SSH_TARGET" "chmod +x $REMOTE_ROOT/bin/tts-edge && \
  sed -i '1c#!$REMOTE_ROOT/server/.venv/bin/python' $REMOTE_ROOT/bin/tts-edge"

if [ -f "$LOCAL_KEY" ]; then
  ssh "$SSH_TARGET" "mkdir -p /root/bin"
  rsync -avz "$LOCAL_KEY" "$SSH_TARGET:/root/bin/.deepseek.env"
  ssh "$SSH_TARGET" "chmod 600 /root/bin/.deepseek.env"
else
  echo "⚠ 本地缺 $LOCAL_KEY，跳过同步 deepseek key" >&2
fi

if [ "$mode" = "--sync" ]; then
  echo "✓ sync only"; exit 0
fi

if [ "$mode" != "--restart" ]; then
  echo "→ apt install ffmpeg + python venv（首次会下 faster-whisper tiny.en）"
  ssh "$SSH_TARGET" "bash -s" <<REMOTE
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
which ffmpeg >/dev/null 2>&1 || apt-get update && apt-get install -y ffmpeg python3-venv python3-pip
cd $REMOTE_ROOT/server
if [ ! -d .venv ]; then
  python3 -m venv .venv
  ./.venv/bin/pip install --upgrade pip
  ./.venv/bin/pip install -r requirements.txt
fi
REMOTE
fi

echo "→ 写 systemd unit"
ssh "$SSH_TARGET" "bash -s" <<REMOTE
cat >/etc/systemd/system/eng-interview.service <<'UNIT'
[Unit]
Description=english-interview-web FastAPI backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_ROOT/server
EnvironmentFile=/root/bin/.deepseek.env
Environment="PATH=$REMOTE_ROOT/bin:/usr/local/bin:/usr/bin:/bin"
Environment="SRC_ROOT=$REMOTE_ROOT/cli"
Environment="TTS_EDGE=$REMOTE_ROOT/bin/tts-edge"
Environment="HF_ENDPOINT=https://hf-mirror.com"
Environment="WHISPER_SIZE=tiny.en"
Environment="DEEPSEEK_MODEL=deepseek-v4-flash"
Environment="PORT=8765"
ExecStart=$REMOTE_ROOT/server/.venv/bin/python $REMOTE_ROOT/server/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable eng-interview.service
systemctl restart eng-interview.service
sleep 2
systemctl --no-pager --lines=10 status eng-interview.service
echo "----"
curl -s http://127.0.0.1:8765/api/health
REMOTE

echo ""
echo "✓ 部署完成。后端在 ssh $SSH_TARGET 上 127.0.0.1:8765"
echo "  下一步：在 1panel/openresty 里加反代 eng.panyifeng.xyz → 127.0.0.1:8765"
echo "  详见 README · 反代 + HTTPS 段。"
