"""Prepare the official CC0 Superhero Male for the badminton renderer.

Usage: python3 scripts/prepare-quaternius-player.py <Godot - UE directory> <UAL1_Standard.glb>
Keeps the source body and weights, adapts kit materials and names, and replaces
bare foot faces with the renderer's existing court shoes.
"""
import json
import pathlib
import struct
import sys

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
    width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
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
                            'Player_Jersey', 'Player_Shorts'], colors)
]
for mesh in gltf['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {key: value for key, value in primitive['attributes'].items()
                                   if key in ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']}
body = gltf['meshes'][2]
primitive = body['primitives'][0]
positions = values(primitive['attributes']['POSITION'])
skin_colors = bytearray()
for x, y, z in positions:
    hair = y > 1.73 and z < 0.055
    skin_colors.extend([38, 29, 25, 255] if hair else [210, 159, 118, 255])
skin = append(skin_colors, 5121, 'VEC4', len(positions), True)
groups = {material: [] for material in [2, 3, 4, 5]}
indices = [value[0] for value in values(primitive['indices'])]
for offset in range(0, len(indices), 3):
    triangle = indices[offset:offset + 3]
    x = sum(abs(positions[i][0]) for i in triangle) / 3
    y = sum(positions[i][1] for i in triangle) / 3
    material = 5 if y < 0.16 else 4 if 0.63 < y < 1.03 else 3 if 1.03 <= y < (1.56 if x > 0.09 else 1.50) and x < 0.42 else 2
    groups[material].extend(triangle)
body['primitives'] = []
for material, indices in groups.items():
    # The renderer reuses its court shoes and socks at the model's ankle bones.
    if material == 5:
        continue
    attributes = dict(primitive['attributes'])
    if material == 2:
        attributes['COLOR_0'] = skin
    data = struct.pack('<' + 'H' * len(indices), *indices)
    body['primitives'].append({'attributes': attributes, 'indices': append(data, 5123, 'SCALAR', len(indices)), 'material': material})
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
    original = next(animation for animation in animations['animations'] if animation['name'] == source_name)
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
