# liquid-glass — 适配 DSH 0.2.1-rc.3 桌面端的液态玻璃壁纸

这是 [`WYH66666666/DSH-Transparent-UI-Plugin`](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)（Aqua）的适配分支。

上游版本按 DSH `0.1.0-rc.5` 编写，装到当前桌面端（`0.2.1-rc.3`，profile `desktop`）会出问题：它依赖的 `settings.plugin.item` 这个 slot 在新版已被移除，布局的 DOM 钩子 `detailsCol` / `data-hero-headline` 也不再存在。与其逐行修补 4 万行 TypeScript，这里按新 API 重写了一个小得多的实现，只保留你真正要的东西：**苹果风的液态玻璃壁纸**。

## 效果

- **背景**：四团缓慢流动的低饱和色晕，配一层白色镜面扫光和细颗粒磨砂，清澈、偏蓝、不刺眼
- **玻璃**：侧边栏、主栏、右栏、底栏各自做 `backdrop-filter` 磨砂，白边高光让它们读起来像一片片抛过光的玻璃
- **鼠标光效**：跟随光标的高光池，边缘带一点点冷/暖色散，模拟真实玻璃的折射
- **悬浮面板**：输入框和对话框有完整的高光圈边、左上角单条 sheen 和柔和投影
- **深色模式**：整套配色跟着切换，不是简单反色
- **一键开关**：关掉后属性、节点、token 层全部撤走，回到原生界面，不用刷新

## 装法

在 DSH 里用插件管理器把本目录作为 bundle 安装：

```
plugin_manager install_bundle → 目标填本目录的绝对路径
```

或者手工：在 profile 的 `node_modules` 里链到本目录，然后往 `cordis.patch.yml` 加一行：

```yaml
- insert:
    - id: ui-liquid-glass
      name: '@local/dsh-liquid-glass'
```

默认 profile 目录是 `%USERPROFILE%\.dsh\profiles\<profile>`。

## 设置位置

**设置 → 通用设置 → 外观** 下方的「液态玻璃壁纸」。四个旋钮：

| 旋钮 | 作用 | 默认 |
|---|---|---|
| 色调 | 背景色晕的色相，0–360° | 212°（偏蓝） |
| 模糊 | 玻璃 `backdrop-filter` 强度 | 38px |
| 玻璃浓度 | 界面的不透明度，越低越透 | 32% |
| 流动 | 色晕是否缓慢漂移 | 开 |

设置存在 `localStorage`（`dsh.liquid-glass.v4`）。想恢复出厂值，把这条 key 删掉再刷新。

## 和上游的对应关系

保留的东西：插件形态（Host 空 `apply` + `dsh.client` 浏览器 bundle）、`ctx.theme.overrideTokens` 的 token 覆盖思路、`ctx.slots.register` 的 slot 注册方式、`ctx.effect` 的生命周期管理、locale 注册。

换掉的东西：

| 上游 | 这里 | 原因 |
|---|---|---|
| `settings.plugin.item` 总开关卡片 | 只有 `settings.general.item` 一行 | 该 slot 在 0.2.1-rc.3 已移除 |
| 云母 / 兼容双模式 | 单一玻璃模式 | 新版布局重写，兼容模式的选择器全部失效 |
| `detailsCol` 等 DOM 钩子 | `rightbarCol` / `centerCol` / `sidebarCol` | 布局类名已改 |
| 粒子鲸鱼、小鱼、网状交互 | 移除 | 和"轻量壁纸"的目标无关 |
| 视频壁纸、File System Access | 移除 | 同上 |
| 4 万行 TypeScript + tsdown 构建 | 单文件 `client.js`（约 23 KB） | 免构建，改完即生效 |
| `@deepseek-ai/dsh-client-ui-primitives` 图标 | 纯 CSS 自绘 | 客户端不该 require 其他 Harness Client 包 |

## 已知边界

- 玻璃的类名匹配用 `[class*='sidebarCol']` 这类子串选择器，DSH 换一套 CSS module hash 命名时可能需要更新（本轮已按实际 bundle 核对过）
- 只做了 web 平台；桌面端和浏览器访问共用同一套客户端 bundle
- 摄像机/GPU 很弱的机器上，`backdrop-filter` 叠加动画可能掉帧，把「流动」关掉、模糊调低即可

## 许可

上游是 AGPL-3.0，本目录沿用同一许可，见仓库根目录 `LICENSE`。
