# Expert backhand capture

Source: **MultiSenseBadminton**, Seong et al., Scientific Data (2024).
Paper: https://www.nature.com/articles/s41597-024-03144-z
Dataset: https://doi.org/10.6084/m9.figshare.c.6725706.v1
Source code: https://github.com/dailyminiii/MultiSenseBadminton

The dataset includes 25 players and forehand clear/backhand drive strokes. Its
skill annotations include an expert group; the public materials do not establish
that these are current professional tour players. The collection has body,
eye-gaze, muscle and insole measurements, not a tracked racket or shuttle.

`expert-backhand-Sub14.json` is a verified extraction of expert-rated stroke #1
from `Data Archive Part2/Sub14/2023-02-03_14-01-19_streamLog_badminton-wearables_Sub14.hdf5`.
It contains 147 frames over 2.304 seconds. The original irregular sample times
are retained; positions are Y-up metres, with quaternions preserved as recorded.
See the JSON `joints` list for the PNS 21-joint order.

Part 2 data is **CC0**, as declared in the dataset's own metadata:
https://api.figshare.com/v2/articles/25383001
Documentation and annotation files are also CC0:
https://api.figshare.com/v2/articles/25383004
The software's MIT licence is separate from the data's CC0 licence.

Download the documented HDF5 member from the official Part 2 ZIP, plus
`Documentations.zip` containing `Annotation Data File.xlsx`. HTTP Range tools
such as `remotezip` can retrieve the single HDF5 member instead of the 21.8GB ZIP.
This extraction path was exercised against the public archive.

```sh
uv run --with h5py --with openpyxl python scripts/export-multisense-clip.py \
  /path/2023-02-03_14-01-19_streamLog_badminton-wearables_Sub14.hdf5 \
  '/path/Annotation Data File.xlsx' \
  public/mocap/multisense-badminton/expert-backhand-Sub14.json
```

Storybook **渲染/球员展示 → Expert Backhand** retargets the actual measured
positions to the same avatar binding as gameplay. It does not retarget the
recorded wrist quaternions; racket orientation is derived from the shared grip.
This is a body-motion reference, not a calibrated racket/contact recording.
The gameplay backhand and lunge remain contact-calibrated procedural motions.

For a complete professional action library, commissioned athlete mocap can add
forehand/backhand lifts, net shots, clears, smashes, lunges and recovery steps.
Capture a racket marker and impact timestamp as well as the body. Authorized
multi-view/video reconstruction is another source, but fast wrist rotation,
occlusion and racket impact need manual correction before gameplay retargeting.
