#!/usr/bin/env bash
# RIC 选课规划器 · 一键安装（Docker 方式）
# 用法： bash scripts/setup.sh
set -euo pipefail

# 切到仓库根目录（scripts/ 的上一级）
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [1/4] 检查 Docker / Docker Compose"
if ! command -v docker >/dev/null 2>&1; then
  echo "错误：未检测到 docker，请先安装 Docker Desktop。" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "错误：docker compose 不可用（需 Docker Desktop 自带或单独安装）。" >&2
  exit 1
fi

echo "==> [2/4] 构建并启动服务（含前端依赖安装）"
docker compose up -d --build

echo "==> [3/4] 等待后端就绪（最多 60s）"
for i in $(seq 1 60); do
  if curl -fsS http://localhost:3001/api/health >/dev/null 2>&1; then
    echo "    后端已就绪 ✓"
    break
  fi
  sleep 1
done

echo "==> [4/4] 完成"
echo "    前端页面 : http://localhost:5173"
echo "    后端 API : http://localhost:3001/api/health"
echo
echo "提示："
echo "    停止服务          : docker compose down"
echo "    新增前端依赖后重建 : docker compose rm -sfv frontend && docker compose up -d --build frontend"
echo "    AI 助手(可选)     : 在 backend/.env 填入 DEEPSEEK_API_KEY 后 docker restart ric-backend"
