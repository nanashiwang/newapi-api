# NewAPI 额度统计平台

一个基于 `Next.js 16 + React 19 + Tailwind CSS v4` 的多站点额度统计平台，用来集中查看多个 NewAPI 实例的个人额度、历史消耗和区间趋势。

核心数据来源参考 NewAPI 管理端统计接口文档：

- `https://www.newapi.ai/zh/docs/api/management/statistics/data-self-get`

项目通过服务端代理请求 NewAPI，避免浏览器直接跨域访问；站点配置保存在当前浏览器 `localStorage`，不依赖数据库。

## 功能概览

- 支持保存多个 NewAPI 实例
- 支持在同一页面切换活动站点
- 支持 `Authorization`、`session`、`New-Api-User` 三种鉴权方式
- 支持全局查询区间：`24 小时 / 7 天 / 30 天`
- 支持多站点余额表统一查看
- 支持站点分组管理
- 支持低余额阈值配置与高亮预警
- 支持搜索、分组筛选、排序
- 支持导出当前筛选结果为 `CSV` 和 `Excel`
- 支持查看当前活动站点的趋势图、模型消耗分布、账户信号

## 当前页面结构

### 1. 站点管理

- 保存多个 NewAPI 实例
- 维护站点名称、分组、地址、鉴权方式、鉴权值
- 配置低余额阈值
- 本地保存并自动回填

### 2. 多站点余额表

- 以表格形式展示多个站点的余额
- 按分组分段展示
- 支持总计行与分组小计
- 支持按余额、区间消耗、请求数、最近同步时间排序
- 支持按站点名、Host、URL、分组搜索
- 余额低于阈值时自动高亮

### 3. 活动站点详情

- 概览卡片
- 额度趋势图
- 模型消耗排行
- 账户信号面板

## 数据来源

当前实现主要聚合以下两个接口：

- `GET /api/user/self`
- `GET /api/data/self`

其中：

- `quota` 用于展示当前余额
- `used_quota` 用于展示历史已用
- `request_count` 用于展示累计请求数
- `/api/data/self` 用于生成区间额度趋势和模型消耗拆解

## 使用限制

- 个人额度统计接口单次最多查询 `30 天`
- 鉴权信息仅保存在当前浏览器本地
- 当前版本不接入数据库，不做多用户共享配置

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
docker run --rm -p 3000:3000 newapi-api:latest
```

### 一条命令启动

仓库根目录已提供 `docker-compose.yml`，默认直接使用 GHCR 镜像：

```bash
docker compose up -d
```

当前默认镜像地址：

```text
ghcr.io/nanashiwang/newapi-api:latest
```

### 推送到 GitHub 后自动发布镜像

项目已包含 GHCR 发布工作流：

- 工作流文件：`.github/workflows/publish-ghcr.yml`
- 默认镜像地址：`ghcr.io/nanashiwang/newapi-api:latest`
- 当代码推送到 `main` / `master` 或推送 `v*` 标签时，会自动构建并推送镜像

如果你要直接拉取镜像，可使用：

```bash
docker pull ghcr.io/nanashiwang/newapi-api:latest
docker run --rm -p 3000:3000 ghcr.io/nanashiwang/newapi-api:latest
```

## 部署文档

已新增服务器部署说明：

- `docs/deploy.md`

内容包括：

- 服务器前置条件检查
- 使用 `docker compose pull && docker compose up -d` 启动
- 更新镜像后的滚动拉取方式
- GHCR 拉取失败时的处理方式
- 私有/公开镜像两种处理路径

## 项目结构

```text
src/
  app/
    api/dashboard/route.ts
    globals.css
    layout.tsx
    page.tsx
  components/dashboard/
    dashboard-shell.tsx
    metric-card.tsx
    model-breakdown.tsx
    site-balance-table.tsx
    trend-chart.tsx
  lib/
    dashboard-types.ts
    formatters.ts
    newapi-client.ts
```

## 设计取向

- `KISS`：以前端单页 + 服务端代理完成核心需求
- `YAGNI`：只做当前所需的多站点额度统计与导出
- `DRY`：统一通过 `/api/dashboard` 代理和归一化数据
- `SOLID`：类型、代理、格式化、可视化组件按职责拆分

## 已验证

当前版本已通过：

```bash
npm run lint
npm run build
```
