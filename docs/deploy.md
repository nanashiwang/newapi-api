# 部署说明

本文档说明如何在一台全新的 Linux 服务器上，直接拉取 `ghcr.io/nanashiwang/newapi-api:latest` 并启动服务。

## 1. 前置条件

- 服务器已安装 Docker
- 服务器已安装 Docker Compose Plugin，也就是支持 `docker compose`
- 服务器可以访问 `ghcr.io`

可先执行以下命令确认：

```bash
docker --version
docker compose version
```

## 2. 准备部署目录

登录服务器后，创建一个独立目录：

```bash
mkdir -p /opt/newapi-api
cd /opt/newapi-api
```

将仓库中的 `docker-compose.yml` 上传到这个目录，或者直接在服务器里创建同名文件。

当前 `docker-compose.yml` 已经写好，默认会启动：

- 镜像：`ghcr.io/nanashiwang/newapi-api:latest`
- 容器名：`newapi-api`
- 端口：`3000:3000`

## 3. 拉取并启动

在部署目录执行：

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
