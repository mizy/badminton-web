# ADR 003: 输入抽象层 — 键盘/手柄/触屏/网络统一接口

## 状态

Accepted (2026-06-11)

## 上下文

Phase 1 中键盘事件直接在 `main.ts` 用 `window.addEventListener('keydown')` 处理：

```typescript
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && gameState.phase === 'idle') {
    gameState = { phase: 'playing', shuttle: serveShuttle(), ... }
  }
})
```

这种直写方式在单机原型中可以工作，但存在以下问题：

1. **平台锁定**：`keydown`/`keyup` 事件只对应键盘。手柄、触屏、联机输入需要完全不同的绑定逻辑，但它们最终都应产生相同的语义动作
2. **测试困难**：没有抽象层，无法在无 DOM 环境（Node.js）下测试输入处理逻辑
3. **联机阻塞**：远程玩家输入本质上是网络消息（序列化 `InputEvent`），但当前代码路径中键盘事件直接修改状态，没有统一的"输入→动作"转换层
4. **双人/多人扩展**：没有 `playerIndex` 概念，P7 联机时无法区分本地/远程玩家

## 决策

### 三层输入模型

```
平台事件 (DOM / Gamepad API / Touch / WebSocket)
    → InputAdapter (创建/销毁绑定)
    → InputEvent (统一 payload, 含 playerIndex)
    → InputAction (语义动作 union)
    → gameReducer (状态变更)
```

### 接口定义

```typescript
// input/types.ts
type InputAction =
  | { type: 'SERVE' }
  | { type: 'MOVE'; dir: MoveDirection }
  | { type: 'STOP_MOVE' }
  | { type: 'SWING_START' }
  | { type: 'SWING_RELEASE' }
  | { type: 'PAUSE' }
  | { type: 'RESET' }

interface InputEvent {
  action: InputAction
  source: InputSource     // 'keyboard' | 'gamepad' | 'touch' | 'network'
  timestamp: number
  playerIndex: 0 | 1
}

interface InputAdapter {
  connect(listener: InputListener): void
  disconnect(): void
}
```

### 具体适配器规范

| 适配器 | 文件 | 平台绑定 | 特殊处理 |
|--------|------|---------|---------|
| 键盘 | `input/keyboard.ts` | `keydown`/`keyup` DOM 事件 | 轮询循环（60fps）检测 WASD 持续按下 → MOVE 事件 |
| 手柄 | `input/gamepad.ts` *未来* | `Gamepad API` | 轮询摇杆/按键 → MOVE/SWING 映射 |
| 触屏 | `input/touch.ts` *未来* | `Touch` DOM 事件 | 虚拟摇杆 + 点击/滑动 → MOVE/SWING 映射 |
| 网络 | `input/network.ts` *未来* | `WebSocket` | 反序列化远端 `InputEvent`，注入本地 playerIndex |

### 设计原则

1. **Adapter 只负责转换**：将平台事件翻译为 `InputEvent`，不包含任何游戏逻辑
2. **Adapter 可组合**：同一帧可同时存在多个 Adapter（本地键盘 + 远程网络）
3. **无状态（除键状态集）**：Adapter 内部可维护状态（如 `pressed` Set），但游戏状态变更必须走 reducer
4. **工厂函数模式**：`createKeyboardAdapter(playerIndex, keymap?)` 返回 `InputAdapter` 接口

## 后果

### 正面

- 所有输入设备产生同一种 `InputEvent`，游戏逻辑无需关心输入来源
- `InputAction` 是纯 JSON，联机模式下直接 `JSON.stringify` 传输
- 键盘适配器已有实现并含有 60fps 轮询循环，可被 `main.ts` 直接集成
- 新增输入设备只需实现 `InputAdapter` 接口，不改游戏逻辑

### 负面

- 键盘适配器的轮询循环（`setInterval`）增加约 1ms 每帧的开销，可忽略但需文档说明
- 手柄和触屏适配器需要在未来实现时才验证接口完备性
- 双人模式下需要两个 Adapter 实例，`playerIndex` 通过工厂参数区分

## 参考

- ADR 001: 模块边界 — 纯逻辑层与渲染层分离（`input/types.ts` 归属纯逻辑层）
- ADR 002: 数据流 — 集中归约器 + 单向数据流（`InputEvent → InputAction → gameReducer`）
