# 🕺 Pose Detection

*Thirty-three body keypoints, tracked in real time, entirely in your browser — no cloud, no signup, no "upload your video to our servers and trust us." Then it dares you to flap your arms like a maniac to prove it works.*

This is a clean, modular wrapper around Google's **MediaPipe Pose Landmarker**, plus a small Express server, an optional REST API for when you want the pose data somewhere else, and — because staring at a skeleton overlay gets old fast — **two games you play with your actual body.**

It's the pose-shaped sibling of [`hand_detection`](https://github.com/berad217/hand_detection) — same idea, different body part.

---

## 🎮 The part you'll actually show people

Two demos, both controlled entirely by your webcam. No keyboard, no mouse — just you and your questionable coordination.

**✈ Wings** (`client/flight-game.html`) — You *are* the plane. Hold your elbows out like wings, **tilt** to bank, and thread the gates. Dip your left wing, you go left. It's the closest you'll get to being a paper airplane without the papercut.

**🐦 Flapper** (`client/bird-game.html`) — You *are* the bird. **Flap both arms together** — a real synchronized downstroke — for lift, because gravity is not on your side. Tilt to steer. One arm alone does nothing; the bird is not impressed by half-effort.

Each game reads your pose about once per camera frame and runs the game at a locked 60 fps on a *separate* loop (more on that smugness below). Each also has a live **tuning panel** — sliders for feel, a model picker (lite/full/heavy), and a 1-Euro jitter filter you can dial in for your camera and your lighting. When it feels right, hit **Copy values** and bake them in.

> **⚠️ The one gotcha, up front:** browsers only hand over the camera in a **secure context** — `https://` or `http://localhost`. Run the games from `localhost` on the machine hosting the server and you're golden. Open them from a LAN IP (`http://192.168.x.x`) and the browser will politely refuse the camera — that's a browser rule, not a bug. The in-game error says as much.

---

## 🔬 ...and the serious part

Under the games is an actual, tested pose-detection module you can build on:

- **Real-time tracking** of all 33 MediaPipe keypoints
- **Three models** — `lite` (5.5 MB), `full` (9 MB), `heavy` (29 MB) — all committed to the repo, so a fresh clone runs with **zero download dance**
- **1-Euro filtering** that kills jitter without adding lag (the good kind of smoothing — fast motion passes through, resting shake gets damped)
- **Gesture recognition** — T-pose, hands-up, wave, squat, jump… discrete events for when you don't want to babysit raw keypoints
- **Record & replay** sessions to JSON/CSV
- **Modular architecture** — detector → filter → data bus → consumers. Import the pieces you want; ignore the rest.
- **REST API** with an SSE stream, for piping poses into a game engine, a Python script, whatever
- **Config-driven** — one YAML file; no magic numbers buried in code
- **445 tests**, because "it worked on my machine" is not a test strategy

---

## 🚀 Quick start (it's genuinely this short)

```bash
git clone https://github.com/berad217/pose_detection.git
cd pose_detection
npm install
npm start
```

Open **http://localhost:3939**, allow the camera, and you're tracking. Want to play instead of watch? Go to `/flight-game.html` or `/bird-game.html`.

**No model-download step.** The three `.task` files ship in `models/`, so cloning is enough. Only the MediaPipe WASM runtime loads from a CDN — everything else is local. (Deleted the models by accident? `npm run download-models` puts them back.)

---

## 🧩 Use it as a library

The detector, filter, and bus are plain ES modules with no server dependency. Drop them into your own page:

```javascript
import { PoseDetector } from './client/js/poseDetector.js';
import { FilterPipeline } from './client/js/filterPipeline.js';

const detector = new PoseDetector({
  detector: { modelPath: '/models/pose_landmarker_full.task', runningMode: 'VIDEO', numPoses: 1 },
  coordinates: { normalized: true }
});
await detector.initialize();

const pipeline = new FilterPipeline({
  filtering: { enabled: true, oneEuroConfig: { minCutoff: 1.0, beta: 0.007 } },
  performance: { targetFps: 30 }
});

// per frame:
let result = detector.detect(videoEl, performance.now());
result = pipeline.process(result);   // 1-Euro smoothed, same shape in and out
// result.pose.normalized => 33 keypoints { index, name, x, y, z, visibility }
```

Full module + API reference lives in [`documentation/API.md`](documentation/API.md). And honestly, the two games are single self-contained HTML files — read `client/flight-game.html` as a worked example of "pose in, gameplay out, no framework."

---

## 🌐 REST API (optional)

Flip `api.enabled: true` in [`config/config.yaml`](config/config.yaml) and pose data is available over HTTP:

- `GET /api/pose/current` — the latest pose
- `GET /api/pose/stream` — Server-Sent Events, real-time

Optional API-key auth, a CORS allow-list, and rate limiting are all in the config. Details in [`documentation/API.md`](documentation/API.md).

---

## ⚙️ Configuration

Everything lives in [`config/config.yaml`](config/config.yaml) — model choice, filter strength, display mode, API settings. Nothing about behavior is hard-coded; the example file *is* the documentation. The bits you'll touch most:

```yaml
detector:
  modelPath: "./models/pose_landmarker_full.task"   # lite | full | heavy
filtering:
  oneEuroConfig:
    minCutoff: 1.0     # lower = smoother, more lag
    beta: 0.007        # higher = snappier on fast motion
display:
  mode: "overlay"      # overlay | stickFigure | keypoints | none
```

Full reference: [`documentation/CONFIGURATION.md`](documentation/CONFIGURATION.md).

---

## 🏗️ How it's wired (the bragging section)

```
Webcam ─▶ PoseDetector ─▶ FilterPipeline ─▶ DataBus ─┬─▶ Display
                                                     ├─▶ Storage (record / replay)
                                                     └─▶ REST API
```

The rule the whole thing enforces: **modules don't reach past their neighbors.** The detector doesn't know Display exists. The filter doesn't know MediaPipe exists. Everyone talks through the DataBus. That's what lets you rip out the display and run headless, or swap MediaPipe for something else, without touching the rest of the stack.

**The smug bit:** in the games, pose **detection** runs at camera rate (whatever your webcam and lighting allow — often 15–30 fps in a dim room) while **rendering** runs at a locked 60 fps on its own loop. They're decoupled, so a slow camera makes tracking coarser but *never* makes the game stutter. Turn the lights down and the camera slows; the plane still banks like butter.

---

## 🧪 Tests & development

```bash
npm test              # 445 tests, ~1.5s
npm run test:watch    # re-run on change
npm run dev           # server with auto-reload
```

Tests mock MediaPipe, so no webcam or GPU is needed in CI. One thing worth knowing: **green tests don't prove the browser app works** — MediaPipe and `getUserMedia` are mocked out, so the only real proof is opening it in an actual browser and wiggling. Learned that one the hard way.

---

## 🙏 Credits

- **[MediaPipe](https://developers.google.com/mediapipe)** — Google's on-device ML; does the actual heavy lifting
- **1-Euro Filter** — Géry Casiez, Nicolas Roussel & Daniel Vogel ([the paper](https://gery.casiez.net/1euro/)) — the elegant little filter that makes noisy input feel good
- Sibling project: [`hand_detection`](https://github.com/berad217/hand_detection) — the same treatment for hands

---

## 📄 License

MIT. Do what you like with it; just don't blame me if you pull something flapping.

---

*Built for the small joy of watching a computer figure out that you're standing there.*
