# NewAPI 额度统计平台

基于 `Next.js 16 + React 19 + Tailwind CSS v4` 的多站点额度统计面板，用于集中查看多个 NewAPI 实例的余额、区间消耗、请求量和活动站点详情。

## 当前特性

- 分页面结构：
  - `/dashboard` 总览
  - `/sites` 站点管理
  - `/board` 多站点余额表
  - `/insights` 活动站点详情
- 支持多站点配置
- 支持三种鉴权方式：
  - `Authorization`
  - `session`
  - `New-Api-User`
- 支持 `24 小时 / 7 天 / 30 天` 查询区间
- 支持导入 / 导出站点配置
- 支持低余额阈值高亮
- 支持单用户服务端持久化

## 持久化说明

当前版本不再依赖浏览器 `localStorage` 作为主存储。

站点配置、当前区间和活动站点会保存在服务端文件：

```text
data/dashboard-settings.json
```

这意味着：

- 只要访问的是同一套部署实例，换电脑后仍然可以看到同一批站点
- 删除或修改站点会影响这套部署的所有访问设备
- Docker 部署时必须挂载 `data` 目录，否则重建容器后配置会丢失

兼容说明：

- 如果旧版本数据还在浏览器 `localStorage` 中，新版本首次打开时会自动尝试迁移到服务端

## 数据来源

服务端通过代理聚合以下接口：

- `GET /api/user/self`
- `GET /api/data/self`

其中：

- `quota` 用于当前余额
- `used_quota` 用于历史已用
- `request_count` 用于累计请求数
- `/api/data/self` 用于区间趋势和模型消耗分析

## 本地启动

```bash
npm install
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 生产构建

```bash
npm run lint
npm run build
npm run start
```

## Docker

### 本地构建镜像

```bash
docker build -t newapi-api:latest .
docker run --rm -p 3000:3000 -v ./data:/app/data newapi-api:latest
```

### Docker Compose

项目默认将服务端持久化目录挂载到宿主机：

```yaml
volumes:
  - ./data:/app/data
```

启动：

```bash
docker compose up -d
```

## 关键目录

```text
src/
  app/
    api/dashboard/route.ts
    api/settings/route.ts
    globals.css
    layout.tsx
    page.tsx
  components/dashboard/
    dashboard-shell.tsx
    model-breakdown.tsx
    site-balance-table.tsx
    trend-chart.tsx
  lib/
    dashboard-settings.ts
    dashboard-types.ts
    formatters.ts
    newapi-client.ts
    quota.ts
    settings-store.ts
data/
  .gitkeep
```

## 设计取向

- `KISS`：优先保证单用户、多站点巡检场景可直接落地
- `YAGNI`：当前先做单用户服务端持久化，不引入登录和数据库
- `DRY`：统一通过共享设置规范和 `/api/settings` 持久化配置
- `SOLID`：将配置规范、文件存储、接口路由和页面逻辑拆分

## 已验证

```bash
npm run lint
npm run build
```
