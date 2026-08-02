#!/usr/bin/env python3
import argparse
import io
import json
import re
import zipfile
from pathlib import Path

import numpy as np


ACTION_BY_TAKE = {
    "01": ("low_serve", "Low serve"),
    "02": ("clear", "Clear"),
    "03": ("drop", "Drop"),
    "04": ("smash", "Smash"),
}


def parse_args():
    parser = argparse.ArgumentParser(description="Extract HDM05 03-11 badminton AMASS motions to JSON.")
    parser.add_argument("zip_path", type=Path, help="Path to HDM05.zip")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("public/mocap/hdm05-badminton"),
        help="Output directory for JSON motion files",
    )
    parser.add_argument("--fps", type=int, default=30, help="Target playback FPS")
    return parser.parse_args()


def round_rows(array, decimals=5):
    return np.round(array.astype(np.float32), decimals).tolist()


def motion_id(actor, take, action):
    return f"{actor}-{take}-{action.replace('_', '-')}"


def main():
    args = parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    pattern = re.compile(r"^HDM05/MPI_HDM05/([^/]+)/HDM_\1_03-11_(\d{2})_120_poses\.npz$")
    manifest = {
        "source": "HDM05 3-11 Badminton, AMASS SMPL-H pose parameters",
        "fps": args.fps,
        "motions": [],
    }

    with zipfile.ZipFile(args.zip_path) as archive:
        for name in sorted(archive.namelist()):
            match = pattern.match(name)
            if not match:
                continue
            actor, take = match.groups()
            if take not in ACTION_BY_TAKE:
                continue
            action, label = ACTION_BY_TAKE[take]
            data = np.load(io.BytesIO(archive.read(name)), allow_pickle=False)
            source_fps = int(round(float(data["mocap_frame_rate"])))
            step = max(1, round(source_fps / args.fps))
            frame_indices = np.arange(0, data["trans"].shape[0], step)
            trans = data["trans"][frame_indices]
            trans = trans - trans[:1]

            identifier = motion_id(actor, take, action)
            file_name = f"{identifier}.json"
            motion = {
                "id": identifier,
                "action": action,
                "label": label,
                "actor": actor,
                "take": take,
                "fps": args.fps,
                "sourceFps": source_fps,
                "sourcePath": name,
                "root": round_rows(trans),
                "rootOrient": round_rows(data["root_orient"][frame_indices]),
                "poseBody": round_rows(data["pose_body"][frame_indices]),
            }
            with (args.out_dir / file_name).open("w", encoding="utf-8") as handle:
                json.dump(motion, handle, separators=(",", ":"))

            manifest["motions"].append({
                "id": identifier,
                "action": action,
                "label": label,
                "actor": actor,
                "take": take,
                "frames": int(len(frame_indices)),
                "duration": round(len(frame_indices) / args.fps, 3),
                "path": f"/mocap/hdm05-badminton/{file_name}",
                "sourcePath": name,
            })

    with (args.out_dir / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")

    print(f"Wrote {len(manifest['motions'])} motions to {args.out_dir}")


if __name__ == "__main__":
    main()
