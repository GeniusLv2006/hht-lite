# hht-lite

> [!WARNING]
> **项目已停止主动维护，但仓库暂不归档。** 代码按现状提供，不承诺兼容性、安全更新、问题响应或后续版本。欢迎自行部署或 Fork；Issue 和 Pull Request 可能不会得到处理。

慧湖通（HuiHuTong）的 PWA 前端与后端服务，提供黑名单检测、访问日志、公告推送、版本管理等功能，并内置管理后台。

前端 PWA 基于 [mercutiojohn/hht-web](https://github.com/mercutiojohn/hht-web) 二次开发。本项目是独立的非官方项目，与西交利物浦大学、苏州独墅湖科教发展有限公司及慧湖通运营方不存在隶属、授权、合作或背书关系。

## 公共演示实例

[https://huihutong.xjtlu.uk](https://huihutong.xjtlu.uk)

该地址仅作为尽力而为的公共演示实例，不构成可用性或服务等级承诺。实例可能因上游接口变化、维护成本或其他原因随时限流、暂停或关闭，也不保证与仓库最新代码一致。请勿将其作为关键服务依赖，或依赖其长期保存数据。

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)）
- **部署**：Docker

## 自行部署

> [!CAUTION]
> 自行部署者需要独立评估代码、安全性、上游 API 合规性和数据保护要求，并自行承担维护责任。现有部署脚本主要服务于原项目环境，不是通用的一键部署方案。

### 1. 克隆仓库

```bash
git clone https://github.com/GeniusLv2006/hht-lite.git
cd hht-lite
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

脚本默认监听 `172.17.0.1:3100`，并假定存在与原部署环境一致的 Docker 网络和反向代理。管理后台 Cookie 要求 HTTPS；用于其他环境前请审查并调整脚本、挂载路径、监听地址和反向代理配置。

## 环境变量

参见 [`.env.example`](.env.example)，关键变量：

| 变量 | 说明 | 必填 |
|------|------|------|
| `ADMIN_OPENID` | 管理员微信小程序慧湖通 OpenID | 是 |
| `INIT_ADMIN_PASSWORD` | 首次启动时创建管理员账户的密码 | 首次部署时需要 |
| `INIT_ADMIN_USER` | 管理员用户名（默认 `admin`） | 否 |
| `ALLOWED_ORIGINS` | 允许的前端域名，逗号分隔 | 否 |

## 支持与安全

本项目不再主动修复 Bug、安全问题或上游 API 兼容性问题，也不保证审查或合并外部贡献。请先阅读 [SECURITY.md](SECURITY.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。请勿在公开 Issue 中披露未修复漏洞、凭据、OpenID、访问日志或其他敏感信息。

## 许可证

自 `v4.4.3` 起，本项目原创代码采用 [Mozilla Public License 2.0](LICENSE) 发布。此前已经按 MIT License 获得副本的使用者，其既有权利不受影响。

项目包含源自 [`mercutiojohn/hht-web`](https://github.com/mercutiojohn/hht-web) 的 MIT 许可代码及其他第三方组件；其各自许可证继续适用，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
