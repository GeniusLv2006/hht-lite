# hht-web 维护手册

## 环境信息

| 项目 | 值 |
|------|-----|
| 服务器 | DMIT VPS（SSH 别名：`dmit`） |
| 远程路径 | `/root/hht-web` |
| 服务进程 | Docker 容器 `hht-web`（端口 3100） |
| 数据库 | `data/hht.db`（SQLite，bind mount，不入 Git） |
| 本地路径 | `/Users/tingkailyu/VPS/DMIT/hht-web` |

---

## 发布新版本（当前流程）

只需修改一个文件：**`version.json`**

```json
{
  "version": "v3.x.x",
  "date": "YYYY-MM-DD",
  "changes": ["更新内容1", "更新内容2"]
}
```

然后运行：

```bash
# 同步 service-worker.js 的 CACHE_NAME
npm run sync-version

# 部署（重建镜像 + 替换容器）
ssh dmit "cd /root/hht-web && ./deploy.sh"
```

**不再需要**手动改 service-worker.js、index.html 或数据库：
- `server.js` 启动时自动将 version.json 内容 UPSERT 到 DB
- `index.html` 页面加载后由 JS 从 `/api/version` 动态填充版本号
- `scripts/sync-version.js` 负责更新 service-worker.js 的 CACHE_NAME

---

## 文件同步（当前方式：VS Code SFTP）

使用 VS Code SFTP 扩展（配置见 `.vscode/sftp.json`）：

- **保存时自动上传**：`uploadOnSave: true`，编辑文件保存后自动推送到服务器
- **全量同步**：VS Code 命令面板 → `SFTP: Sync Local -> Remote`

> **后续可接入 GitHub**，用 `git pull` 替代 SFTP，见下方说明。

---

## 接入 GitHub（推荐的下一步）

```bash
# 1. 在 GitHub 创建私有仓库 hht-web，然后本地：
git remote add origin git@github.com:<你的用户名>/hht-web.git
git push -u origin main

# 2. VPS 初始化（只需一次）：
ssh dmit "cd /root/hht-web && git init && git remote add origin git@github.com:<你的用户名>/hht-web.git && git pull origin main"

# 3. 之后的发布流程：
#   本地修改 → git commit → git push
#   ssh dmit "cd /root/hht-web && git pull && ./deploy.sh"
```

---

## 镜像版本与回滚

`deploy.sh` 现在同时打两个 tag：`hht-app:v3.x.x` 和 `hht-app:latest`，自动保留最近 3 个版本镜像。

回滚到上一版本：

```bash
ssh dmit
docker stop hht-web && docker rm hht-web
docker run -d --name hht-web --restart unless-stopped \
  -p 172.17.0.1:3100:3100 \
  -v /root/hht-web/data:/app/data \
  -v /root/hht-web/public:/app/public:ro \
  -v /root/hht-web/admin:/app/admin:ro \
  hht-app:v3.6.10   # ← 替换为目标版本
```

---

## 常用运维命令

```bash
# 查看当前版本（从 API，比查 DB 更直接）
curl -s https://huihutong.xjtlu.uk/api/version | python3 -m json.tool

# 查看容器状态
ssh dmit "docker ps --filter name=hht-web"

# 查看容器日志
ssh dmit "docker logs hht-web --tail 50"

# 查看现有镜像版本
ssh dmit "docker images hht-app"

# 连接服务器直接操作 DB
ssh dmit "sqlite3 /root/hht-web/data/hht.db"
```

---

## 注意事项

- `data/` 目录不在 Git 中（含数据库、JWT 密钥），只存在于 VPS
- `node_modules/` 不入 Git，镜像构建时由 `npm ci` 安装
- 删除文件后，如使用 SFTP 需执行「Sync Local -> Remote」；使用 Git 则 `git pull` 会自动删除
