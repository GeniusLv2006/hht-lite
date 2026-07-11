#!/bin/bash
# Copyright (c) 2026 GeniusLv2006
# SPDX-License-Identifier: MPL-2.0

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="${IMAGE_NAME:-hht-lite}"
CONTAINER_NAME="${CONTAINER_NAME:-hht-lite}"
DATA_DIR="${DATA_DIR:-$SCRIPT_DIR/data}"
BIND_HOST="${HHT_BIND_HOST:-172.17.0.1}"
HOST_PORT="${HHT_HOST_PORT:-3100}"
CONTAINER_PORT=3100
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-75}"
CANDIDATE_NAME="${CONTAINER_NAME}-candidate"
ROLLBACK_NAME="${CONTAINER_NAME}-rollback"
BUILD_IMAGE=true

ensure_release_source() {
  local branch upstream_status
  branch="$(git -C "$SCRIPT_DIR" branch --show-current)"
  if [ "$branch" != "main" ]; then
    echo "Release builds must run from main (current branch: ${branch:-detached})." >&2
    return 1
  fi
  if [ -n "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=normal)" ]; then
    echo "Release builds require a clean working tree." >&2
    return 1
  fi
  if git -C "$SCRIPT_DIR" rev-parse --verify origin/main >/dev/null 2>&1; then
    upstream_status="$(git -C "$SCRIPT_DIR" rev-list --left-right --count origin/main...HEAD)"
    if [ "$upstream_status" != $'0\t0' ]; then
      echo "Release builds require HEAD to match origin/main (divergence: $upstream_status)." >&2
      return 1
    fi
  fi
}

restore_previous_container() {
  docker rm --force "$CONTAINER_NAME" >/dev/null 2>&1 || true
  if [ "$had_previous" = true ]; then
    docker rename "$ROLLBACK_NAME" "$CONTAINER_NAME"
    docker start "$CONTAINER_NAME" >/dev/null
    wait_for_health "$CONTAINER_NAME" || true
  fi
}

usage() {
  echo "Usage: $0 [--image vMAJOR.MINOR.PATCH]"
  echo "Without arguments, build and deploy the version declared in package.json."
  echo "Use --image only with a previously verified self-contained image (v5.1.0 or newer)."
}

main() {
if [ "$#" -eq 2 ] && [ "$1" = "--image" ]; then
  VERSION="$2"
  BUILD_IMAGE=false
elif [ "$#" -eq 0 ]; then
  if command -v node >/dev/null 2>&1; then
    VERSION="v$(node -p "require('$SCRIPT_DIR/package.json').version")"
  elif command -v python3 >/dev/null 2>&1; then
    VERSION="v$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$SCRIPT_DIR/package.json")"
  else
    echo "Reading package.json requires node or python3." >&2
    exit 1
  fi
else
  usage >&2
  exit 2
fi

if ! [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release version: $VERSION" >&2
  exit 2
fi

IMAGE_REF="${IMAGE_NAME}:${VERSION}"
GIT_SHA="$(git -C "$SCRIPT_DIR" rev-parse --verify HEAD)"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CANDIDATE_DATA_DIR=""

env_args=()
if [ -f "$SCRIPT_DIR/.env" ]; then
  env_args=(--env-file "$SCRIPT_DIR/.env")
fi

wait_for_health() {
  local container="$1"
  local elapsed=0
  local status

  while [ "$elapsed" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
    status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
      return 1
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  return 1
}

remove_candidate() {
  docker rm --force "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  if [ -n "$CANDIDATE_DATA_DIR" ]; then
    rm -rf "$CANDIDATE_DATA_DIR"
  fi
}

run_application() {
  local name="$1"
  local data_dir="$2"
  shift 2

  docker run --detach \
    --name "$name" \
    --restart unless-stopped \
    --init \
    --read-only \
    --tmpfs /tmp \
    --security-opt no-new-privileges:true \
    --volume "${data_dir}:/app/data" \
    "${env_args[@]}" \
    "$@" \
    "$IMAGE_REF"
}

if [ "$BUILD_IMAGE" = true ]; then
  ensure_release_source
  echo "=== Building ${IMAGE_REF} ==="
  docker build \
    --build-arg "APP_VERSION=$VERSION" \
    --build-arg "VCS_REF=$GIT_SHA" \
    --build-arg "BUILD_DATE=$BUILD_DATE" \
    --tag "$IMAGE_REF" \
    "$SCRIPT_DIR"
else
  docker image inspect "$IMAGE_REF" >/dev/null
fi

if docker container inspect "$ROLLBACK_NAME" >/dev/null 2>&1; then
  echo "Refusing to overwrite existing rollback container: $ROLLBACK_NAME" >&2
  exit 1
fi

echo "=== Smoke-testing candidate ==="
remove_candidate
CANDIDATE_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hht-lite-candidate.XXXXXX")"
trap remove_candidate EXIT
run_application "$CANDIDATE_NAME" "$CANDIDATE_DATA_DIR"
if ! wait_for_health "$CANDIDATE_NAME"; then
  docker logs "$CANDIDATE_NAME" 2>&1 || true
  echo "Candidate did not become healthy; current container was not changed." >&2
  exit 1
fi
remove_candidate
trap - EXIT

mkdir -p "$DATA_DIR"
had_previous=false
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  had_previous=true
  echo "=== Preserving current container for rollback ==="
  docker stop "$CONTAINER_NAME" >/dev/null
  docker rename "$CONTAINER_NAME" "$ROLLBACK_NAME"
fi

echo "=== Starting ${IMAGE_REF} ==="
if ! run_application "$CONTAINER_NAME" "$DATA_DIR" \
  --publish "${BIND_HOST}:${HOST_PORT}:${CONTAINER_PORT}"; then
  restore_previous_container
  exit 1
fi

if ! wait_for_health "$CONTAINER_NAME"; then
  echo "New container failed health verification; restoring previous container." >&2
  docker logs "$CONTAINER_NAME" 2>&1 || true
  restore_previous_container
  exit 1
fi

health_payload="$(docker exec "$CONTAINER_NAME" wget --quiet --output-document=- http://127.0.0.1:3100/healthz)"
version_payload="$(docker exec "$CONTAINER_NAME" wget --quiet --output-document=- http://127.0.0.1:3100/api/version)"
if [[ "$health_payload" != *'"status":"ok"'* ]] || [[ "$version_payload" != *"\"version\":\"$VERSION\""* ]]; then
  echo "Post-deployment endpoint verification failed; restoring previous container." >&2
  restore_previous_container
  exit 1
fi

if [ "$had_previous" = true ]; then
  docker rm "$ROLLBACK_NAME" >/dev/null
fi
docker tag "$IMAGE_REF" "${IMAGE_NAME}:latest"

echo "=== Deployment verified ==="
docker ps --filter "name=^/${CONTAINER_NAME}$" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
echo "$health_payload"
echo "$version_payload"

echo "=== Pruning old version tags (keeping 3) ==="
mapfile -t old_tags < <(
  docker images "$IMAGE_NAME" --format '{{.Tag}}' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -rV \
    | tail -n +4
)
for tag in "${old_tags[@]}"; do
  docker image rm "${IMAGE_NAME}:${tag}" >/dev/null 2>&1 || true
done
}

if [ "${HHT_DEPLOY_LIB_ONLY:-false}" != true ]; then
  main "$@"
fi
