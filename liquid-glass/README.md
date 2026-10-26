# liquid-glass — 适配 DSH 0.2.1-rc.3 桌面端的液态玻璃壁纸

这是 [`WYH66666666/DSH-Transparent-UI-Plugin`](https://github.com/WYH66666666/DSH-Transparent-UI-Plugin)（Aqua）的适配分支。

上游版本按 DSH `0.1.0-rc.5` 编写，装到当前桌面端（`0.2.1-rc.3`，profile `desktop`）会出问题：它依赖的 `settings.plugin.item` 这个 slot 在新版已被移除，布局的 DOM 钩子 `detailsCol` / `data-hero-headline` 也不再存在。与其逐行修补 4 万行 TypeScript，这里按新 API 重写了一个小得多的实现，只保留真正要的东西：**苹果风的液态玻璃壁纸**。

## 效果

- **背景**：一片偏蓝的液态光场，两颗缓慢漂移的色球 + 两条静态的液体光带 + 细颗粒。色相固定在 203–226°（蓝区），蓝度用饱和度和明度表达，拉到最满也不会变紫
- **玻璃**：侧边栏、主栏、右栏各做 `backdrop-filter` 磨砂，配不对称的边光（上缘最亮、两侧次之、下缘只有一点回光）、边内侧的柔和厚度衰减、以及分栏缝上的「亮唇 + 暗折射线」双层倒角
- **输入框**：独立的一层磨砂 + 高浓度底色，把下面的正文彻底挡住，不再是文字透上来重叠
- **光标光效**：跟随光标的三瓣高光，带缓动拖尾；亮度、大小各一条滑杆，大小拉到 0 就是彻底关掉
- **深色模式**：整套配色跟着切换，不是简单反色
- **一键开关**：关掉后属性、节点、token 层全部撤走，回到原生界面，不用刷新

## 三条不能碰的硬约束

这个插件是在别人拥有的 DOM 上加样式，以下三条是本轮实测＋审计之后定下来的，改代码时不要推翻：

1. **`backdrop-filter` 只能放在 `::before` / `::after` 上，不能放在宿主元素上。**
   这个属性会让元素成为其 `position: fixed` 后代的包含块。DSH 的侧边栏收起按钮是 `position: fixed; left: 12px`，上下文用量弹层、锚定菜单也是 fixed 定位。模糊一加到栏目上，这些控件的锚点就会从视口变成栏目，位置错乱、甚至被 `overflow: hidden` 裁掉。
2. **`isolation` 只允许出现在 `[data-composer-card]` 上。**
   输入框需要它，否则 `::before` 的负 z-index 会跑到卡片底色下面，模糊等于白做。其他地方加它会新建层叠上下文，宿主里那些 `z-index: 30` 的 fixed 元素就被关进了局部层级。
3. **不要覆写 `--dsw-alias-border-l2` / `-l3` 和 `--dsw-alias-bg-layer-3`。**
   前两个是发丝线（原生是黑色 10%）不是填充，改白会让浅色模式下所有分隔线、树线、回合分界线消失；第三个在三处被当作**文字颜色**用（预设损坏徽标、它的 tooltip、图标按钮 tooltip），改半透明会让文字变半透明。

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

## 改完先跑这道检查

```
node liquid-glass/tools/guard.cjs [client.js 路径]
```

它检查的是这个文件真踩过的坑：CSS 模板里混进反引号（会截断整份样式表，而且第一个反引号会冒充结束符，所以只数反引号是查不出来的——它改成了校验模板是否完整写到最后一个规则）、括号配平、以及上面那三条硬约束。CSS 模板里写注释时**不要用反引号**。

## 设置位置

**设置 → 通用设置 → 外观** 下方的「液态玻璃壁纸」。三个预设 + 六条滑杆：

| 控件 | 作用 | 默认 |
|---|---|---|
| 清透 / 标准 / 浓郁 | 一键换通透度和磨砂的组合（对应 iOS 26.1 的 Clear / Tinted 思路） | 标准 |
| 通透度 | 界面玻璃的实心程度 | 40% |
| 蓝色 | 壁纸的蓝度，从蓝白到深蓝 | 50 |
| 磨砂 | `backdrop-filter` 半径 + 颗粒密度，两者一起动 | 55% |
| 光晕亮度 | 光标高光的强度 | 70% |
| 光晕大小 | 光标高光的面积，**拉到 0 即彻底关掉**（面积为 0，同时停止跟踪光标） | 50% |
| 流动 | 色球是否缓慢漂移 | 开 |

设置存在 `localStorage`（`dsh.liquid-glass.v8`）。想恢复出厂值，把这条 key 删掉再刷新。

## 性能取向

- 动画只用 `transform`，走合成器，不重绘
- 光场本身**不加 `filter: blur()`**：径向渐变自己就会淡出，再加模糊只是每帧多一块离屏缓冲
- 颗粒、光带都是静态的，只光栅化一次
- 光标高光只有一个 rAF、写一个 `transform`，停下来就自动停帧；关掉光晕时连监听都直接短路
- 窗口真正隐藏（`document.hidden`）时暂停动画。失焦但可见**不**暂停——那种状态下照样每帧合成，暂停只省不到东西，反而让壁纸看起来卡住
- 磨砂为 0 时把 `backdrop-filter` 设成 `none`，而不是 `blur(0px)`，因为后者照样会建一遍背景通道

## 和上游的对应关系

保留的东西：插件形态（Host 空 `apply` + `dsh.client` 浏览器 bundle）、`ctx.theme.overrideTokens` 的 token 覆盖思路、`ctx.slots.register` 的 slot 注册方式、`ctx.effect` 的生命周期管理、locale 注册。

换掉的东西：

| 上游 | 这里 | 原因 |
|---|---|---|
| `settings.plugin.item` 总开关卡片 | 只有 `settings.general.item` 一行 | 该 slot 在 0.2.1-rc.3 已移除 |
| 云母 / 兼容双模式 | 单一玻璃模式 | 新版布局重写，兼容模式的选择器全部失效 |
| `detailsCol` 等 DOM 钩子 | `rightbarCol` / `centerCol` / `sidebarCol` | 布局类名已改 |
| 粒子鲸鱼、小鱼、网状交互 | 移除 | 和「轻量壁纸」的目标无关 |
| 视频壁纸、File System Access | 移除 | 同上 |
| 4 万行 TypeScript + tsdown 构建 | 单文件 `client.js`（约 45 KB） | 免构建，改完即生效 |
| `@deepseek-ai/dsh-client-ui-primitives` 图标 | 纯 CSS 自绘 | 客户端不该 require 其他 Harness Client 包 |

## 已知边界

- 玻璃的类名匹配用 `[class*='sidebarCol']` 这类子串选择器，DSH 换一套 CSS module hash 命名时可能需要更新（本轮已按实际 bundle 核对过）
- 只做了 Windows（`[data-windows-titlebar]`）这一路；macOS 的渐变背景分支没处理
- 光晕是像素级的加法/混合，浅色模式下受"白色天花板"限制：底色越白，光晕越不明显。底色（通透度）压低一点、或把光晕调大，会更容易看见
- 极弱 GPU 上 `backdrop-filter` 叠加动画可能掉帧，把「流动」关掉、磨砂调低即可

## 许可

上游是 AGPL-3.0，本目录沿用同一许可，见仓库根目录 `LICENSE`。
