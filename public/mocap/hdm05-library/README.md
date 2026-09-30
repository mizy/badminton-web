# HDM05 常见动作浏览库

本目录包含 18 段常见动作长录制的 30 fps 导出数据；目录清单另外引用已有的 10 段羽毛球录制。
按移动步法、跳跃平衡、运动训练、日常动作和羽毛球五类浏览。

长录制包含多种动作，描述遵循 HDM05 官方录制脚本，不把整段误标为某个独立短动作。
Storybook 的选区循环可用于重复查看其中一段；数据没有额外人工标注的短动作时间点。

来源：

- 原始采集与动作说明：[HDM05](https://resources.mpi-inf.mpg.de/HDM05/)
- 参数格式：[AMASS](https://amass.is.tue.mpg.de/)
- 使用的公开序列目录：[realdream-ai/AMASS，固定版本 d38490c0e60dcefae81461fc5f4765fe66727831](https://huggingface.co/datasets/realdream-ai/AMASS/tree/d38490c0e60dcefae81461fc5f4765fe66727831/raw/MPI_HDM05)

每段 JSON 和 manifest 都记录演员编号、原始文件路径、帧率和时长。原始 HDM05 数据采用 CC BY-SA 3.0；AMASS 参数另遵循其来源条款。

用 scripts/extract-hdm05-library.py 导出。输入为 JSON 列表，每项包含 scene、sourcePath 和 local（对应 NPZ 的本地路径）。
脚本读取 poses、trans、mocap_framerate，保留根朝向和前 21 个身体关节旋转，从 120 fps 降采样到 30 fps。
