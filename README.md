# 🏸 badminton-web

基于 Three.js 的 3D 羽毛球游戏，纯浏览器运行，零后端依赖。

## Rally Arena 玩法

- 杀球键按住蓄力，力量到满格后封顶，松手立即出拍。其他球路可提前准备，等来球进入可击区出拍。
- 等待来球的输入最多保留 0.95 秒，引拍期间可以移动；附近 0.8 米内提供真实步进调整，远球仍需主动跑位。
- `J / K / L / U / I / O` 分别为高远、吊球、杀球、平抽、放网、挑球；`WASD` 移动，按球路键时采样方向决定落点。
- 杀球采用高点接触，并随触球高度调整落点深度；`Space` 起跳、`Q` 蹬转可衔接更高的击球点。
- 球馆、看台、观众反应、接球圈和击球音效接入实际训练与比赛；球员来源与许可证见 `public/models/README.md`。

操作与呈现参考 [Mario Tennis Aces](https://play.nintendo.com/news-tips/tips-tricks/mario-tennis-aces-tips-tricks/)、
[Tennis Elbow 4](https://www.managames.com/tennis/doc/Tennis_Elbow-Tennis_Game.html) 与
[Table Tennis Touch](https://tabletennistouch.com/)。场馆与 UI 使用本项目设计，球员使用 Quaternius CC0 资产。

## 功能模块

| 模块 | 说明 |
|------|------|
| `physics/` | 羽毛球空气动力学（RK4 积分 + 变阻系数 + Magnus 效应） |
| `ai/` | 电脑球员战术决策，支持 easy / medium / hard 三档难度 |
| `character/` | 球员移动控制、挥拍动作合成 |
| `game/` | 比赛状态机：发球、计分、Deuce、换边、三局两胜 |
| `play/` | 对打循环：回合驱动 + AI 走位/击球决策 |
| `input/` | 键盘 / 手柄 / 触屏三端输入适配 |
| `render/` | Three.js 渲染：球场、选手模型、羽毛球轨迹、特效、HUD |
| `recording/` | 对局录制器 |
| `demo/` | 演示控制器 |
| `stories/` | Storybook 可视化故事（调试 & 展示） |

## 技术栈

- **渲染**：Three.js 0.170
- **构建**：Vite + TypeScript
- **可视化调试**：Storybook + lil-gui
- **测试**：Vitest

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动 Storybook（推荐，可交互调试）
pnpm storybook

# 开发模式
pnpm dev

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```

## 手机与 PWA

游戏支持 Android 和 iPhone 触屏操作：左下区域落指生成摇杆，轻推慢走、推满冲刺；拖过外圈时底座跟随，回拉即可转向，松手 / 转屏 / 输入中断时回位。杀球键按住蓄力、松手立即出拍；其他球路可提前准备，等球进入可击区出拍。按住拖动可以瞄准落点。轻点起跳键起跳 / 发球，长按蹬转。横竖屏均可玩，竖屏球场更清楚。手机菜单先显示训练 / 比赛入口，向下滑动可以调整对手和球拍。

构建后的 `dist/` 可发布到任意 HTTPS 静态网站，无需后端。子目录部署需在构建时指定路径，例如 `pnpm build --base /badminton-web/`。手机访问电脑的 HTTP 局域网地址可以测试布局，PWA 安装和离线缓存需要 HTTPS；开发机自身的 localhost 是例外。

- Android：在 Chrome 打开地址，点击游戏菜单的「安装到主屏幕」，或使用浏览器菜单里的「安装应用 / 添加到主屏幕」。
- iPhone：在 Safari 打开地址，通过「共享 → 添加到主屏幕」安装。
- 安装后从主屏幕图标打开，使用独立应用窗口；已安装状态下隐藏安装入口。
- 首次联网加载并完成缓存后，默认训练和人机比赛可以离线重开。Storybook、动作库和 URL 参数指定的外部球员模型不在默认离线缓存内。
- 更新会先下载新缓存；关闭旧游戏窗口后，新窗口启用新版本，避免正在进行的比赛被强制刷新。

应用清单在 `public/manifest.webmanifest`，图标源文件在 `public/icons/court.svg`，离线缓存复用 `vite.config.ts` 中的构建钩子和 `src/main.ts` 的注册入口。

浏览器回归检查使用本地 Chrome（可用 `CHROME_PATH` 指定其他安装路径）：

```bash
# 开发服务器运行后：摇杆跟手/反向、多指输入、转屏和安装按钮
pnpm verify:mobile

# 真实键盘回归：连续杀球、至少六拍相持、暂停与资源错误检查
PLAY_URL=http://127.0.0.1:3000 node scripts/verify-gameplay.mjs

# 同一对局启用四倍 CPU 降速，统计实际击球帧（测量期间不截击球截图）
PROFILE_FRAMES=1 PLAY_URL=http://127.0.0.1:3000 node scripts/verify-gameplay.mjs

# pnpm build && pnpm preview 后：清单、安装条件、离线重开和触屏发球
pnpm verify:pwa
```

`PLAY_URL` 可覆盖检查地址，截图写入已忽略的 `.workbuddy/mobile-pwa/`。

## 物理引擎亮点

- 77 速羽毛球基准参数（质量 5g、截面积 20cm²）
- 变阻力系数：高速 Cd≈0.035 → 低速 Cd≈0.70（符合真实气动特性）
- Magnus 效应模拟旋转偏转
- RK4 四阶龙格-库塔数值积分，保证轨迹精度

## Storybook 故事

启动 `pnpm storybook` 后可浏览：

- **Play/AI vs AI Singles** — 两个 AI 自动对打，可调难度、回放速度
- **Play/Basic Rally** — 基础对打循环
- **Shuttle/Physics Multi** — 多球物理演示
- **Shuttle/Trajectory** — 轨迹可视化
- **Shuttle/Shot Contact** — 击球接触点调试
- **Render/Court Standard** — 标准球场渲染
- **Render/Player** — 选手模型
- **Render/Effects** — 视觉特效
- **HUD/ScoreHUD** — 比分显示
- **Game/Demo** — 完整游戏演示
