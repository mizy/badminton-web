# 🏸 badminton-web

基于 Three.js 的 3D 羽毛球游戏，纯浏览器运行，零后端依赖。

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
