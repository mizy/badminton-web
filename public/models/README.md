# Badminton Character Assets

## 默认球员：Quaternius Universal Base Characters

游戏和球员展示页默认使用 Quaternius 的 **Universal Base Characters [Standard]**
中的 `Superhero_Male_FullBody`，带完整人体骨架和手指关节。

- 作者：Quaternius / Tomás Laulhé。
- 官方模型页：https://quaternius.com/packs/universalbasecharacters.html
- 官方免费下载：https://quaternius.itch.io/universal-base-characters
- 步态来源：https://quaternius.itch.io/universal-animation-library
- 两套素材均为 **CC0 1.0 Universal**，允许修改、商用和随源码再分发；
  完整许可保存在 `quaternius-cc0-license.txt`。

`quaternius-player.glb` 约 807KB，`quaternius-player.png` 约 18KB。准备脚本保留原始人体网格、蒙皮权重和骨长，
把 UE 骨骼名映射为现有绑定器支持的 Mixamo 名称，按原始 UV 绘制运动服、号码、领口、侧条和裤边。
纹理在每个三角形内插值人体坐标，衣服边缘不再沿三角形呈锯齿；UV 岛边缘带滤波留白。
原模型的裸足面由项目现有运动鞋、袜子替换，球鞋仍跟随模型踝关节。
模型的 `Player_Kit` 使用同目录 PNG，复用 `createTeamTexture` 将红色队服染为主场蓝 / 客场红，
保留皮肤、头发、号码和短裤颜色。GLB 与 PNG 都随游戏打包并纳入离线缓存。

GLB 同时保留官方动画库的 `Idle_Loop`、`Walk_Loop`、`Sprint_Loop`，
对应 `idle`、`walk`、`run`，每段仅导出左右大腿、小腿、脚的六条旋转轨道。
世界移动、起跳和挥拍继续由比赛状态及本地运动学驱动。

从官方免费包解压后，用 Python 3 + NumPy 可重新生成素材：

```sh
python3 scripts/prepare-quaternius-player.py \
  '/path/Universal Base Characters[Standard]/Base Characters/Godot - UE' \
  '/path/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb'
```

球拍以掌心为握柄点；带手指的模型由食指、小指根部确定横过掌心的柄轴，
其余模型保留公共 `RACKET_IN_RIGHT_HAND` 校准。
右手指屈曲包住拍柄，拇指根部向握柄收拢，反手时拇指较直；非持拍手沿前臂抬起。
上身跟随公共骨架的持拍肩位置，避免侧身后
模型手腕与实际触球点错开。腿部落点随髋朝向，引拍时肩髋继续分离，头部回看球网。

加载或骨骼绑定失败时显示程序构造球员。`/?model=` 可查看回退；
`?model=/models/xbot.glb` 可查看 Xbot。外部 FBX 可用 `texture` 查询参数指定贴图。

## Kenney 兼容模型

`kenney-player.glb` 与 `kenney-player.png` 保留为 **Animated Characters Protagonists 1.1** 兼容素材：

- 作者 / 发布者：Kenney（https://kenney.nl）
- 原始素材页：https://kenney.nl/assets/animated-characters-protagonists
- 原始下载包：https://kenney.nl/media/pages/assets/animated-characters-protagonists/608191acc4-1774773108/kenney_animated-characters-protagonists.zip
- 许可：Creative Commons Zero 1.0（CC0）
  https://creativecommons.org/publicdomain/zero/1.0/
- 署名：不要求；Kenney 建议自愿署名。原始许可文本保存在
  `kenney-animated-characters-license.txt`。

仓库中的 `kenney-player.glb` 由原包 `Model/characterMedium.fbx` 使用 Three.js
`GLTFExporter` 转为网页友好的二进制 glTF，网格、蒙皮和骨架保持原样；
`kenney-player.png` 是原包 `Skins/skaterMaleA.png` 的原文件。CC0 允许复制、修改、
随网页和源码仓库再分发，包括商业用途。运行时仅把贴图中高饱和红色队服区域改成
主场蓝 / 客场红；皮肤、头发和面部细节保持原样。

实际检查结果：模型约 4,812 个顶点数据项，GLB 约 386KB、贴图约 41KB；包含
Hips、Spine、Chest、UpperChest、Head 以及左右 Arm / ForeArm / Hand / UpLeg /
Leg / Foot 骨骼。原模型没有内置动作片段，现有 `playerMotion` / `playerFootwork`
直接驱动这些骨骼，因此六点步法、球拍接触标定与世界位置仍由比赛状态统一控制。

## Xbot 兼容模型

