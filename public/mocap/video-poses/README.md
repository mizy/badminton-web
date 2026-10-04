# 统一角色视频动作库

8 条原地动作，使用同一二次元角色、同一套人物蒙皮骨骼和 25 fps。4 段真人示范提供完整动作，另外 4 条为其中的启动、交叉和回位选区。

| 分类 | 动作 |
| --- | --- |
| 前场 | 正手上网与回位、反手上网与回位 |
| 后场 | 正手后场移动、反手侧转身与回位 |
| 启动与交叉步 | 启动准备、交叉上网 |
| 回位 | 正手跨步后回位、反手跨步后回位 |

主资源为 `models/anime-motion-library.glb`：同一个 VRoid HairSample_Male 角色，内含 8 个以 manifest 动作 id 命名的 AnimationClip。Storybook 直接加载此导出文件，不另用实时姿态计算冒充导出结果。

各 BVH 使用统一的 17 关节中间骨架：Y-up、米、Z-X-Y 旋转、固定骨长。它们供骨架检查和其他人物重定向使用；角色 GLB 保留原人物完整的蒙皮骨骼。各片段的方向基准来自所属完整录制，裁剪启动或回位时不会重新旋转朝向。

## 来源与精度

`manifest.json` 的 sources 记录 BWF Development 示范链接及原视频起点；motions 的 fromFrame/toFrame 是包含端点的选区。`sources/*.motionbert.json` 是 MediaPipe 二维检测经 MotionBERT Lite 推理得到的 17 点位置，完整录制的 21 点适配数据在对应 JSON 中。

这是单目视频估计，不能称为专业球员动捕；真实场上位移、脚底锁定、手腕与球拍朝向尚未实测。组件循环不是无缝运动循环。比赛适配见下文，动作库仍供检查、制作与校准，不表示达到专业运动精度。

人物重定向保留肩—肘—腕的段方向与夹角，不用比赛的击球接触 IK 拉动肩膀或手肘。手腕保持相对前臂的中立姿势，球拍固定在掌心并随前臂转动；此处没有恢复真实旋前、旋后或挥拍手腕角度。适配 JSON 的 `grip` 按正反手示范分类赋值，经 `syncPlayerMocap` 传给现有模型绑定，复用握拍手指姿势，反手的拇指更伸展；这些手指姿势不是视频测量。

Storybook 的“手臂近景”用于检查握拍、肘部和手腕的连续性。

## 比赛接入

`clips.json` 是同一次烘焙导出的骨骼动画，只有人形旋转和髋部位置，不重复打包人物、球拍或鞋子。默认游戏通过 `createPlayerMesh` 的 animationUrl 加载它，`bindHumanoidModel` 调用 `createVideoAnimation`，玩家和 AI 共用同一流程。自定义人物仍使用自己的骨架和原有动作。

启动用 ready-start；中场/交叉移动用 cross-approach；前后场左右角分别用 front/rear forehand/backhand；减速回位用对应的 recover。比赛会对齐各片段的根朝向、平滑循环接缝并按移动速度播放。视觉脚底锁定、跨步释放与 IK 修正适应实际位移，人物的世界位置仍由 GameState 决定。正反手视频姿势控制空闲持拍手，准备和触球走原有拍面接触链路；跳跃、剪刀步和落地沿用比赛动作。此适配不补充缺失的中场专业动捕或实测手腕旋转。

动作数据加载失败时继续使用基础比赛动作；`clips.json` 随 PWA 预缓存，离线比赛无需访问真人视频。`pnpm verify:video-game` 验证桌面键盘、手机摇杆的六点移动、8 条动画触发、骨长、脚底高度、脚部跳位和实际发球。

输入视频只作为本地动作参考，未随本库分发。角色许可来自 `models/anime-player-license.txt`（VRoid 样例 CC0）；MotionBERT 软件为 Apache-2.0。输入素材、模型及生成动画的分发用途应分别核实，不作整套商业许可承诺。

## 重新导出与验证

1. `pnpm prepare:motions` 从归档三维姿态生成 manifest、适配 JSON 与统一骨架 BVH；`-- --input PATH` 可读取新的一批同名 MotionBERT 结果。
2. 启动本项目 Vite 与现有 CDP 浏览器，然后 `pnpm export:motions`。它通过现有 `syncPlayerMocap` / `bindHumanoidModel` 将所有动作烘焙到一个人物 GLB，并写入 `.workbuddy/motion-library/export-proof.json`。
3. 启动 Storybook，`pnpm verify:motions` 检查 GLB 读回、全部动作、分类、搜索、暂停/重播/循环、显示方式，以及桌面和手机视口。
4. 类型检查、受影响测试、项目构建与 Storybook 构建在浏览器验收后统一运行。

发布用 `STORYBOOK_VIDEO_MOTIONS_ONLY=1 pnpm build-storybook --output-dir dist/storybook`；仅发布这个动作库的 5 个分类入口。本地完整 Storybook 继续保留其他示例。
