# Prototype Badminton Character Assets

`xbot.glb` is a temporary rigged humanoid test model copied from the public
three.js examples repository:

https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Xbot.glb

The repository is distributed under the MIT license. This asset is used as a rigged test body for Storybook and the optional game
model preview. The badminton motion,
contact timing, shuttle trajectory, and racket placement are owned by local
badminton code.


## 分层验证与模型接入

- Storybook **渲染 / 动作骨架** 直接调用 `createPlayerSkeleton`、
  `createPlayerMotion` 和 `updatePlayerMotion`，不导入人物外观或 glTF 加载器。
  支持暂停、慢放、逐帧、时间轴、两侧朝向、六点步法和六种挥拍；显示骨长误差和落脚轨迹。
- **渲染 / 球员展示** 用同一组动作样本验证模型绑定。`modelUrl` 默认为
  `/models/xbot.glb`，留空可查看程序构造的运动员，填入其他模型路径可替换外观。
- 游戏默认使用程序外观，访问 `/?model=/models/xbot.glb` 可直接使用 Xbot 打球。
  模型加载或骨骼映射失败时保留程序外观。

动作骨架与模型的调用关系：

```text
PlayerState → playerMotion / playerFootwork → playerSkeleton
                                           ├─ playerAppearance（程序外观）
                                           └─ playerModel（glTF 蒙皮重定向）
```

当前接入约定：带骨骼的 glTF / GLB，人形骨骼使用 Mixamo 名称
（允许 `mixamorig` 或 `mixamorig:` 前缀），绑定姿态朝 +Z。
需要 Hips、Spine2、左右 Arm / ForeArm / Hand / UpLeg / Leg / Foot。
模型自动归一到 1.78 米；绑定层保留原始骨长和静止轴向，按动作落点做双骨 IK，
球拍挂在模型右手并保持米制尺寸。其他骨骼命名需在 `humanoidModel.ts` 中增加映射。
比赛动作目前由本地程序生成；更换人物外观不会自动改变步法和挥拍质量。


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
