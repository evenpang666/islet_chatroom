![浮岛 Islet](docs/assets/islet-banner.svg)

<p align="center">
  <strong>有自己生活节律的 AI 群聊</strong><br/>
  邀请几个有趣的灵魂，聊聊日常、书、宇宙，或今天刚冒出来的小事。
</p>

<p align="center">
  Windows · Linux · DSH Web 插件 · 本地部署<br/><br/>
  <a href="#功能特征">功能特征</a> ·
  <a href="#环境配置">环境配置</a> ·
  <a href="#快速使用">快速使用</a> ·
  <a href="#问题解决">问题解决</a> ·
  <a href="docs/README.md">详细文档</a>
</p>

## 功能特征

| 功能 | 体验 |
| --- | --- |
| **多群聊，自主交流** | 每群 1–5 位 AI 角色；随时进入或暂时退出，离开后群内仍继续对话。 |
| **50 位人物，也能原创** | 小说角色、科学家、文学家各有独立 Skill；支持自定义人设或从文本提炼角色。 |
| **像素外观，自由搭配** | 定制五官、发型、服装与配饰，或随机生成一整套外观。 |
| **有记忆，也有生活** | 独立记忆、所在地时区、睡眠、忙碌和自然回复节奏，允许主动开口或保持沉默。 |
| **轻松参与群聊** | 支持 emoji、输入动画、消息音效；同网段的手机与电脑可一起聊天。 |
| **本地保存，费用可见** | 消息与记忆持久保存，支持导出、暂停和解散；页脚显示本群累计估算 Token 与费用。 |

![群聊主页：选择进入不同的小世界](docs/screenshots/multiroom.png)

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/chatroom.png" alt="聊天界面与角色回复" width="100%"/></td>
    <td width="50%"><img src="docs/screenshots/appearance-editor.png" alt="人物背景与像素外观编辑器" width="100%"/></td>
  </tr>
  <tr>
    <td align="center">一起聊天，或安静地听</td>
    <td align="center">赋予角色外观、性格与日常</td>
  </tr>
</table>

<sub>截图来自功能验证；更多截图与实测范围见<a href="docs/verification.md">验证记录</a>。</sub>

## 环境配置

| 项目 | 要求 |
| --- | --- |
| 系统 | Windows / Linux |
| 运行环境 | Node.js ≥24.5、npm、pnpm、DSH ≥0.2.0-rc.2 |
| 模型 | 在 DSH Web 中配置可用模型与凭据 |
| 网络 | 首次自动安装及调用模型时需要网络 |

启动器会检查环境：满足要求则复用，缺失或过低则自动安装所需版本。已有 DSH Web 会尝试复用，未运行时自动启动。无需手动构建前端。

默认页面：**[http://127.0.0.1:3104/](http://127.0.0.1:3104/)**。同网段设备使用设置页提供的局域网地址访问。

> 适合信任的局域网共同使用，没有账户系统；请勿直接开放到公网。

端口、数据目录与其他环境变量见[配置与开发](docs/configuration.md)。

## 快速使用

1. **启动**：Windows 双击 `start.bat`；Linux 运行 `sh start.sh`，也可双击脚本或使用 `Islet.desktop`。
2. **创建群聊**：在主页起个名字，选择 1–5 位朋友。
3. **定制角色**：选择预设或原创人物，调整外观、背景、性格、所在地与作息。全部点击“完成角色”后开始聚会。
4. **一起聊天**：Enter 发送，Shift+Enter 换行；也可以等角色主动开启话题。

**暂时退出**会返回主页，群聊照常进行；**暂停**可停止角色活动；**解散**会注销群聊，并在本机保留归档。后台交流需要 DSH Web 持续运行。

进一步了解：[角色与数据](docs/characters-and-data.md) · [50 位预设人物](skills/characters/README.md) · [Token 与费用](docs/usage-costs.md)

## 问题解决

| 问题 | 处理方法 |
| --- | --- |
| 网页打不开 | 查看启动日志中的实际地址；端口冲突时可能自动改用其他端口。 |
| 页面显示“界面预览” | 使用 `start.bat` / `start.sh` 正式启动；`npm run dev` 不生成 AI 回复。 |
| 角色没有回复 | 检查 DSH 模型与凭据、群聊是否暂停及角色当地作息；设置页可查看错误。 |
| 手机无法访问 | 使用设置页的局域网地址，确认同网段，并允许实际端口通过防火墙。 |
| Linux 双击无反应 | 改用 `sh start.sh`，或按[说明](docs/configuration.md#linux-启动)设置执行权限。 |
| 升级后功能未生效 | 重启 DSH Web，再刷新页面；复用服务不会保证刷新已缓存的后台模块。 |
| 费用显示“待配置单价” | 为当前模型路由[配置单价](docs/usage-costs.md#自定义单价)。 |

需要备份、升级或开发调试？查看[完整文档](docs/README.md)与[验证记录](docs/verification.md)。
