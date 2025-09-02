# IPTV M3U 应用部署指南

本文档提供了将 IPTV M3U 应用部署到 Cloudflare Workers 的详细步骤。

## 前提条件

1. 一个 Cloudflare 账户
2. 安装了 Node.js 和 npm
3. 安装了 Wrangler CLI 工具

## 安装 Wrangler CLI

如果你还没有安装 Wrangler CLI，可以通过以下命令安装：

```bash
npm install -g wrangler
```

## 登录 Cloudflare 账户

### 方法一：OAuth 登录（标准方法）

使用以下命令通过 OAuth 登录你的 Cloudflare 账户：

```bash
wrangler login
```

按照提示完成登录过程。系统会在浏览器中打开 Cloudflare 登录页面。

### 方法二：使用 API 令牌（替代方法）

如果 OAuth 登录出现问题（如浏览器无法打开或显示错误），可以使用 API 令牌方法：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 "My Profile" > "API Tokens"
3. 创建一个新的 API 令牌，选择 "Edit Cloudflare Workers" 模板
4. 复制生成的令牌
5. 在终端中设置环境变量：

```bash
# Windows (CMD)
set CLOUDFLARE_API_TOKEN=你的API令牌

# Windows (PowerShell)
$env:CLOUDFLARE_API_TOKEN="你的API令牌"

# macOS/Linux
export CLOUDFLARE_API_TOKEN="你的API令牌"
```

现在你可以使用 Wrangler 命令而无需再次登录。

### 方法三：直接通过 Cloudflare Dashboard 部署

如果你仍然无法使用 Wrangler 登录，可以直接通过 Cloudflare Dashboard 部署：

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 "Workers & Pages" > "Create application"
3. 选择 "Create Worker"
4. 在编辑器中粘贴 `_worker.js` 的内容
5. 点击 "Save and Deploy"

注意：此方法无法直接使用 D1 数据库，你需要在 Dashboard 中手动创建数据库并更新配置。

## 创建 D1 数据库

1. 使用以下命令创建一个新的 D1 数据库：

```bash
wrangler d1 create iptv_config
```

2. 命令执行后，你将获得一个数据库 ID。将这个 ID 复制到 `wrangler.toml` 文件中的 `database_id` 字段：

```toml
[[ d1_databases ]]
name = "DB"
database_id = "你的数据库ID"
```

## 初始化数据库

1. 使用以下命令应用数据库模式：

```bash
wrangler d1 execute iptv_config --file=./schema.sql
```

2. 或者，你也可以使用迁移脚本初始化数据库：

```bash
node migrate.js
```

## 本地开发和测试

使用以下命令在本地运行应用进行测试：

```bash
wrangler dev
```

这将启动一个本地开发服务器，你可以通过浏览器访问 `http://localhost:8787` 来测试应用。

## 部署到 Cloudflare Workers

当你准备好部署应用时，使用以下命令：

```bash
wrangler deploy
```

部署完成后，你将获得一个 `*.workers.dev` 域名，可以通过该域名访问你的应用。

## 自定义域名（可选）

如果你想使用自定义域名，可以在 Cloudflare 控制面板中进行设置：

1. 登录 Cloudflare 控制面板
2. 选择你的域名
3. 进入 "Workers Routes" 部分
4. 添加一个新的路由，将你的域名指向你的 Worker

## 更新应用

当你需要更新应用时，只需修改代码并再次运行 `wrangler deploy` 命令即可。

## 数据库迁移

如果你需要更新数据库结构，可以修改 `schema.sql` 文件，然后使用以下命令应用更改：

```bash
wrangler d1 execute iptv_config --file=./schema.sql
```

## 故障排除

### 数据库连接问题

如果遇到数据库连接问题，请检查 `wrangler.toml` 文件中的数据库配置是否正确。

### 部署失败

如果部署失败，请检查 Wrangler 的错误消息，确保你的代码没有语法错误，并且 `wrangler.toml` 文件配置正确。

### Wrangler 登录问题

如果在执行 `wrangler login` 时遇到以下错误：

```
⛅️ wrangler 4.33.1 
─────────────────── 
Attempting to login via OAuth... 
Opening a link in your default browser: `https://dash.cloudflare.com/oauth2/auth?...`
▲ [WARNING] Failed to open
```

可能的解决方案：

1. **手动复制链接**：复制终端中显示的链接，手动在浏览器中打开。

2. **使用 API 令牌**：按照上述「方法二：使用 API 令牌」的步骤设置 API 令牌。

3. **检查防火墙设置**：确保你的防火墙没有阻止 Wrangler 打开浏览器。

4. **更新 Wrangler**：尝试更新到最新版本的 Wrangler：
   ```bash
   npm install -g wrangler@latest
   ```

5. **使用 Dashboard 部署**：如果以上方法都不起作用，考虑使用 Cloudflare Dashboard 直接部署，如「方法三」所述。

### 运行时错误：Cannot read properties of undefined (reading 'fetch')

如果你在本地开发或部署后遇到以下错误：

```
TypeError: Cannot read properties of undefined (reading 'fetch')
    at Object.fetch (file:///path/to/_worker.js:603:23)
```

这是因为 `env.ASSETS` 绑定未定义。解决方案：

1. **确保 wrangler.toml 配置正确**：检查你的 `wrangler.toml` 文件是否包含以下配置：

   ```toml
   [site]
   bucket = "./" # 静态资源目录
   ```

2. **修改 _worker.js 添加错误处理**：在 `_worker.js` 文件中添加对 `env.ASSETS` 不存在的处理：

   ```js
   // 如果ASSETS绑定不存在，返回404响应
   if (!env.ASSETS) {
     return new Response('Not found', { status: 404 });
   }
   return env.ASSETS.fetch(request);
   ```

3. **重新部署**：修改后重新运行 `wrangler deploy` 命令部署应用。

### 权限问题

如果遇到权限问题，请确保你已经正确登录到 Cloudflare 账户，并且有足够的权限来部署 Workers 和创建 D1 数据库。

## 其他资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)