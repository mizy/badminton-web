"""Extract one expert backhand stroke, preserving measured joint data.

Usage: uv run --with h5py --with openpyxl python scripts/export-multisense-clip.py
       recording_Sub14.hdf5 'Annotation Data File.xlsx' output.json
This is capture data for retargeting/reference, not a contact-calibrated game clip.
"""
from pathlib import Path
import json
import re
import sys
import h5py
import numpy as np
from openpyxl import load_workbook

recording, annotations, output = map(Path, sys.argv[1:4])
subject = re.search(r'Sub\d{2}', recording.name).group()
joints = ['Hips', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot',
          'Spine', 'Spine1', 'Spine2', 'Neck', 'Neck1', 'Head', 'RightShoulder', 'RightArm',
          'RightForeArm', 'RightHand', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand']
book = load_workbook(annotations, read_only=True, data_only=True)
with h5py.File(recording) as file:
    stream = file['pns-joint']
    times = np.asarray(stream['global-position/time_s']).reshape(-1)
    row = next(row for row in book.active.values if row[0] == subject
               and row[4:6] == ('Backhand Driving', 'Expert') and row[9] == 'Good'
               and times[0] <= row[1] < row[2] <= times[-1])
    start, stop = np.searchsorted(times, [row[1], row[2]])
    positions = np.asarray(stream['global-position/data'][start:stop]).reshape(-1, 21, 3) / 100
    quaternions = np.asarray(stream['quaternion/data'][start:stop]).reshape(-1, 21, 4)
    assert np.isfinite(positions).all() and np.isfinite(quaternions).all()
    result = {
        'source': 'MultiSenseBadminton', 'sourceDoi': '10.6084/m9.figshare.c.6725706.v1',
        'license': 'CC0-1.0', 'subject': subject, 'skill': row[5], 'stroke': row[4],
        'strokeNumber': row[3], 'sourceRecording': recording.name,
        'units': 'metres', 'upAxis': 'Y', 'joints': joints,
        'time': np.round(times[start:stop] - times[start], 6).tolist(),
        'globalPositions': np.round(positions, 6).tolist(),
        'recordedQuaternions': np.round(quaternions, 6).tolist(),
    }
book.close()
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, separators=(',', ':')))
print(f'{output}: {stop-start} frames, {result["time"][-1]:.3f}s, 21 joints, expert stroke #{row[3]}')
