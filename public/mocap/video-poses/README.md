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

这是单目视频估计，不能称为专业球员动捕；真实场上位移、脚底锁定、手腕与球拍朝向尚未实测。组件循环不是无缝运动循环。动作库供检查、制作与校准，不表示已经接入比赛或达到专业运动精度。

输入视频只作为本地动作参考，未随本库分发。角色许可来自 `models/anime-player-license.txt`（VRoid 样例 CC0）；MotionBERT 软件为 Apache-2.0。输入素材、模型及生成动画的分发用途应分别核实，不作整套商业许可承诺。

## 重新导出与验证

1. `pnpm prepare:motions` 从归档三维姿态生成 manifest、适配 JSON 与统一骨架 BVH；`-- --input PATH` 可读取新的一批同名 MotionBERT 结果。
2. 启动本项目 Vite 与现有 CDP 浏览器，然后 `pnpm export:motions`。它通过现有 `syncPlayerMocap` / `bindHumanoidModel` 将所有动作烘焙到一个人物 GLB，并写入 `.workbuddy/motion-library/export-proof.json`。
3. 启动 Storybook，`pnpm verify:motions` 检查 GLB 读回、全部动作、分类、搜索、暂停/重播/循环、显示方式，以及桌面和手机视口。
4. 类型检查、受影响测试、项目构建与 Storybook 构建在浏览器验收后统一运行。

发布用 `STORYBOOK_VIDEO_MOTIONS_ONLY=1 pnpm build-storybook --output-dir dist/storybook`；仅发布这个动作库的 5 个分类入口。本地完整 Storybook 继续保留其他示例。
