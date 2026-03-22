#!/usr/bin/env bash

set -Eeuo pipefail

REPO_OWNER="nanashiwang"
REPO_NAME="newapi-api"
RAW_BASE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/newapi-api}"
COMPOSE_FILE_URL="${RAW_BASE_URL}/docker-compose.yml"
SERVER_INIT_URL="${RAW_BASE_URL}/scripts/server-init.sh"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

run_privileged() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  else
    if ! command -v sudo >/dev/null 2>&1; then
      printf '\n[ERROR] 当前用户不是 root，且系统缺少 sudo，无法执行提权命令。\n' >&2
      exit 1
    fi
    sudo "$@"
  fi
}

ensure_curl() {
  if command -v curl >/dev/null 2>&1; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    log "未检测到 curl，开始安装"
    run_privileged apt-get update
    run_privileged apt-get install -y curl
    return
  fi

  printf '\n[ERROR] 当前系统缺少 curl，且无法自动安装。\n' >&2
  exit 1
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1
}

ensure_docker() {
  if docker_available; then
    return
  fi

  log "未检测到 Docker 或 Compose Plugin，开始执行服务器初始化脚本"

  local init_script
  init_script="$(mktemp)"
  curl -fsSL "${SERVER_INIT_URL}" -o "${init_script}"
  run_privileged bash "${init_script}"
  rm -f "${init_script}"
}

ensure_docker_service() {
  if docker info >/dev/null 2>&1; then
    return
  fi

  if command -v systemctl >/dev/null 2>&1; then
    log "确保 Docker 服务已启动"
    run_privileged systemctl enable --now docker
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    run_privileged docker "$@"
  fi
}

docker_compose_cmd() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  else
    run_privileged docker compose "$@"
  fi
}

prepare_deploy_dir() {
  log "准备部署目录 ${DEPLOY_DIR}"
  run_privileged mkdir -p "${DEPLOY_DIR}"
}

download_compose_file() {
  log "下载最新 docker-compose.yml"
  if [[ "${EUID}" -eq 0 ]]; then
    curl -fsSL "${COMPOSE_FILE_URL}" -o "${DEPLOY_DIR}/docker-compose.yml"
  else
    curl -fsSL "${COMPOSE_FILE_URL}" | sudo tee "${DEPLOY_DIR}/docker-compose.yml" >/dev/null
  fi
}

login_ghcr_if_needed() {
  if [[ -z "${GHCR_USERNAME:-}" || -z "${GHCR_TOKEN:-}" ]]; then
    return
  fi

  log "检测到 GHCR 凭证，开始登录 ghcr.io"
  printf '%s' "${GHCR_TOKEN}" | docker_cmd login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
}

deploy_app() {
  log "拉取镜像并启动容器"
  cd "${DEPLOY_DIR}"
  docker_compose_cmd pull
  docker_compose_cmd up -d
}

print_summary() {
  cat <<EOF

部署完成。

部署目录：
  ${DEPLOY_DIR}

常用命令：
  cd ${DEPLOY_DIR}
  docker compose ps
  docker compose logs -f
  docker compose pull && docker compose up -d

默认访问地址：
  http://服务器IP:3000
EOF
}

main() {
  ensure_curl
  ensure_docker
  ensure_docker_service
  prepare_deploy_dir
  download_compose_file
  login_ghcr_if_needed
  deploy_app
  print_summary
}

main "$@"
