"""Prepare the official CC0 Superhero Male for the badminton renderer.

Usage: python3 scripts/prepare-quaternius-player.py <Godot - UE directory> <UAL1_Standard.glb>
Keeps the source body and weights, adapts kit materials and names, and replaces
bare foot faces with the renderer's existing court shoes.
Requires NumPy. Outputs a metre-compatible GLB and its UV sports-kit PNG.
"""
import json
import pathlib
import struct
import sys
import zlib
import numpy as np

source = pathlib.Path(sys.argv[1])
gltf = json.loads((source / 'Superhero_Male_FullBody.gltf').read_text())
binary = bytearray((source / gltf['buffers'][0]['uri']).read_bytes())

names = {'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1',
         'spine_03': 'Spine2', 'neck_01': 'Neck'}
for side, prefix in [('r', 'Right'), ('l', 'Left')]:
    for bone, name in [('clavicle', 'Shoulder'), ('upperarm', 'Arm'),
                       ('lowerarm', 'ForeArm'), ('hand', 'Hand'), ('thigh', 'UpLeg'),
                       ('calf', 'Leg'), ('foot', 'Foot'), ('ball', 'ToeBase')]:
        names[f'{bone}_{side}'] = prefix + name
    for finger in ['thumb', 'index', 'middle', 'ring', 'pinky']:
        for joint in range(1, 4):
            names[f'{finger}_{joint:02}_{side}'] = prefix + 'Hand' + finger.title() + str(joint)
for node in gltf['nodes']:
    node['name'] = names.get(node['name'], node['name'])


def values(index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    kind, size = {5121: ('B', 1), 5123: ('H', 2), 5126: ('f', 4)}[accessor['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', size * width)
    return [struct.unpack_from('<' + kind * width, binary, start + i * stride) for i in range(accessor['count'])]


def append(data, component, shape, count, normalized=False):
    binary.extend(b'\0' * (-len(binary) % 4))
    view = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)})
    binary.extend(data)
    accessor = {'bufferView': view, 'componentType': component, 'count': count, 'type': shape}
    if normalized:
        accessor['normalized'] = True
    gltf['accessors'].append(accessor)
    return len(gltf['accessors']) - 1


# A sports kit on the existing body, with no added geometry or downloaded textures.
colors = [[0.09, 0.055, 0.035, 1], [0.82, 0.79, 0.68, 1], [1, 1, 1, 1],
          [0.18, 0.40, 0.80, 1], [0.045, 0.065, 0.10, 1]]
