# 部署说明

本文档说明如何在一台全新的 Linux 服务器上，直接完成 Docker 环境安装、拉取 `ghcr.io/nanashiwang/newapi-api:latest` 并启动服务。

## 1. 一条命令完成安装 + 拉镜像 + 启动

仓库已提供一键部署脚本：

- `scripts/deploy.sh`

适用场景：

- 服务器还没安装 Docker
- 你希望尽量减少手工步骤
- 你只想执行一次命令就把应用跑起来

推荐执行方式：

```bash
curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/scripts/deploy.sh -o deploy.sh
bash deploy.sh
```

这个脚本会自动完成：

- 检查并安装 `curl`
- 检查 Docker / Compose Plugin 是否存在
- 如果缺失，则自动调用服务器初始化脚本安装 Docker
- 创建部署目录 `/opt/newapi-api`
- 下载最新 `docker-compose.yml`
- 拉取 GHCR 镜像
- 启动容器

如果你想改部署目录，可以这样执行：

```bash
curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/scripts/deploy.sh -o deploy.sh
DEPLOY_DIR=/data/newapi-api bash deploy.sh
```

如果你的 GHCR 包保持私有，可以这样执行：

```bash
curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/scripts/deploy.sh -o deploy.sh
GHCR_USERNAME=nanashiwang GHCR_TOKEN=<你的PAT> bash deploy.sh
```

## 2. 只初始化服务器环境

如果你只想先把 Docker 环境装好，再手动部署，也可以单独执行：

- `scripts/server-init.sh`

适用范围：

- Ubuntu
- Debian

这个脚本会自动完成：

- 安装 Docker 官方源
- 安装 Docker Engine
- 安装 Docker Compose Plugin
- 启动并设置 Docker 开机自启
- 将当前 sudo 用户加入 `docker` 用户组

执行方式：

```bash
curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/scripts/server-init.sh -o server-init.sh
sudo bash server-init.sh
```

执行完成后，建议重新登录一次终端，再继续后面的部署步骤。

## 3. 手动部署方式

如果你不想走一键脚本，也可以按下面步骤手动部署。

### 3.1 前置条件

- 服务器已安装 Docker
- 服务器已安装 Docker Compose Plugin，也就是支持 `docker compose`
- 服务器可以访问 `ghcr.io`

先确认环境：

```bash
docker --version
docker compose version
```

### 3.2 准备部署目录

```bash
mkdir -p /opt/newapi-api
cd /opt/newapi-api
```

下载 compose 文件：

```bash
curl -fsSL https://raw.githubusercontent.com/nanashiwang/newapi-api/main/docker-compose.yml -o docker-compose.yml
```

当前 `docker-compose.yml` 默认使用：

- 镜像：`ghcr.io/nanashiwang/newapi-api:latest`
- 容器名：`newapi-api`
- 端口：`3000:3000`

### 3.3 拉取并启动

```bash
docker compose pull
docker compose up -d
```

查看运行状态：

```bash
docker compose ps
docker compose logs -f
```

默认访问地址：

```text
http://服务器IP:3000
```

## 4. 更新版本

后续代码推到 `main` 后，GitHub Actions 会自动重新构建镜像。

服务器更新只需要执行：

```bash
cd /opt/newapi-api
docker compose pull
docker compose up -d
```

如果要清理旧镜像，可执行：

```bash
docker image prune -f
```

## 5. 停止服务

```bash
cd /opt/newapi-api
docker compose down
```

## 6. 如果 GHCR 镜像拉取失败

常见原因有两个：

### 情况 A：镜像包还是私有

如果 `docker pull ghcr.io/nanashiwang/newapi-api:latest` 提示无权限，请到 GitHub 页面将容器包切成公开：

- 进入 `https://github.com/nanashiwang?tab=packages`
- 打开 `newapi-api` 容器包
- 进入包设置
- 将可见性改为 `public`

### 情况 B：你想继续保留私有镜像

如果你希望镜像保持私有，需要先登录 GHCR：

```bash
echo "<你的 GitHub PAT>" | docker login ghcr.io -u nanashiwang --password-stdin
docker compose pull
docker compose up -d
```

建议 PAT 至少包含：

- `read:packages`

如果还需要由服务器推送镜像，再额外加：

- `write:packages`

## 7. 反向代理建议

如果你准备对外正式使用，建议再挂一个 Nginx 或 Caddy，把 80/443 代理到容器的 `3000` 端口。

推荐结构：

- 公网入口：`80` / `443`
- 应用容器：`127.0.0.1:3000`

## 8. 应用特性说明

这个项目当前不依赖数据库，站点配置保存在浏览器本地 `localStorage` 中，所以：

- 换浏览器不会共享站点配置
- 换设备不会自动同步站点配置
- 服务端本身是无状态的，适合直接容器化部署
