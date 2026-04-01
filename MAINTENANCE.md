# hht-web 维护手册

## 环境信息

| 项目 | 值 |
|------|-----|
| 服务器 | DMIT VPS（SSH 别名：`dmit`） |
| 远程路径 | `/root/hht-web` |
| 服务进程 | `node server.js`（端口 3100） |
| 数据库 | `data/hht.db`（SQLite） |
| 本地路径 | `/Users/tingkailyu/VPS/DMIT/hht-web` |

---

## 文件同步

使用 VS Code SFTP 扩展（配置见 `.vscode/sftp.json`）：

- **保存时自动上传**：`uploadOnSave: true`，编辑文件保存后自动推送到服务器
- **全量同步**（含删除远程多余文件）：VS Code 命令面板 → `SFTP: Sync Local -> Remote`
  - 已配置 `syncOption.delete: true`，会删除远程有但本地没有的文件
- **注意**：直接用命令行（如 `sed`、`bash` 脚本）修改本地文件不会触发自动上传，需手动同步

---

## 发布新版本

每次发版需要同时修改以下三处，缺一不可：

### 1. `public/service-worker.js`
```js
const CACHE_NAME = 'offline-cache-v3.x.x'; // 改为新版本号
```
**原因**：CACHE_NAME 变化才能让浏览器检测到新 SW，触发自动刷新。不改的话只有 ETag 检测作为备用，不可靠。

### 2. `public/index.html`
PWA 更新提示中的版本号（如有展示）。

### 3. 数据库版本信息
通过 SSH 连接服务器更新：
```bash
ssh dmit
sqlite3 ~/hht-web/data/hht.db
```
```sql
UPDATE version_info
SET version = 'v3.x.x',
    release_date = 'YYYY-MM-DD',
    changes = '["更新内容1", "更新内容2"]'
WHERE id = 1;
```

---

## 常用运维命令

```bash
# 连接服务器
ssh dmit

# 查看当前版本
sqlite3 ~/hht-web/data/hht.db "SELECT version, release_date FROM version_info;"

# 查看服务进程
ps aux | grep node

# 查看服务器文件
ls ~/hht-web/public/
ls ~/hht-web/data/
```

---

## 注意事项

- **不要**在 `data/` 目录下放无用的数据库文件（如 `app.db`），服务器只使用 `hht.db`
- **不要**在 `public/` 目录下留临时文件（如 `*.tmp.*`）或备份图片
- 删除本地文件后记得执行一次「Sync Local -> Remote」，否则服务器上的文件不会被删除
- 数据库文件（`hht.db`、`hht.db-shm`、`hht.db-wal`）不需要手动同步，直接在服务器上操作
