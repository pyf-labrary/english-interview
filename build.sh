#!/usr/bin/env bash
# 把 app.src.jsx 预编译成 app.js（去掉浏览器端 3.1MB Babel 运行时转译）。
# 改完前端逻辑（app.src.jsx）后跑一次；改 HTML 壳/CSS 直接动 index.html 不用 build。
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d node_modules/@babel/core ]; then
  echo "→ 安装 babel 构建依赖（一次性）…"
  npm install --no-save @babel/core @babel/preset-typescript @babel/preset-react
fi
node build.js
node --check app.js && echo "✓ app.js 语法 OK"
