# badminton-web 文档索引

| 文档 | 用途 | 受众 |
|------|------|------|
| [design.md](design.md) | 设计蓝皮书：核心理念、物理模型、手感模型、技战术映射 | 所有开发者、产品理解 |
| [architecture.md](architecture.md) | 架构文档：双层结构（当前现状 + 规划蓝图）、模块接口、数据流、Phase 路线 | 架构评审、新成员 onboarding |
| [adr/001-module-boundary.md](adr/001-module-boundary.md) | ADR 001: 纯逻辑层与渲染层分离原则 | 架构决策 |
| [adr/002-data-flow.md](adr/002-data-flow.md) | ADR 002: 集中归约器 + 单向数据流 | 架构决策 |
| [adr/003-input-abstraction.md](adr/003-input-abstraction.md) | ADR 003: 输入抽象层（键盘/手柄/触屏/网络统一接口） | 架构决策 |

## 快速导航

- **项目入口**：`src/main.ts`
- **浏览器编排层**：`src/play/`
- **物理模块**（纯数学，可独立测试）：`src/physics/`
- **渲染模块**（Three.js 依赖）：`src/render/`
- **游戏逻辑**（状态机、规则）：`src/game/`
- **角色控制**（步法、击球）：`src/character/`
- **输入抽象**：`src/input/`
- **AI 决策**：`src/ai/`

> 完整 ADR 列表见 [adr/](adr/) 目录。新增 ADR 请遵循标准模板：Status / Context / Decision / Consequences。
