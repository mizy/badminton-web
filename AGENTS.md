# Badminton Web — AI 开发指南

## 构建与测试

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 类型检查 + 构建
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest
```

## 开发顺序（Phase 1 → 7）

| Phase | 内容 | 关键文件 | 验证 |
|-------|------|---------|------|
| P1 | 球物理 + 场景 | `physics/*`, `render/*`, `game/gameState.ts` | `pnpm test` |
| P2 | 碰撞集成 | `game/reducer.ts` 新增碰撞步骤 | 集成测试 |
| P3 | 角色+输入 | `input/*`, `character/*`, `render/playerMesh.ts` | 移动测试 |
| P4 | 击球合成 | `character/shotSynthesis.ts`, `game/shotLegality.ts` | 6球路测试 |
| P5 | AI | `ai/*` | AI vs 玩家 |
| P6 | 比赛规则 | `game/match.ts`, `game/stamina.ts` | BWF 计分测试 |
| P7 | 联机 | `input/network.ts` | WebSocket sync |

## 架构规则

1. **纯逻辑层无 Three.js** — `physics/`, `game/`, `character/`, `ai/`, `input/types.ts` 不导入 `three`
2. **状态变更走 reducer** — `game/reducer.ts` 是唯一 GameState 变更入口
3. **physics/ 不可变** — 已有实现不修改，只通过接口集成
4. **测试优先** — 纯逻辑函数先写 vitest 再实现

## 模块接口速查

### 数据流

```
InputEvent → GameAction → gameReducer(state, action) → GameState → syncMeshes()
```

### 关键类型位置

| 类型 | 位置 |
|------|------|
| `InputAction` | `src/input/types.ts` |
| `PlayerState` | `src/character/types.ts` |
| `ShotType` | `src/character/shotSynthesis.ts` |
| `TacticalDecision` | `src/ai/types.ts` |
| `GameState` | `src/game/types.ts` |
| `ShuttlecockState` | `src/physics/shuttlecock.ts` |
| `RacketState` | `src/physics/racket.ts` |
