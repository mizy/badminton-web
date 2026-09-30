#!/usr/bin/env python3
"""Export common HDM05 full takes from AMASS NPZ files for the Storybook browser."""
import argparse
import json
import re
from pathlib import Path

import numpy as np

# Descriptions follow the original HDM05 recording script, not inferred class labels.
SCENES = {
    "01-01": ("移动步法", "行走与多种步型", "前进、弯腰走、后退、侧移、左并步、右前交叉步、蹑步、拖步、左右转身"),
    "01-02": ("移动步法", "原地走跑与屈膝", "原地走、慢跑、跑步、屈膝、屈膝行走"),
    "01-03": ("移动步法", "走跑转换与绕行", "左右半圆行走、转身、行走转跑步、左右半圆跑步"),
    "01-04": ("移动步法", "负重行走与跑步", "单手负重行走、负重跑步、左右手换重物、转身、拾取"),
    "01-05": ("跳跃平衡", "单脚跳与双脚跳", "右脚跳、左脚跳、跳步、双脚跳、跳下台阶"),
    "01-06": ("跳跃平衡", "上下楼梯", "走近台阶、上楼、转身、下楼、离开台阶"),
    "02-01": ("日常动作", "拾取与放置", "桌面拾取、弯腰拾取、屈膝拾取、地面放置、搬运物品"),
    "02-02": ("日常动作", "行走中取放物品", "走近货架、不同高度取放物品、携物行走"),
    "02-03": ("日常动作", "站立取放物品", "站立从货架不同高度取放物品"),
    "03-01": ("运动训练", "舞蹈", "舞蹈、全身节奏运动"),
    "03-02": ("运动训练", "踢腿与出拳", "前踢、侧踢、左右腿踢击、出拳"),
    "03-03": ("运动训练", "投掷与篮球投篮", "坐姿投掷、站姿高投、低手投掷、投篮、跑动投掷"),
    "03-04": ("运动训练", "手臂旋转", "单臂和双臂绕环、手臂旋转"),
    "03-05": ("跳跃平衡", "开合跳与深蹲", "开合跳、滑雪式跨跳、肘触膝、深蹲"),
    "03-08": ("运动训练", "地面训练与跳起", "躺姿手脚运动、翻身、俯卧撑、起跳伸展"),
    "03-09": ("运动训练", "仰卧起坐与俯卧撑", "仰卧起坐、翻身、印度式俯卧撑"),
    "03-10": ("运动训练", "跳绳", "不同速度和方式的跳绳"),
    "04-01": ("日常动作", "坐下、躺下与起身", "坐椅子、坐地、坐桌子、跪下、躺下、从地面起身"),
    "05-01": ("日常动作", "拍手与挥手", "单次拍手、连续拍手、头顶拍手、挥手"),
    "05-02": ("日常动作", "呼喊与系鞋带", "呼喊、弯腰或屈膝系鞋带"),
    "05-03": ("移动步法", "急加减速与侧手翻", "绊步、跛行、跑步加速减速、侧手翻"),
}


def export(row, out_dir, fps):
    scene = row["scene"]
    category, label, description = SCENES[scene]
    source = Path(row["local"])
    match = re.match(r"HDM_(\w+)_(\d{2}-\d{2})_(\d{2})_120_poses", source.stem)
    actor, _, take = match.groups()
    with np.load(source, allow_pickle=False) as data:
        source_fps = float(data["mocap_framerate"])
        indices = np.arange(0, len(data["poses"]), max(1, round(source_fps / fps)))
        pose = data["poses"][indices]
        trans = data["trans"][indices]
        trans = trans - trans[:1]
        identifier = f"{actor}-{scene}-{take}"
        motion = {"id": identifier, "action": scene, "label": label, "actor": actor, "take": take,
                  "fps": fps, "sourceFps": source_fps, "sourcePath": row["sourcePath"],
                  "root": np.round(trans, 5).tolist(), "rootOrient": np.round(pose[:, :3], 5).tolist(),
                  "poseBody": np.round(pose[:, 3:66], 5).tolist()}
    (out_dir / f"{identifier}.json").write_text(json.dumps(motion, separators=(",", ":"), ensure_ascii=False))
    return {"id": identifier, "action": scene, "label": label, "category": category,
            "description": description + "；按原始录制顺序回放", "actor": actor,
            "path": f"/mocap/hdm05-library/{identifier}.json", "sourcePath": row["sourcePath"],
            "frames": len(indices), "duration": round(len(indices) / fps, 3),
            "source": "HDM05 / AMASS SMPL+H"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_manifest", type=Path, help="JSON list with scene, sourcePath and local NPZ path")
    parser.add_argument("--out-dir", type=Path, default=Path("public/mocap/hdm05-library"))
    parser.add_argument("--fps", type=int, default=30)
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows = json.loads(args.source_manifest.read_text())
    motions = [export(row, args.out_dir, args.fps) for row in rows]
    badminton = json.loads(Path("public/mocap/hdm05-badminton/manifest.json").read_text())
    names = {"low_serve": "发短球", "clear": "高远球", "drop": "吊球", "smash": "杀球"}
    for item in badminton["motions"]:
        motions.append({**item, "category": "羽毛球", "label": names[item["action"]],
                        "description": "羽毛球原始录制；可切换单次动作片段",
                        "source": "HDM05 / AMASS SMPL-H"})
    manifest = {"source": "HDM05", "sourceUrl": "https://resources.mpi-inf.mpg.de/HDM05/",
                "motions": motions}
    (args.out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Exported {len(motions)} recordings, {len(set(m['category'] for m in motions))} categories")


if __name__ == "__main__":
    main()
