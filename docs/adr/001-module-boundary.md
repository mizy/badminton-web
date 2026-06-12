# ADR 001: 模块边界 — 纯逻辑层与渲染层分离

## 状态
Accepted (2026-06-11)

## 上下文
Phase 1 中存在 `game/camera.ts` 依赖 Three.js，违反 "game 为纯逻辑层" 的约定。未来 Phase 2-7 会增加 character、ai、input 模块，需明确定义各层职责和三方依赖策略。

## 决策

### Pure Logic（无 Three.js 依赖）
- `physics/` — 物理数学（已有，不可变）
- `game/` — 状态归约、规则判定
- `character/` — 角色状态、步法、击球合成
- `ai/` — AI 决策
- `input/types.ts` — 输入事件类型（不包括 DOM 绑定）

### Render Layer（允许 Three.js）
- `render/` — 所有 Three.js 网格、相机、特效

### Adapter Layer（平台绑定，无 Three.js）
- `input/keyboard.ts` — 键盘事件绑定（依赖 DOM，但不依赖 Three.js）

## 后果

### 正面
- 纯逻辑层可在 Node.js 下独立跑 vitest，无需浏览器
- 替换 Three.js 为其他渲染引擎时只需改 `render/`
- AI 和游戏规则测试不依赖 GPU

### 负面
- 渲染层需要从逻辑层读取状态做同步（`mesh.position = logic.pos`）
- 需注意逻辑层不能引用 `render/` 或 `three`

## 执行
- `game/camera.ts` 移至 `render/camera.ts`
- 新增 lint 规则：禁止 `game/`、`character/`、`ai/` 导入 `three`
