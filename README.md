# Drawboard — 开源协作白板（Excalidraw 复刻增强版）

高性能、可扩展、以用户/组织为核心的协作白板。

## 架构（monorepo，`/packages`）

```
packages/
  web/                  Vite + React + TypeScript 前端
    src/canvas/         画布引擎（空间网格索引 + 视口剔除 + rAF 合并渲染）
    src/pages/          Login / Boards（组织切换）/ Board（编辑器）
    src/components/     Minimap / ReactionLayer / PluginsPanel / ThemePicker
  server/               Golang 后端（仅标准库，零外部依赖）
    cmd/server/         入口（REST + WS + 静态托管 + 市场目录）
    internal/auth/      PBKDF2 密码哈希 + HMAC-SHA256 JWT
    internal/store/     JSON 文件持久化（用户/组织/画板）
    internal/ws/        RFC 6455 WebSocket 实现
    internal/collab/    房间中枢：操作/光标/表情/在线状态广播
    internal/integrations/  集成注册表：内置 Go 集成 + zip 运行时插件
    marketplace/        在线市场插件包（zip）
  integrations/         内置集成，每个含 main.go 的 Inject() 声明
    manifest/           共享声明 schema
    aws-icons/          AWS 架构图标
    uml-shapes/         UML 图元（类/参与者/用例/包/注释/组件/生命线/组合片段）
    emoji-reactions/    表情反应
```

## 集成系统（灵活注入）

每个集成在 `/packages/integrations/{name}/main.go` 暴露 `Inject()`，
返回一个声明对象，声明自己注入应用哪些区域：

```go
func Inject() manifest.Declaration {
    return manifest.Declaration{
        Name: "my-pack",
        Draws:     []manifest.DrawDecl{...},     // → 注入工具箱/图形库
        Reactions: []manifest.ReactionDecl{...}, // → 注入反应栏
        Themes:    []manifest.ThemeDecl{...},    // → 注入主题选择器（含画布样式）
        Commands:  []manifest.CommandDecl{...},  // → 注入命令菜单
    }
}
```

- **Go 内置集成**：在 `cmd/server/main.go` 中注册到 `integrations.New(...)`。
- **运行时插件（zip / 市场）**：zip 内含 `manifest.json`（同一 schema）+
  可选 SVG 资源，上传或从市场一键安装后即时生效，无需重启。
- **双侧逻辑**：Go 侧 `Inject()` 声明注入什么；web 侧
  `packages/web/src/integrations/` 以同名注册行为处理器
  （`importers` / `onPlace` / `actions`），声明与行为自动按名字配对。
  例如 `uml-shapes` 在 web 侧提供 draw.io 导入器和自动布局命令，
  `aws-icons` 在放置图标时自动应用 AWS 品牌色。

## 性能设计

- 均匀网格空间索引：渲染与命中测试只触及视口内的元素，万级元素不卡顿
- rAF 合并渲染：无变化零开销，DPR 感知（上限 2x）
- 视口剔除 + 离屏元素不绘制；小地图复用同一渲染管线
- 协作采用按元素 last-write-wins 合并，弱网自动重连 + 发送缓冲

## 功能

- 工具：选择（空白处拖动即平移）/矩形/椭圆/菱形/线/箭头/自由画/文本/橡皮 + 集成图形
- 样式：描边/填充色板与自定义色、线宽、透明度、虚线、草图风（roughness）
- 主题：整体换肤（UI CSS 变量 + 画布背景/网格/默认调色/手绘程度）
- 协作：WebSocket 实时同步、远程光标、在线成员、表情反应（上浮动画）
- 组织：多组织、成员邀请、组织切换；画板链接分享（游客可协作）
- 移动端：触控绘制、双指缩放、自适应工具栏
- 快捷键：1–8/0（Excalidraw 布局）或 V/R/D/E/A/L/F/T/X，Ctrl+Z / Ctrl+Y，Delete，Esc

## 运行

### Docker Compose（Postgres + server + web）

```bash
make up      # 启动开发栈（postgres + air 热重载 server + vite dev web），访问 http://localhost:8080
make down    # 停止并移除容器（保留数据库卷）
make down-v  # 连数据库卷一起删除（数据丢失！）
make logs    # 跟踪日志
```

镜像名与 tag 可通过环境变量覆盖（供发布）：
`SERVER_IMAGE` / `SERVER_TAG` / `WEB_IMAGE` / `WEB_TAG` / `POSTGRES_PASSWORD` / `JWT_SECRET`。

### Helm（Kubernetes）

`charts/drawboard` 是可发布的 chart，web 与 server 的镜像仓库/tag 均可配置：

```bash
helm install drawboard ./charts/drawboard \
  --set server.image.repository=ghcr.io/you/drawboard-server \
  --set server.image.tag=v1.0.0 \
  --set web.image.repository=ghcr.io/you/drawboard-web \
  --set web.image.tag=v1.0.0
```

默认使用内置 bitnami Postgres 子 chart（`postgresql.enabled=true`）；
自带数据库则 `--set postgresql.enabled=false --set externalDatabase.url=postgres://…`。
发布 chart：`helm package charts/drawboard -d dist/`。

### 本地开发

```bash
cd packages/server && go run ./cmd/server          # 后端（默认 JSON 存储）
cd packages/web && npm install && npm run dev      # 前端（vite 代理到 :8080）
```

### 数据存储

- 设置 `DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable` → **Postgres**
  （启动自动建表，带连接重试等待数据库就绪）
- 未设置 → JSON 文件存储（零依赖本地模式）

环境变量：

- `ADDR`、`DATABASE_URL`、`DATA_DIR`、`WEB_DIR`（空 = 仅 API 模式）、`MARKETPLACE_DIR`、`JWT_SECRET`。
- **OAuth / SSO**：
  - `OAUTH_LOCAL_ENABLED`（默认 `true`）— 设为 `false` 时 `/api/auth/config` 仍保留本地注册/登录路由但会声明 `localEnabled: false`。
  - `OAUTH_REDIRECT_URL` — 全局回调地址模板，可包含 `{provider}` 占位符，例如 `https://draw.example.com/api/auth/{provider}/callback`；未设置时回退到 `http://localhost:8080/api/auth/{provider}/callback` 并打印警告。
  - 对每个提供商 `google`、`github`、`facebook`、`okta`：
    - `OAUTH_<PROVIDER>_ENABLED`（默认 `false`）— 只有设为 `true` 才会在 `/api/auth/config` 中列出。
    - `OAUTH_<PROVIDER>_CLIENT_ID`
    - `OAUTH_<PROVIDER>_CLIENT_SECRET`
    - `OAUTH_<PROVIDER>_REDIRECT_URL`（可选；留空则使用 `OAUTH_REDIRECT_URL`）
  - `OAUTH_OKTA_ISSUER` — Okta 启用时必填（例如 `https://your-org.okta.com`）。

## draw.io 导入

画板页顶栏「📥 Import」支持 `.drawio` / `.xml`（mxfile/mxGraphModel）：
矩形、圆角、椭圆、菱形（decision）、UML actor/note/package/component、
文本、边（自动转箭头/连线，含途经点）都会转换为原生元素并广播给协作者。
该导入器由 `uml-shapes` 集成的 **web 侧逻辑**（`packages/web/src/integrations/`）
提供——与 Go 侧 `Inject()` 声明同名匹配，二者共同构成一个完整集成。