gltf['materials'] = [
    {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': color, 'metallicFactor': 0, 'roughnessFactor': 0.85}}
    for name, color in zip(['Player_Brows', 'Player_Eyes', 'Player_Skin',
                            'Player_Kit', 'Player_Shorts'], colors)
]
for mesh in gltf['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {key: value for key, value in primitive['attributes'].items()
                                   if key in ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']}
body = gltf['meshes'][2]
primitive = body['primitives'][0]
positions = values(primitive['attributes']['POSITION'])
uv = np.array(values(primitive['attributes']['TEXCOORD_0']))
xyz = np.array(positions)
indices = [value[0] for value in values(primitive['indices'])]
size = 1024
atlas = np.full((size, size, 3), [218, 166, 124], dtype=np.uint8)
covered = np.zeros((size, size), dtype=bool)
kept = []
for offset in range(0, len(indices), 3):
    triangle = indices[offset:offset + 3]
    points = xyz[triangle]
    if points[:, 1].mean() < 0.16:
        continue
    kept.extend(triangle)
    coords = uv[triangle] * (size - 1)
    lo = np.maximum(0, np.floor(coords.min(axis=0) - 1).astype(int))
    hi = np.minimum(size - 1, np.ceil(coords.max(axis=0) + 1).astype(int))
    xx, yy = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
    a, b, c = coords
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-8:
        continue
    wa = ((b[1] - c[1]) * (xx - c[0]) + (c[0] - b[0]) * (yy - c[1])) / denominator
    wb = ((c[1] - a[1]) * (xx - c[0]) + (a[0] - c[0]) * (yy - c[1])) / denominator
    wc = 1 - wa - wb
    mask = (wa >= -0.025) & (wb >= -0.025) & (wc >= -0.025)
    point = wa[..., None] * points[0] + wb[..., None] * points[1] + wc[..., None] * points[2]
    x, y, z = np.abs(point[..., 0]), point[..., 1], point[..., 2]
    color = np.full((*xx.shape, 3), [218, 166, 124], dtype=np.uint8)
    jersey = (y >= 1.04) & (y < np.where(x < 0.11, 1.50, 1.55)) & (x < 0.42)
    shorts = (y > 0.64) & (y < 1.04)
    color[jersey] = [211, 52, 65]  # Saturated red is recolored by createTeamTexture.
    weave = ((xx + yy) % 4 == 0) & jersey
    color[weave] = [195, 45, 58]
    color[shorts] = [26, 37, 57]
    trim = ((abs(y - 1.04) < 0.012) | (abs(y - 0.65) < 0.008)) & (shorts | jersey)
    stripe = jersey & (x > 0.195) & (x < 0.214) & (y < 1.43)
    color[trim | stripe] = [225, 233, 235]
    digit = np.array([[1, 1, 1, 1, 1], [0, 0, 0, 0, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 0], [0, 1, 0, 0, 0]])
    dx = np.floor((point[..., 0] + 0.055) / 0.022).astype(int)
    dy = np.floor((1.39 - y) / 0.022).astype(int)
    number = jersey & (z < -0.06) & (dx >= 0) & (dx < 5) & (dy >= 0) & (dy < 7)
    number &= digit[np.clip(dy, 0, 6), np.clip(dx, 0, 4)] == 1
    color[number] = [238, 242, 244]
    color[(y > 1.73) & (z < 0.055)] = [43, 31, 24]
    atlas[yy[mask], xx[mask]] = color[mask]
    covered[yy[mask], xx[mask]] = True
# Padding outside UV islands prevents skin-coloured seams under mip filtering.
for _ in range(6):
    for axis, direction in [(0, 1), (0, -1), (1, 1), (1, -1)]:
        adjacent = np.roll(covered, direction, axis)
        fill = adjacent & ~covered
        atlas[fill] = np.roll(atlas, direction, axis=axis)[fill]
        covered[fill] = True
primitive['indices'] = append(struct.pack('<' + 'H' * len(kept), *kept), 5123, 'SCALAR', len(kept))
primitive['material'] = 3
gltf['materials'][3]['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1]

def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

rows = b''.join(b'\0' + row.tobytes() for row in atlas)
png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>2I5B', size, size, 8, 2, 0, 0, 0))
png += png_chunk(b'IDAT', zlib.compress(rows, 9)) + png_chunk(b'IEND', b'')
pathlib.Path(__file__).resolve().parents[1].joinpath('public/models/quaternius-player.png').write_bytes(png)
for key in ['images', 'textures', 'samplers']:
    gltf.pop(key, None)

# Keep just the six leg rotation tracks for idle, walking and sprinting.
library = pathlib.Path(sys.argv[2]).read_bytes()
json_size = struct.unpack_from('<I', library, 12)[0]
animations = json.loads(library[20:20 + json_size])
animation_data = library[28 + json_size:]
target_nodes = {node['name']: index for index, node in enumerate(gltf['nodes'])}
copied = {}
gltf['animations'] = []
for source_name, name in [('Idle_Loop', 'idle'), ('Walk_Loop', 'walk'), ('Sprint_Loop', 'run')]:
    original = next(animation for animation in animations['animations'] if animation['name'] in [source_name, name])
    clip = {'name': name, 'channels': [], 'samplers': []}
    for channel in original['channels']:
        bone = animations['nodes'][channel['target']['node']]['name']
        bone = names.get(bone, bone)
        if channel['target']['path'] != 'rotation' or bone not in ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']:
            continue
        sampler = dict(original['samplers'][channel['sampler']])
        for key in ['input', 'output']:
            index = sampler[key]
            if index not in copied:
                accessor = animations['accessors'][index]
                view = animations['bufferViews'][accessor['bufferView']]
                start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
                size = accessor['count'] * (4 if accessor['type'] == 'SCALAR' else 16)
                copied[index] = append(animation_data[start:start + size], 5126, accessor['type'], accessor['count'])
                for bound in ['min', 'max']:
                    if bound in accessor:
                        gltf['accessors'][copied[index]][bound] = accessor[bound]
            sampler[key] = copied[index]
        clip['channels'].append({'sampler': len(clip['samplers']), 'target': {'node': target_nodes[bone], 'path': 'rotation'}})
        clip['samplers'].append(sampler)
    gltf['animations'].append(clip)
gltf['asset']['copyright'] = 'Quaternius — CC0 1.0 Universal; badminton kit material adaptation'
gltf['buffers'] = [{'byteLength': len(binary)}]
document = json.dumps(gltf, separators=(',', ':')).encode()
document += b' ' * (-len(document) % 4)
binary.extend(b'\0' * (-len(binary) % 4))
output = pathlib.Path(__file__).resolve().parents[1] / 'public/models/quaternius-player.glb'
output.write_bytes(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(document) + 8 + len(binary))
                   + struct.pack('<II', len(document), 0x4E4F534A) + document
                   + struct.pack('<II', len(binary), 0x004E4942) + binary)
print(f'{output}: {output.stat().st_size} bytes')
