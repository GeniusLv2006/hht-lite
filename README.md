# hht-lite

> [!WARNING]
> **项目已停止主动维护，但仓库暂不归档。** 代码按现状提供，不承诺兼容性、安全更新、问题响应或后续版本。欢迎自行部署或 Fork；Issue 和 Pull Request 可能不会得到处理。

慧湖通（HuiHuTong）的非官方 PWA 前端与后端服务，提供二维码相关功能、黑名单检测、访问日志、公告推送、版本管理和管理后台。

本项目与西交利物浦大学、苏州独墅湖科教发展有限公司及慧湖通运营方不存在隶属、授权、合作或背书关系。

本仓库适合作为参考项目、自行维护的私有部署或 Fork 基础。如果你需要持续的安全更新、兼容性维护或技术支持，请不要直接依赖本项目。

## 功能概览

- 面向用户的 PWA 前端
- 慧湖通二维码相关功能
- 黑名单、公告和版本管理
- 访问日志与管理后台
- SQLite 本地数据存储
- Docker Compose 部署和容器健康检查

## 公共演示实例

[https://huihutong.xjtlu.uk](https://huihutong.xjtlu.uk)

该地址仅作为尽力而为的公共演示实例，不构成可用性或服务等级承诺。实例可能因上游接口变化、维护成本或其他原因随时限流、暂停或关闭，也不保证与仓库最新代码一致。请勿将其作为关键服务依赖，或依赖其长期保存数据。

## 技术栈

- **后端**：Node.js + Express
- **数据库**：SQLite（[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)）
- **部署**：Docker Compose
- **运行时**：Node.js 24 LTS

## 部署前须知

> [!CAUTION]
> 自行部署者需要独立评估代码、安全性、上游 API 合规性和数据保护要求，并自行承担维护责任。管理后台依赖 Secure Cookie，生产部署必须通过 HTTPS 反向代理访问。

建议准备：

- 一台能够运行 Docker 的 Linux 服务器
- Docker Engine 和 Docker Compose 插件（使用 `docker compose` 命令）
- 一个已经指向服务器的域名
- Caddy、Nginx 或其他能够提供 HTTPS 的反向代理
- 使用终端、编辑文本文件和管理 DNS 的基础能力

> [!NOTE]
> 本项目所说的“自行部署”，不是在托管平台点击一次 Deploy，也不是看到 `npm run dev` 成功启动就算完成。部署者需要实际理解并负责环境变量、Docker、HTTPS 反向代理、持久化数据、备份恢复、健康检查、日志和故障回滚。
>
> “以后会研究一下部署”不会让一个正在运行的服务得到维护。如果你目前还不具备这些能力，请先在隔离环境完整走通本文档，而不是默认原作者会继续承担部署后的排障与兜底工作。
>
> 软件能够运行，并不意味着维护它所需的时间、知识和责任会自动产生；使用一个项目，也不等于有人理所当然地欠你持续维护。

仓库默认只把服务绑定到 `127.0.0.1:3100`，因此不能直接从公网访问。这是为了让 Caddy 或 Nginx 在同一台服务器上安全地代理请求，而不是配置错误。

仓库内置的服务说明与使用协议仅适用于项目维护者运营的 `huihutong.xjtlu.uk` 公共演示实例，不会自动适用于第三方实例。若向他人提供自行部署的服务，请在上线前修改 `public/index.html` 中的协议，按实际情况说明运营者、访问域名、数据处理与保留期限、第三方服务及联系方式，并自行确认适用的合规要求。

## 使用 Docker Compose 部署

以下步骤是普通自行部署者的推荐路径。仓库维护者使用的版本化部署脚本见[维护者部署与回滚](#维护者部署与回滚)。

### 1. 检查 Docker

```bash
docker --version
docker compose version
```

两个命令都应正常输出版本号。如果命令不存在，请先按照 Docker 官方文档为你的 Linux 发行版安装 Docker Engine 和 Compose 插件。

### 2. 克隆仓库

```bash
git clone https://github.com/GeniusLv2006/hht-lite.git
cd hht-lite
```

### 3. 创建配置文件

```bash
cp .env.example .env
```

用你熟悉的编辑器打开 `.env`，至少修改以下两项：

```dotenv
INIT_ADMIN_PASSWORD=请替换为足够长且唯一的密码
ALLOWED_ORIGINS=https://hht.example.com
```

将 `hht.example.com` 替换为你的真实域名。`ALLOWED_ORIGINS` 必须是浏览器最终访问的 HTTPS Origin：只包含协议、域名和可选端口，不包含路径，也不添加末尾斜杠。

```text
正确：https://hht.example.com
错误：http://hht.example.com
错误：https://hht.example.com/
错误：https://hht.example.com/admin
```

> [!IMPORTANT]
> `INIT_ADMIN_PASSWORD` 只在数据库中还没有管理员时用于创建第一个账户。管理员成功创建后，可以从 `.env` 中删除该密码并重新启动容器；已经创建的账户不会因此消失。

### 4. 构建并启动容器

```bash
docker compose up -d --build
docker compose ps
```

首次构建需要下载基础镜像和 npm 依赖，可能需要几分钟。`docker compose ps` 最终应显示 `hht-lite` 容器正在运行并处于 `healthy` 状态。

Compose 构建的镜像包含前端、管理后台和服务端代码，只有本地 `./data` 目录需要持久化。

### 5. 在服务器本机验证

```bash
curl --fail http://127.0.0.1:3100/healthz
docker compose logs --tail=50 hht-lite
```

健康检查成功时会返回类似内容：

```json
{"status":"ok","version":"v6.0.0"}
```

版本号可能随仓库版本变化。`GET /healthz` 会验证进程和 SQLite 是否可用；数据库不可用时返回 HTTP 503。该端点不包含内存、凭据或其他敏感运行信息。

如果本机健康检查失败，先不要配置域名或反向代理，请参见[常见问题](#常见问题)。

### 6. 配置 HTTPS 反向代理

以下示例假设你的域名是 `hht.example.com`，应用仍监听默认的 `127.0.0.1:3100`。请先确保域名的 DNS 记录已经指向服务器，并开放 80 和 443 端口。

#### Caddy 示例

Caddy 可以自动申请和续期 HTTPS 证书。将以下内容加入 Caddyfile：

```caddyfile
hht.example.com {
    reverse_proxy 127.0.0.1:3100
}
```

保存后检查并重新加载 Caddy 配置。具体命令取决于你的安装方式。

#### Nginx 示例

如果使用 Nginx，可以将已经配置证书的 HTTPS 虚拟主机代理到：

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

该片段不包含证书申请和完整的 Nginx 虚拟主机配置。请使用 Certbot、托管面板或你现有的证书管理方案完成 HTTPS。

> [!WARNING]
> 不要通过把 `HHT_BIND_HOST` 改成 `0.0.0.0` 并直接开放 3100 端口来替代 HTTPS。HTTP 下管理后台的 Secure Cookie 无法正常工作。

### 7. 首次访问和登录

反向代理生效后，验证以下地址：

- 前台：`https://hht.example.com/`
- 管理后台：`https://hht.example.com/admin/`
- 健康检查：`https://hht.example.com/healthz`
- 版本信息：`https://hht.example.com/api/version`

使用 `.env` 中的 `INIT_ADMIN_USER`（默认 `admin`）和首次启动时设置的 `INIT_ADMIN_PASSWORD` 登录管理后台。

如果使用 Cloudflare 等 CDN，请确认安全规则不会对 `/admin/` 或应用 API 持续发起交互式挑战，否则后台页面或请求可能无法正常工作。

## 环境变量

完整示例和注释参见 [`.env.example`](.env.example)。

| 变量 | 默认值或示例 | 说明 | 必填 |
|------|--------------|------|------|
| `ADMIN_OPENID` | 空 | 管理员微信小程序慧湖通 OpenID，用于离线授权缓存 | 否 |
| `INIT_ADMIN_PASSWORD` | 无 | 首次启动时创建管理员账户的密码 | 首次部署时需要 |
| `INIT_ADMIN_USER` | `admin` | 首次创建的管理员用户名 | 否 |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥；默认生成到 `data/.jwt_secret` | 否 |
| `LOG_RETENTION_DAYS` | `30` | 访问日志保留天数，允许范围为 1–3650 | 否 |
| `ALLOWED_ORIGINS` | `https://hht.example.com` | 允许访问管理 API 的 HTTPS Origin，多个值用英文逗号分隔 | 是 |
| `HHT_BIND_HOST` | `127.0.0.1` | Compose 发布端口的绑定地址 | 否 |
| `HHT_HOST_PORT` | `3100` | Compose 发布到主机的端口 | 否 |
| `HHT_IMAGE_TAG` | `local` | 本地构建的镜像标签 | 否 |

修改 `.env` 后，重新创建容器使配置生效：

```bash
docker compose up -d
```

## 数据、备份与恢复

`data` 目录包含 SQLite 数据库、自动生成的 JWT 签名密钥、管理员账户、黑名单、公告和访问日志，应视为敏感数据并妥善保管。

### 创建一致性备份

最简单可靠的方法是在短暂停机期间复制整个目录：

```bash
docker compose down
tar -czf "hht-lite-data-$(date +%Y%m%d-%H%M%S).tar.gz" data/
docker compose up -d
```

将备份文件保存到安全位置，不要提交到 Git 或放在公开下载目录。

### 恢复备份

恢复前先保留当前数据，再解压备份：

```bash
docker compose down
mv data "data.before-restore-$(date +%Y%m%d-%H%M%S)"
tar -xzf hht-lite-data-YYYYMMDD-HHMMSS.tar.gz
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3100/healthz
```

确认恢复成功后，再决定是否删除旧数据目录。不要在没有可用备份的情况下删除 `data`。

## 升级普通自行部署实例

升级前先阅读目标版本的发布说明并备份 `data`，然后执行：

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3100/healthz
docker compose logs --tail=50 hht-lite
```

如果升级后出现问题，停止容器并恢复升级前的数据和代码。由于项目已停止主动维护，不应假设所有未来依赖或上游 API 变化都能保持兼容。

## 停止或卸载

停止并删除容器，但保留数据和本地镜像：

```bash
docker compose down
```

再次运行 `docker compose up -d` 即可使用原有数据启动。

> [!CAUTION]
> 不要使用 `docker compose down -v`，也不要在未备份的情况下删除 `data` 目录。虽然当前 Compose 使用的是目录挂载而不是命名卷，养成保留持久化数据的习惯可以避免误操作。

## 维护者部署与回滚

仓库维护者可以使用 `./deploy.sh` 构建并部署 `package.json` 中声明的精确版本镜像。脚本要求源码位于干净的 `main`、`HEAD` 与本地 `origin/main` 一致，并会：

1. 构建带版本和 Git 元数据的自包含镜像。
2. 使用临时数据启动候选容器并等待健康检查。
3. 候选健康后保留当前容器并切换正式容器。
4. 使用生产数据再次检查健康状态和版本端点。
5. 新容器验证失败时自动恢复原容器。

```bash
./deploy.sh
```

重新部署本机已有、经过验证的自包含镜像：

```bash
./deploy.sh --image vMAJOR.MINOR.PATCH
```

镜像回滚只支持 `v5.1.0` 或更新版本。更早的镜像依赖宿主机挂载的静态资源，不是完整的回滚单元。完整流程参见[维护指南](docs/maintenance.md)和[发布规则](docs/releasing.md)。

## 常见问题

### 容器没有进入 `healthy` 状态

```bash
docker compose ps
docker compose logs --tail=100 hht-lite
```

重点检查 `.env` 是否存在、`ALLOWED_ORIGINS` 是否为合法 HTTPS Origin，以及 `data` 目录是否可写。

### 出现 `ALLOWED_ORIGINS is required in production`

生产镜像不接受空的来源配置。编辑 `.env` 并设置真实 HTTPS Origin，然后运行：

```bash
docker compose up -d
```

### 管理后台可以打开，但无法登录

依次确认：

1. 浏览器正在使用 HTTPS，而不是服务器 IP 或 HTTP 地址。
2. 当前地址与 `ALLOWED_ORIGINS` 完全一致。
3. `.env` 在首次启动前设置了非空的 `INIT_ADMIN_PASSWORD`。
4. 反向代理传递了 `Host` 和 `X-Forwarded-Proto`。
5. Cloudflare 或其他安全产品没有拦截 `/admin/` 和 `/api/admin/*`。

如果数据库中已经存在管理员，修改 `INIT_ADMIN_PASSWORD` 不会重置密码。项目目前没有命令行密码重置工具；恢复前请先备份 `data`，再自行维护数据库或从可用备份恢复。

### 从其他电脑无法访问 3100 端口

默认只监听 `127.0.0.1`，这是正常的安全设置。请配置 HTTPS 反向代理并通过域名访问，不要直接把应用端口暴露到公网。

### 域名返回 502

先在服务器本机运行：

```bash
curl --fail http://127.0.0.1:3100/healthz
```

如果本机请求失败，检查容器日志；如果本机成功但域名失败，检查反向代理上游地址、DNS、证书和防火墙设置。

### 页面可以打开，但业务功能不可用

本项目依赖外部慧湖通 API。上游接口、认证机制、网络策略或用户协议发生变化时，即使容器和 `/healthz` 正常，具体业务功能仍可能失效。项目已停止主动维护，此类兼容性问题可能不会得到修复。

## 写在最后

hht-lite 始于一个很简单的想法：用自己能够做到的方式，解决身边真实存在的问题。它后来被实际使用，也因此从一个小工具逐渐变成了需要持续投入时间、知识和责任的项目。

在这个过程中，我更加清楚地认识到，一个项目能够长期存在，依靠的不只是代码，也需要真实的反馈、对维护工作的尊重，以及愿意共同承担责任的人。当这些条件不足以支撑继续投入时，选择结束同样是一种负责任的决定。

`v6.0.0` 是 hht-lite 的最终版本。我没有选择让它悄无声息地停在某个未完成的状态，而是在结束前重新整理了代码、部署流程、文档、来源边界和许可证，希望它至少能够以一个清晰、完整且可供后来者理解的状态留存下来。

感谢那些认真使用过它、提供过真实反馈，或曾经对这份工作表达过认可的人。

## 支持与安全

本项目不再主动修复 Bug、安全问题或上游 API 兼容性问题，也不保证审查或合并外部贡献。请先阅读 [SECURITY.md](SECURITY.md) 和 [CONTRIBUTING.md](CONTRIBUTING.md)。请勿在公开 Issue 中披露未修复漏洞、凭据、OpenID、访问日志或其他敏感信息。

更多维护、发布与来源审计资料见[文档索引](docs/README.md)。

## 许可证

自 `v4.4.3` 起，本项目原创代码采用 [Mozilla Public License 2.0](LICENSE) 发布。此前已经按 MIT License 获得副本的使用者，其既有权利不受影响。

`v6.0.0` 建立了独立实现的代码与资产基线，审计范围和方法见[来源审计](docs/provenance.md)。历史版本和提交继续适用其发布时的许可证状态。

第三方组件继续适用其各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

源码文件使用 SPDX 标识，不能直接添加注释的文件由 `REUSE.toml` 或相邻 `.license` 文件声明。仓库符合 [REUSE Specification 3.3](https://reuse.software/spec/)；可使用 `pipx run --spec 'reuse[charset-normalizer]==6.2.0' reuse lint` 验证。
