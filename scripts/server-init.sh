#!/usr/bin/env bash

set -Eeuo pipefail

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

fail() {
  printf '\n[ERROR] %s\n' "$1" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "请使用 root 或 sudo 执行此脚本。示例：sudo bash scripts/server-init.sh"
  fi
}

ensure_supported_os() {
  if [[ ! -f /etc/os-release ]]; then
    fail "无法识别当前系统，缺少 /etc/os-release。"
  fi

  # shellcheck disable=SC1091
  source /etc/os-release

  if [[ "${ID:-}" != "ubuntu" && "${ID:-}" != "debian" ]]; then
    fail "当前脚本仅支持 Ubuntu / Debian，当前系统为：${PRETTY_NAME:-unknown}"
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    fail "当前系统缺少 apt-get，无法继续安装 Docker。"
  fi
}

install_base_packages() {
  log "安装基础依赖"
  apt-get update
  apt-get install -y ca-certificates curl gnupg
}

setup_docker_repo() {
  # shellcheck disable=SC1091
  source /etc/os-release

  log "配置 Docker 官方软件源"
  install -m 0755 -d /etc/apt/keyrings

  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  local arch
  arch="$(dpkg --print-architecture)"

  local codename="${VERSION_CODENAME:-}"
  if [[ -z "${codename}" ]]; then
    fail "未能识别系统代号 VERSION_CODENAME，无法配置 Docker 软件源。"
  fi

  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${codename} stable
EOF
}

install_docker() {
  log "安装 Docker Engine / Buildx / Compose Plugin"
  apt-get update
  apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin
}

enable_docker_service() {
  log "启用并启动 Docker 服务"
  systemctl enable --now docker
}

grant_docker_group() {
  local target_user="${SUDO_USER:-${TARGET_USER:-}}"

  if ! getent group docker >/dev/null 2>&1; then
    groupadd docker
  fi

  if [[ -n "${target_user}" && "${target_user}" != "root" ]]; then
    usermod -aG docker "${target_user}"
    log "已将用户 ${target_user} 加入 docker 组，重新登录后即可免 sudo 使用 docker"
  else
    log "未检测到非 root 登录用户，跳过 docker 用户组授权"
  fi
}

print_summary() {
  log "Docker 安装结果"
  docker --version
  docker compose version

  cat <<'EOF'

安装完成。后续可按以下步骤部署应用：

1. 创建目录并进入
   mkdir -p /opt/newapi-api && cd /opt/newapi-api

2. 下载 compose 文件
   curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/docker-compose.yml -o docker-compose.yml

3. 拉取并启动
   docker compose pull
   docker compose up -d

如果刚刚把当前用户加入了 docker 组，请重新登录一次终端后再执行上述命令。
EOF
}

main() {
  require_root
  ensure_supported_os
  install_base_packages
  setup_docker_repo
  install_docker
  enable_docker_service
  grant_docker_group
  print_summary
}

main "$@"
