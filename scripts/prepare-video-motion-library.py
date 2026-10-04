"""Curate existing 17-joint video estimates into one fixed BVH skeleton.

uv run --with numpy --with scipy python scripts/prepare-video-motion-library.py --input PATH
Input files: front-right/front-left/back-right/back-left.motionbert.json.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path, default=Path(__file__).resolve().parents[1] / 'public/mocap/video-poses/sources')
args = parser.parse_args()
output = Path(__file__).resolve().parents[1] / 'public/mocap/video-poses'
(output / 'sources').mkdir(parents=True, exist_ok=True)

# All exports use this single metre-sized, Y-up hierarchy and intrinsic Z-X-Y channels.
BONES = [('Hips', -1, [0, 0, 0]),
    ('RightUpLeg', 0, [-.105, 0, 0]), ('RightLeg', 1, [0, -.43, 0]), ('RightFoot', 2, [0, -.43, 0]),
    ('LeftUpLeg', 0, [.105, 0, 0]), ('LeftLeg', 4, [0, -.43, 0]), ('LeftFoot', 5, [0, -.43, 0]),
    ('Spine', 0, [0, .19, 0]), ('Chest', 7, [0, .18, 0]), ('Neck', 8, [0, .17, 0]), ('Head', 9, [0, .15, 0]),
    ('LeftArm', 8, [.19, .17, .04]), ('LeftForeArm', 11, [0, -.34, 0]), ('LeftHand', 12, [0, -.38, 0]),
    ('RightArm', 8, [-.19, .17, .04]), ('RightForeArm', 14, [0, -.34, 0]), ('RightHand', 15, [0, -.38, 0])]
MOTIONS = [
    ('front-forehand', '正手上网与回位', '前场', 'front-right', 0, None),
    ('front-backhand', '反手上网与回位', '前场', 'front-left', 0, None),
    ('rear-forehand', '正手后场移动', '后场', 'back-right', 0, None),
    ('rear-backhand', '反手侧转身与回位', '后场', 'back-left', 0, None),
    ('ready-start', '启动准备', '启动与交叉步', 'front-right', 0, 12),
    ('cross-approach', '交叉上网', '启动与交叉步', 'front-right', 4, 26),
    ('forehand-recover', '正手跨步后回位', '回位', 'front-right', 41, None),
    ('backhand-recover', '反手跨步后回位', '回位', 'front-left', 49, None),
]

def unit(vector):
    length = np.linalg.norm(vector)
    if length < 1e-6:
        raise ValueError('Degenerate captured segment')
    return vector / length

def body(left, right, up):
    y = unit(up)
    x = left - right
    x = unit(x - y * np.dot(x, y))
    return Rotation.from_matrix(np.column_stack((x, y, np.cross(x, y))))

def aim(direction):
    start, end = np.array([0., -1., 0.]), unit(direction)
    cross, dot = np.cross(start, end), np.dot(start, end)
    if dot < -.999999:
        return Rotation.from_rotvec([np.pi, 0, 0])
    if dot > .999999:
        return Rotation.identity()
    return Rotation.from_rotvec(unit(cross) * np.arctan2(np.linalg.norm(cross), dot))

def hierarchy(index, indent=0):
    name, parent, offset = BONES[index]
    pad = '  ' * indent
    rows = [pad + ('ROOT ' if parent == -1 else 'JOINT ') + name, pad + '{',
        pad + '  OFFSET ' + ' '.join(map(str, offset)),
        pad + '  CHANNELS ' + ('6 Xposition Yposition Zposition ' if parent == -1 else '3 ') + 'Zrotation Xrotation Yrotation']
    children = [i for i, bone in enumerate(BONES) if bone[1] == index]
    for child in children:
        rows += hierarchy(child, indent + 1)
    if not children:
        tip = [0, -.07, .18] if name.endswith('Foot') else [0, .12, 0] if name == 'Head' else [0, -.08, 0]
        rows += [pad + '  End Site', pad + '  {', pad + '    OFFSET ' + ' '.join(map(str, tip)), pad + '  }']
    return rows + [pad + '}']

sources, poses = {}, {}
for name in dict.fromkeys(motion[3] for motion in MOTIONS):
    source = json.loads((args.input / f'{name}.motionbert.json').read_text())
    assert source['fps'] == 25
    p = np.array(source['frames'])
    assert p.ndim == 3 and p.shape[1:] == (17, 3) and np.isfinite(p).all()
    (output / 'sources' / f'{name}.motionbert.json').write_text(json.dumps(source, separators=(',', ':')))
    frames = []
    for row in p:
        h, c = row[0], row[8]
        frames.append([h, row[1], row[2], row[3], row[4], row[5], row[6], h + (c-h)*.25,
            h + (c-h)*.5, h + (c-h)*.75, c, c, row[10], row[10] + [0, .12, 0],
            row[14], row[15], row[16], row[16], row[11], row[12], row[13]])
    capture = {'time': [i / 25 for i in range(len(p))], 'globalPositions': np.round(frames, 6).tolist()}
    (output / f'{name}.json').write_text(json.dumps(capture, separators=(',', ':')))
    lateral = p[0, 11] - p[0, 14]
    heading = Rotation.from_rotvec([0, np.arctan2(lateral[2], lateral[0]), 0])
    poses[name] = heading.apply(p.reshape(-1, 3)).reshape(p.shape)
    sources[name] = {'url': source['source'], 'start': source['start'],
        'capture': f'mocap/video-poses/{name}.json'}

motions = []
for id, label, category, source, first, last in MOTIONS:
    p = poses[source]
    last = len(p) - 1 if last is None else last
    assert 0 <= first < last < len(p)
    frames = []
    for row in p[first:last+1]:
        hip = body(row[4], row[1], [0, 1, 0])
        chest = body(row[11], row[14], row[8] - row[0])
        world = [hip, aim(row[2]-row[1]), aim(row[3]-row[2]), hip,
            aim(row[5]-row[4]), aim(row[6]-row[5]), hip, chest, chest, chest, chest,
            aim(row[12]-row[11]), aim(row[13]-row[12]), aim(row[13]-row[12]),
            aim(row[15]-row[14]), aim(row[16]-row[15]), aim(row[16]-row[15])]
        values = list(row[0])
        for i, (_, parent, _) in enumerate(BONES):
            local = world[i] if parent == -1 else world[parent].inv() * world[i]
            values += list(local.as_euler('ZXY', degrees=True))
        frames.append(values)
    bvh = ['HIERARCHY', *hierarchy(0), 'MOTION', f'Frames: {len(frames)}', 'Frame Time: 0.04000000']
    bvh += [' '.join(f'{v:.6f}' for v in frame) for frame in frames]
    (output / f'{id}.bvh').write_text('\n'.join(bvh) + '\n')
    motions.append({'id': id, 'label': label, 'category': category, 'source': source,
        'fromFrame': first, 'toFrame': last, 'bvh': f'mocap/video-poses/{id}.bvh'})
    print(id, len(frames), 'frames')

manifest = {'model': 'models/anime-motion-library.glb', 'fps': 25, 'sources': sources, 'motions': motions}
(output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
