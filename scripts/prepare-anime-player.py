"""Prepare pixiv's CC0 HairSample_Male VRM as a compact sports avatar.

Usage: uv run --with pillow python scripts/prepare-anime-player.py source.vrm
Preserves authored skin weights, bind lengths, face and hair. Renames humanoid
bones for the existing binder, merges hair draw calls, and drops unused morphs.
"""
from collections import defaultdict
from io import BytesIO
from pathlib import Path
import copy
import json
import struct
import sys
from PIL import Image, ImageOps

data = Path(sys.argv[1]).read_bytes()
json_size = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + json_size])
binary = data[28 + json_size:]
vrm = doc['extensions']['VRM']
assert vrm['meta']['title'] == 'HairSample_Male'
assert vrm['meta']['licenseName'] == 'CC0'

names = {'hips': 'Hips', 'spine': 'Spine', 'chest': 'Spine1',
         'upperChest': 'Spine2', 'neck': 'Neck', 'head': 'Head'}
for side in ['left', 'right']:
    for role, name in [('UpperArm', 'Arm'), ('LowerArm', 'ForeArm'),
                       ('Hand', 'Hand'), ('Shoulder', 'Shoulder'), ('UpperLeg', 'UpLeg'),
                       ('LowerLeg', 'Leg'), ('Foot', 'Foot'), ('Toes', 'ToeBase')]:
        names[side + role] = side.title() + name
    for finger in ['Thumb', 'Index', 'Middle', 'Ring', 'Little']:
        for index, joint in enumerate(['Proximal', 'Intermediate', 'Distal'], 1):
            names[side + finger + joint] = side.title() + 'Hand' + ('Pinky' if finger == 'Little' else finger) + str(index)
for bone in vrm['humanoid']['humanBones']:
    if bone['bone'] in names:
        doc['nodes'][bone['node']]['name'] = names[bone['bone']]

output = bytearray()
views = []
accessors = []
accessor_map = {}


def append_view(payload):
    output.extend(b'\0' * (-len(output) % 4))
    views.append({'buffer': 0, 'byteOffset': len(output), 'byteLength': len(payload)})
    output.extend(payload)
    return len(views) - 1


def keep_accessor(index):
    if index in accessor_map:
        return accessor_map[index]
    accessor = copy.deepcopy(doc['accessors'][index])
    view = doc['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0)
    next_view = append_view(binary[offset:offset + view['byteLength']])
    if 'byteStride' in view:
        views[next_view]['byteStride'] = view['byteStride']
    accessor['bufferView'] = next_view
    accessor_map[index] = len(accessors)
    accessors.append(accessor)
    return len(accessors) - 1


for mesh in doc['meshes']:
    groups = defaultdict(list)
    for primitive in mesh['primitives']:
        # Existing court shoes follow the same foot bones; avoid two pairs.
        if 'Shoes' in doc['materials'][primitive['material']]['name']:
            continue
        key = (primitive['material'], tuple(sorted(primitive['attributes'].items())))
        groups[key].append(primitive)
    merged = []
    for (material, attributes), primitives in groups.items():
        indices = bytearray()
        component = doc['accessors'][primitives[0]['indices']]['componentType']
        width = {5123: 2, 5125: 4}[component]
        for primitive in primitives:
            accessor = doc['accessors'][primitive['indices']]
            assert accessor['componentType'] == component
            view = doc['bufferViews'][accessor['bufferView']]
            offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            indices.extend(binary[offset:offset + accessor['count'] * width])
        accessor = len(accessors)
        accessors.append({'bufferView': append_view(indices), 'componentType': component,
                          'count': len(indices) // width, 'type': 'SCALAR'})
        merged.append({'material': material, 'indices': accessor,
                       'attributes': {key: keep_accessor(value) for key, value in attributes}})
    mesh['primitives'] = merged
    mesh.pop('weights', None)
    mesh.pop('extras', None)
for skin in doc['skins']:
    skin['inverseBindMatrices'] = keep_accessor(skin['inverseBindMatrices'])

used = sorted({primitive['material'] for mesh in doc['meshes'] for primitive in mesh['primitives']})
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        primitive['material'] = used.index(primitive['material'])
doc['materials'] = [doc['materials'][index] for index in used]

images = []
textures = []
texture_map = {}
for material in doc['materials']:
    pbr = material['pbrMetallicRoughness']
    texture_index = pbr['baseColorTexture']['index']
    if texture_index not in texture_map:
        texture = doc['textures'][texture_index]
        image = doc['images'][texture['source']]
        view = doc['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        picture = Image.open(BytesIO(binary[offset:offset + view['byteLength']])).convert('RGBA')
        picture.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        # White jacket takes the home/away colour; dark trousers read as sportswear.
        if 'Tops' in material['name'] or 'Bottoms' in material['name']:
            alpha = picture.getchannel('A')
            gray = ImageOps.grayscale(picture)
            if 'Bottoms' in material['name']:
                gray = gray.point(lambda value: int(24 + value * 0.12))
            picture = Image.merge('RGBA', (gray, gray, gray, alpha))
        encoded = BytesIO()
        picture.save(encoded, format='PNG', optimize=True)
        images.append({'bufferView': append_view(encoded.getvalue()), 'mimeType': 'image/png'})
        textures.append({'source': len(images) - 1, 'sampler': texture.get('sampler', 0)})
        texture_map[texture_index] = len(textures) - 1
    pbr['baseColorTexture']['index'] = texture_map[texture_index]
    pbr['metallicFactor'] = 0
    pbr['roughnessFactor'] = 1
    pbr.pop('metallicRoughnessTexture', None)
    for key in ['normalTexture', 'occlusionTexture', 'emissiveTexture', 'emissiveFactor']:
        material.pop(key, None)
    material.pop('extensions', None)
    if 'Tops' in material['name']:
        material['name'] = 'Player_Jersey'
    else:
        # Authored anime face/hair retain their colours under arena lighting.
        material['extensions'] = {'KHR_materials_unlit': {}}
    material['doubleSided'] = True

doc['asset']['copyright'] = 'HairSample_Male by pixiv Inc., CC0 1.0; sports adaptation by badminton-web'
doc.pop('extensions', None)
doc['extensionsUsed'] = ['KHR_materials_unlit']
doc.pop('extensionsRequired', None)
doc['images'], doc['textures'] = images, textures
doc['accessors'], doc['bufferViews'] = accessors, views
doc['buffers'] = [{'byteLength': len(output)}]
# VRM 0 faces -Z. Keep the source skin and its joints under one +Z-facing root.
root = len(doc['nodes'])
doc['nodes'].append({'name': 'AnimeAthlete', 'rotation': [0, 1, 0, 0], 'children': doc['scenes'][0]['nodes']})
doc['scenes'][0]['nodes'] = [root]
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
output.extend(b'\0' * (-len(output) % 4))
total = 28 + len(encoded) + len(output)
target = Path('public/models/anime-player.glb')
target.write_bytes(struct.pack('<III', 0x46546c67, 2, total) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
                   + struct.pack('<II', len(output), 0x004e4942) + output)
print(f'{target}: {total:,} bytes; {sum(len(m["primitives"]) for m in doc["meshes"])} draw calls')
