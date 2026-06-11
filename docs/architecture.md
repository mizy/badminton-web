# Architecture

```
src/
├── physics/              # 纯数学，无 Three.js 依赖
│   ├── shuttlecock.ts    # 球物理（RK4 + 气动）
│   ├── racket.ts         # 拍面碰撞模型
│   └── collision.ts      # 碰撞检测工具
│
├── game/                 # 游戏规则，纯状态机
│   ├── match.ts          # BWF 计分规则
│   ├── shotLegality.ts   # 球路合法性判定
│   └── stamina.ts        # 体力系统
│
├── character/            # 角色控制
│   ├── movement.ts       # 步法惯性系统
│   ├── shotSynthesis.ts  # 输入组合→球路合成
│   └── timing.ts         # 击球时机窗口
│
├── ai/                   # AI 决策
│   ├── tactical.ts       # 战术选择
│   ├── prediction.ts     # 对手习惯预测
│   └── difficulty.ts     # 难度参数
│
├── input/                # 平台适配
│   ├── keyboard.ts       # 键盘输入
│   ├── gamepad.ts        # 手柄输入
│   └── touch.ts          # 触屏输入
│
├── render/               # 渲染层（最薄）
│   ├── court.ts          # 球场网格
│   ├── playerMesh.ts     # 球员几何体
│   ├── shuttlecockMesh.ts# 羽球网格
│   └── effects.ts        # 拖尾/震屏
│
└── main.ts               # 入口 + Game Loop

test/
└── physics/
    ├── shuttlecock.test.ts
    ├── racket.test.ts
    └── collision.test.ts
```

## 分层原则

- `physics/`、`game/`、`character/`、`ai/` → 纯逻辑，不依赖 Three.js
- `input/` → 抽象输入事件，不依赖具体 DOM
- `render/` → 最薄，仅负责把逻辑状态画出来
- `main.ts` → 粘合层，初始化场景 + 驱动 loop

每个模块可独立单元测试，不打开浏览器就能验证。
