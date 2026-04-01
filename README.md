# hht-web

慧湖通（HuiHuTong）的 PWA 前端 + 后端服务，提供黑名单检测、访问日志、公告推送、版本管理等功能，并内置管理后台。

> 前端 PWA 基于 [hht-web](https://github.com/mercutiojohn/hht-web)，感谢 [@PairZhu](https://github.com/PairZhu)。

---

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)）
- **部署**：Docker

---

## 快速部署

### 1. 克隆仓库

```bash
git clone https://github.com/GeniusLv2006/hht-web.git
cd hht-web
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入必要的值
```

### 3. 构建并启动容器

```bash
./deploy.sh
```

默认监听 `172.17.0.1:3100`，可搭配 Nginx 反向代理使用。

---

## 环境变量

参见 [`.env.example`](.env.example)，关键变量：

| 变量 | 说明 | 必填 |
|------|------|------|
| `ADMIN_OPENID` | 管理员微信小程序慧湖通 OpenID | 是 |
| `INIT_ADMIN_PASSWORD` | 首次启动时创建管理员账户的密码 | 首次部署时需要 |
| `INIT_ADMIN_USER` | 管理员用户名（默认 `admin`） | 否 |
| `ALLOWED_ORIGINS` | 允许的前端域名，逗号分隔 | 否 |

---

## 发布新版本

修改 `version.json`，然后：

```bash
npm run sync-version   # 同步 service-worker.js 的 CACHE_NAME
git add -A && git commit -m "release: vX.X.X"
git push

# VPS 上执行
git pull && ./deploy.sh
```

---

## License

MIT
