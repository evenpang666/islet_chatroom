# 配置与开发

[返回项目首页](../README.md) · [全部文档](README.md)

## 启动器的工作方式

启动器检查 Node.js ≥24.5、npm、DSH ≥0.2.0-rc.2 和 pnpm，优先复用符合要求的版本。缺失或版本过低时，安装经过 SHA-256 校验的官方 Node 24 LTS、本项目私有 pnpm 或共享 DSH 运行时，不卸载或降级全局环境。首次安装需要网络；Linux 自动安装还依赖系统已有的 curl/wget、tar 和 SHA-256 工具。

本目录以 `link:` 注册到 DSH 的 `web` profile。已有 DSH Web 时尝试接入、复用；未运行则启动宿主，同时加载已注册的其他插件。无法热加载时会提示重启原服务，不创建第二个 DSH Web。首次使用需在宿主中配置可用模型和凭据。

**复用服务不等于刷新全部后台代码。** 网页刷新可以更新前端，后台 ESM 模块可能仍被缓存。升级后新功能未生效时，重启 DSH Web；访问 `/api/health` 中的 `version` 可确认已加载版本。

## Linux 启动

双击 `start.sh` 并选择在终端运行，或使用 `Islet.desktop`。桌面环境需要时，将文件标为可执行并信任启动器：

```sh
chmod +x start.sh Islet.desktop
```

也可从终端运行：

```sh
sh start.sh
```

## 地址与局域网

- 独立页面默认位于 `http://127.0.0.1:3104/`，同时通过 DSH Web 的 `/chatroom/` 提供访问。
- 独立页面监听 `0.0.0.0`。自动优先选择物理以太网 IPv4，其次 Wi-Fi，排除虚拟网卡和 VPN。
- 设置页提供实际局域网地址。端口冲突时自动选择空闲端口，以启动日志或设置页为准。
- Windows 防火墙应允许 Node.js 的**专用网络**访问；Linux 防火墙需放行实际端口。其他设备应与电脑在同一网段，且电脑和服务持续运行。

这是供信任的局域网共同使用的应用，没有账户系统。同网段访问者可以参与、导出和管理群聊；服务器拒绝异源请求、伪造 Host 和网段外客户端。不要通过公网端口映射开放。上限为 40 个实时连接、每群 10000 条消息。

## 环境变量

在启动前设置环境变量；后台配置变更后重启服务。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `CHATROOM_PORT` | `3104` | 独立页面端口 |
| `CHATROOM_DATA_DIR` | 项目内 `.local` | 数据目录 |
| `DSH_HOME` | `~/.dsh` | 共享 DSH 配置与运行时 |
| `DSH_WEB_PORT` | `3080` | 新启动 DSH Web 的首选端口 |
| `DSH_BIN` | 自动查找 | 指定 DSH CLI 文件 |
| `CHATROOM_TOKEN_PRICES` | 内置 DeepSeek 官方路由估价 | [自定义模型单价 JSON](usage-costs.md#自定义单价) |

## 开发命令

项目没有前端框架、构建步骤或运行时 npm 依赖。

```sh
npm start          # 正式启动，检查环境并接入 DSH
npm run dev        # 仅预览界面，不生成 AI 回复
npm test           # 自动化测试
npm run check      # JavaScript / ESM 语法检查
```

打开或复用 DSH 配置页面：

```sh
node scripts/environment.mjs --dsh web
```

调用当前运行时的 DSH CLI：

```sh
node scripts/environment.mjs --dsh --help
```

测试覆盖范围和平台实测限制见[验证记录](verification.md)。

## 提交前的文件检查

本地聊天、生成的角色 Skill 和运行时放在 `.local/`、`.runtime/`，DSH 凭据保留在宿主配置中。使用自定义数据目录时，优先放在 `.local/` 内；放到其他目录需补充忽略规则。

`.gitignore` 排除环境变量、认证配置、私钥、数据库、依赖、缓存和测试产物；保留 `.env.example` / `.env.sample` / `.env.template` 模板、项目源码、预设 Skill、文档截图和依赖锁文件。模板只能包含占位符，不能放真实 Token。

提交前检查暂存区。`.gitignore` 不会自动移除已跟踪文件，也不会清理提交历史；如果密钥曾被提交，先撤销或轮换，再处理文件与历史，不能仅依赖新增忽略规则。