`xbot.glb` is a temporary rigged humanoid test model copied from the public
three.js examples repository:

https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Xbot.glb

The repository is distributed under the MIT license. This asset remains an alternate rigged test body for Storybook and compatibility checks. The badminton motion,
contact timing, shuttle trajectory, and racket placement are owned by local
badminton code.


## 分层验证与模型接入

- Storybook **渲染 / 动作骨架** 直接调用 `createPlayerSkeleton`、
  `createPlayerMotion` 和 `updatePlayerMotion`，不导入人物外观或 glTF 加载器。
  支持暂停、慢放、逐帧、时间轴、两侧朝向、六点步法和六种挥拍；显示骨长误差和落脚轨迹。
- **渲染 / 球员展示** 用同一组动作样本验证模型绑定。`modelUrl` 默认为
  `/models/quaternius-player.glb`，留空可查看程序构造的运动员，填入其他模型路径可替换外观。
- 游戏默认加载 Quaternius 球员（包含在离线缓存中），主客场保留蓝 / 红配色。
  模型加载或骨骼映射失败时保留程序外观。

动作骨架与模型的调用关系：

```text
PlayerState → playerMotion / playerFootwork → playerSkeleton
                                           ├─ playerAppearance（程序外观）
                                           └─ playerModel（人形蒙皮重定向）
```

当前接入约定：带骨骼的 glTF / GLB / FBX，人形骨骼使用 Mixamo 名称
（允许 `mixamorig` 或 `mixamorig:` 前缀），也支持 Kenney 的 Chest / UpperChest /
Toes 别名，绑定姿态朝 +Z。需要 Hips、上胸，以及左右 Arm / ForeArm / Hand /
UpLeg / Leg / Foot。
模型自动归一到 1.78 米；绑定层保留原始骨长和静止轴向，按动作落点做双骨 IK，
球拍挂在模型右手并保持米制尺寸。其他骨骼命名需在 `humanoidModel.ts` 中增加映射。
比赛通过 Three.js `AnimationMixer` 播放模型包含的 `idle` / `walk` / `run`，
只读取腿部旋转轨道，忽略平移、缩放和上身轨道。世界位置与跳跃仍由游戏模拟控制。
直线后退反向播放步态，腿部朝向按实际世界速度转换；开始、急停恢复、六点专项步法、
起跳和挥拍阶段平滑切回程序骨架 IK，接触帧立即保持原有球拍校准。
前场左右角为持拍腿跨步 / 弓步，中场横移为并步，后场斜退为交叉步；
松手后脚步逐步收回准备站位。模型不含已标注的专业羽毛球六点动捕，专项动作仍由本地落脚系统合成。
其他模型未提供这三个片段时沿用程序骨架动作。


## HDM05 动捕试验

两个展示页都新增了 **HDM 05** 示例，直接使用仓库的十段 HDM05/AMASS 录制。
可切换发短球、高远、吊球、杀球，以及 `fullTake` 完整录制。
默认围绕右臂动作能量峰值裁出 0.9 秒引拍、1.2 秒随挥，并通过原有回放采样器平滑接回首帧。
这个峰值用于检视动作，尚未标注为真实球拍接触时刻。

`hdm05PlayerMotion.ts` 按 SMPL 关节父子层级做正向运动学，保留完整旋转幅度、
根转向和垂直位移，再驱动公共 `playerSkeleton`。
骨架页直接调用它；人物页通过 `syncPlayerMocap` 接入已有模型绑定。
原始轴角先转四元数再插值，避免跨越 ±π 时反向绕一圈。

现有 JSON 没有演员体型对应的静止关节偏移，因此采用公共运动员的标准骨长。
足底参考值为踝关节高度减 0.09 米；存在几厘米偏差，试验页保留显示。
当前试验不修改比赛击球逻辑；比赛接入还需要足底校准、接触时刻标注和动作混合。

## 常见动作库与拍子校准

Storybook **动作素材 / HDM05 动作库 / 分类浏览** 提供五类、28 段真实录制，
支持名称与描述搜索、骨架/标准角色/Xbot 切换、逐帧、慢放、选区循环和镜头旋转缩放。
素材来源与导出方法见 `public/mocap/hdm05-library/README.md`。

动捕的中立右手指向 -X，掌面法线为 -Y；球拍几何的拍轴为 +Y、拍面法线为 +Z。
`skeletalRacket.ts` 持有这两个坐标系的固定校准，公共骨架与旧动捕页共同读取。
拍轴沿握拍方向，拍面跟随手腕旋转，骨架页用橙色法线显示拍面朝向。
