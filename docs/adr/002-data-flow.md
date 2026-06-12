# ADR 002: 数据流 — 集中归约器 + 单向数据流

## 状态
Accepted (2026-06-11)

## 上下文
Phase 1 中状态变更是 ad-hoc 的：`main.ts` 直接赋值 `gameState = { ...gameState, shuttle: next }`。随着 Phase 2-7 模块增多（角色、AI、比赛规则），这种分散变更将导致状态不一致。

## 决策

### 单向数据流
```
InputEvent → GameAction → gameReducer(state, action) → new GameState → render sync
```

### 唯一归约器
`game/reducer.ts` 中的 `gameReducer` 是 `GameState` 的**唯一变更入口**。任何模块（character、ai、input）都不能直接修改 `GameState`。

### 注入模式
- `gameReducer` 接收 `InputAction` 和 `{ type: 'TICK', dt }`
- `character/movement.ts` 导出纯函数 `updateMovement(player, dt)`，由 reducer 调用
- `ai/tactical.ts` 导出纯函数 `decideTactical(...)`，由外部循环调用后 dispatch `TacticalDecision`

### 序列化
- `GameState` 是纯 JSON 可序列化结构
- `GameAction` 是纯 JSON 可序列化 union
- 联机模式下，`(playerIndex, action)` tuple 可通过 WebSocket 传输

## 后果

### 正面
- 状态变更有迹可循，便于调试（可记录所有 action 做回放）
- 联机模式直接复用：客户端发送 action → 服务端执行 reducer → 广播新 state
- 物理确定性和 action 序列组合可实现帧同步

### 负面
- reducer 是"上帝模块"，需要随 Phase 增长而扩展
- 每个 Phase 新增 action 类型时需修改 reducer
