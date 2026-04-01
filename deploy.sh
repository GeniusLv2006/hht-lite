#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="hht-app"
CONTAINER_NAME="hht-web"
DATA_DIR="$SCRIPT_DIR/data"
BIND_HOST="172.17.0.1"
CONTAINER_PORT=3100

# 从 version.json 读取版本号（需要 node 或 python3）
VERSION=$(node -e "process.stdout.write(require('${SCRIPT_DIR}/version.json').version)" 2>/dev/null \
  || python3 -c "import json,sys; print(json.load(open('${SCRIPT_DIR}/version.json'))['version'],end='')" 2>/dev/null \
  || echo "latest")

echo "=== Building Docker image (${VERSION}) ==="
docker build -t "${IMAGE_NAME}:${VERSION}" -t "${IMAGE_NAME}:latest" "$SCRIPT_DIR"

echo "=== Replacing container ==="
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm   "$CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "${BIND_HOST}:${CONTAINER_PORT}:${CONTAINER_PORT}" \
  -v "${DATA_DIR}:/app/data" \
  -v "${SCRIPT_DIR}/public:/app/public:ro" \
  -v "${SCRIPT_DIR}/admin:/app/admin:ro" \
  "${IMAGE_NAME}:latest"

echo "=== Done ==="
docker ps --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 保留最近 3 个版本镜像，清理更早的
echo "=== Pruning old images (keeping 3 versions) ==="
docker images "${IMAGE_NAME}" --format "{{.Tag}}\t{{.ID}}" \
  | grep -v "latest" \
  | sort -rV \
  | tail -n +4 \
  | awk '{print $2}' \
  | xargs -r docker rmi || true
