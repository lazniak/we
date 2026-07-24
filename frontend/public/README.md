# public/

Static assets served at the site root by `next start`.

## bg-loop.webm / bg-loop.mp4 (not in git)

The ambient background loop, derived from the studio site's `bckg-vid-loop2`.
They are ~3.9 MB each and deployed straight to the VPS, not committed.

To (re)generate from the source on hexart.pl:

```bash
curl -o /tmp/src.webm https://hexart.pl/bckg-vid-loop2.webm
ffmpeg -y -i /tmp/src.webm -vf scale=1280:-2 -c:v libvpx-vp9 -b:v 700k -an \
  -deadline good -cpu-used 2 frontend/public/bg-loop.webm
ffmpeg -y -i /tmp/src.webm -vf scale=1280:-2 -c:v libx264 -profile:v high \
  -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an frontend/public/bg-loop.mp4
```

`BackgroundVideo.tsx` references them and degrades gracefully if absent.

## vendor/ (not in git)

On-demand viewer libraries, loaded only when a matching file is previewed:

- `three.min.js` (r0.149, UMD global `THREE`) — 360 panorama/video sphere
- `o3dv.min.js` (online-3d-viewer 0.16, global `OV`) — 3D models
- `niivue.umd.js` (@niivue/niivue 0.44, global `niivue`) — DICOM/NIfTI medical

Deployed straight to the VPS. To fetch:

```bash
cd frontend/public/vendor
curl -fsSLO https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/online-3d-viewer@0.16.0/build/engine/o3dv.min.js -o o3dv.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/@niivue/niivue@0.44.2/dist/niivue.umd.js -o niivue.umd.js
```
