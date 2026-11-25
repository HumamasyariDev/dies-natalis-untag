# MediaPipe Pose Detection Module — Specification

**Version**: 1.0
**Date**: November 22, 2025
**Author**: Infrastructure Module Sprint
**Last Updated**: November 22, 2025 — Added Sprints 8-12 (Enhancement Features)

Clean, modular wrapper around MediaPipe Pose Landmarker for real-time body tracking with configurable visualization, filtering, and data export.

---

## 1. High-Level Architecture

**Runtime assumptions:**

- Runs as: Web application (Node.js + Express backend, vanilla JS frontend)
- Framework: MediaPipe Tasks Vision (JavaScript)
- Platform: Local server for file system access
- Data model: JSON config + optional session storage
- GPU: Leverages WebGL/WebGPU through browser

**Core components:**

1. **Pose Detector Core** — MediaPipe wrapper with lifecycle management
2. **Filter Pipeline** — Smoothing/filtering layer (1-euro filter MVP, extensible)
3. **Data Bus** — Central hub for keypoint data distribution
4. **Display Module** — Visualization and GUI controls
5. **Storage Module** — Session recording/replay (stretch goal)
6. **Config Manager** — YAML-based configuration with hot reload
7. **REST API** — HTTP interface for external apps (stretch goal)

**Architecture:**
```
[MediaPipe Pose Landmarker]
          ↓
   [Filter Pipeline] ← 1-euro filter (extensible)
          ↓
      [Data Bus] ← distributes keypoint data
          ↓
   ├─> [Display Module] ← GUI, visualizations, toggles
   ├─> [Storage Module] ← record/replay (stretch)
   ├─> [REST API] ← HTTP endpoint (stretch)
   └─> [Module Export] ← Direct import for JS apps
```

All components communicate via well-defined interfaces. Display is pluggable — another app can import core without GUI.

---

## 2. Directory & File Layout

```text
/mediapipe-pose
  /server
    index.js              // Express server
    routes/
      api.js              // API endpoints (stretch)
  /client
    index.html            // Main GUI
    /js
      main.js             // App entry point
      poseDetector.js     // MediaPipe wrapper
      filterPipeline.js   // Smoothing layer
      dataBus.js          // Event bus for keypoints
      displayModule.js    // Visualization
      configManager.js    // Config handling
    /css
      styles.css
  /models                 // Pre-downloaded MediaPipe models
    pose_landmarker_lite.task
    pose_landmarker_full.task
    pose_landmarker_heavy.task
  /config
    config.yaml           // Main configuration
    config.example.yaml   // Template
  /sessions               // Recorded sessions (stretch)
  /tests
    poseDetector.test.js
    filterPipeline.test.js
    dataBus.test.js
  package.json
  README.md
```

---

## 3. Configuration Schema

**Example: `/config/config.yaml`**

```yaml
# MediaPipe Pose Detection Configuration

# Detector settings
detector:
  modelPath: "./models/pose_landmarker_lite.task"  # lite | full | heavy
  runningMode: "VIDEO"                              # IMAGE | VIDEO | LIVE_STREAM
  numPoses: 1                                       # MVP: 1 only, designed for multi
  minDetectionConfidence: 0.5                       # 0.0 - 1.0
  minTrackingConfidence: 0.5                        # 0.0 - 1.0
  minPosePresenceConfidence: 0.5                    # 0.0 - 1.0

# Performance
performance:
  targetFps: 30
  enableGpu: true

# Input
input:
  source: "webcam"                                  # webcam | video | image
  videoPath: null                                   # For batch processing (stretch)
  webcamId: 0                                       # Device ID

# Filtering/Smoothing
filtering:
  enabled: true
  type: "oneEuro"                                   # oneEuro (MVP), extensible later
  oneEuroConfig:
    minCutoff: 1.0
    beta: 0.007
    dCutoff: 1.0

# Coordinate systems (which to provide)
coordinates:
  normalized: true     # 0-1 range, resolution independent
  pixel: true          # Actual screen pixels
  world: false         # 3D relative to camera (stretch)

# Visualization
display:
  enabled: true        # Set false for headless/module-only mode
  mode: "overlay"      # "overlay" | "stickFigure" | "keypoints" | "none"
  
  overlay:
    showWebcam: true
    showSkeleton: true
    showKeypoints: true
    keypointRadius: 5
    lineWidth: 2
    confidenceColorCoding: false  # Color by confidence (stretch)
  
  stickFigure:
    backgroundColor: "#000000"
    figureColor: "#00FF00"
    showKeypoints: true
  
  keypoints:
    showAll: true
    visibleJoints: "all"  # "all" or array like ["nose", "left_shoulder", "right_shoulder"]
    radius: 5

# Storage (stretch goal)
storage:
  enabled: false
  format: "json"                           # json | csv
  sessionPath: "./sessions"
  autoSave: false
  includeTimestamps: true
  includeConfidence: true

# API (stretch goal)
api:
  enabled: false
  port: 3001
  endpoints:
    current: "/api/pose/current"           # GET current pose
    stream: "/api/pose/stream"             # SSE stream
```

**Schema rules:**
- Missing keys: Use defaults from example config
- Unknown keys: Warn but ignore
- Validation: On load, validate all numeric ranges and enum values
- Hot reload: Watch config file for changes (optional enhancement)

---

## 4. Data Schemas

### 4.1 Pose Keypoints Output

**Structure provided by Data Bus:**

```json
{
  "timestamp": 1700000000000,
  "fps": 29.8,
  "detected": true,
  "pose": {
    "normalized": [
      {
        "index": 0,
        "name": "nose",
        "x": 0.512,
        "y": 0.234,
        "z": -0.045,
        "visibility": 0.98,
        "presence": 0.99
      },
      // ... 32 more keypoints
    ],
    "pixel": [
      {
        "index": 0,
        "name": "nose", 
        "x": 327,
        "y": 149,
        "z": -0.045,
        "visibility": 0.98,
        "presence": 0.99
      },
      // ... 32 more keypoints
    ],
    "world": null  // Stretch goal
  }
}
```

**33 Keypoint names (MediaPipe Pose order):**
```
0: nose
1: left_eye_inner, 2: left_eye, 3: left_eye_outer
4: right_eye_inner, 5: right_eye, 6: right_eye_outer
7: left_ear, 8: right_ear
9: mouth_left, 10: mouth_right
11: left_shoulder, 12: right_shoulder
13: left_elbow, 14: right_elbow
15: left_wrist, 16: right_wrist
17: left_pinky, 18: right_pinky
19: left_index, 20: right_index
21: left_thumb, 22: right_thumb
23: left_hip, 24: right_hip
25: left_knee, 26: right_knee
27: left_ankle, 28: right_ankle
29: left_heel, 30: right_heel
31: left_foot_index, 32: right_foot_index
```

**Fields:**
- `x, y, z`: Coordinates (normalized 0-1, pixel absolute, or world 3D)
- `visibility`: Confidence that keypoint is visible and not occluded (0-1)
- `presence`: Confidence that keypoint is present in frame (0-1)

**When no pose detected:**
```json
{
  "timestamp": 1700000000000,
  "fps": 29.8,
  "detected": false,
  "pose": null
}
```

### 4.2 Session Recording Format (Stretch Goal)

**Example: `sessions/session-20251118-143022.json`**

```json
{
  "sessionId": "session-20251118-143022",
  "startTime": 1700000000000,
  "endTime": 1700000300000,
  "duration": 300000,
  "config": {
    "modelPath": "./models/pose_landmarker_lite.task",
    "targetFps": 30
  },
  "frames": [
    {
      "timestamp": 1700000000000,
      "frameNumber": 0,
      "detected": true,
      "pose": { /* keypoints as above */ }
    },
    // ... more frames
  ],
  "stats": {
    "totalFrames": 9000,
    "detectedFrames": 8950,
    "averageFps": 29.7,
    "detectionRate": 0.994
  }
}
```

---

## 5. Core Behaviors

### 5.1 Pose Detection Lifecycle

**Description:** Initialize MediaPipe, process video frames, emit keypoint data

**Process:**
1. Load config from YAML
2. Download/verify MediaPipe model exists in `/models`
3. Initialize MediaPipe Pose Landmarker with config parameters
4. Start video input (webcam or file)
5. For each frame:
   - Pass to MediaPipe detector
   - Receive 33 keypoints (or null if no detection)
   - Apply filter pipeline if enabled
   - Emit to Data Bus
   - Data Bus notifies all subscribers (display, storage, API)
6. On stop: Clean up resources

**Error handling:**
- Model not found: Provide download instructions, halt
- Webcam unavailable: Show error UI, offer file input
- Detection failure: Continue processing, emit `detected: false`
- Low FPS: Log warning if < 80% of target FPS

### 5.2 Filter Pipeline

**Description:** Smooth noisy keypoint data to reduce jitter

**Inputs:**
- Raw keypoint data from MediaPipe (33 points × 3 coords × N frames)

**Process:**
1. Check if filtering enabled in config
2. If disabled: Pass through raw data
3. If enabled:
   - Initialize 1-Euro filters (99 filters: 33 keypoints × 3 axes)
   - For each keypoint coordinate:
     - Apply 1-Euro filter with config parameters
     - Output smoothed value
4. Return filtered keypoints in same structure

**Outputs:**
- Smoothed keypoint data (same schema as input)

**Extensibility:**
- Filter type is config-selectable (currently only "oneEuro")
- Architecture allows adding: exponentialMovingAverage, kalman, etc.
- Each filter implements interface: `filter(rawValue, timestamp) => smoothedValue`

### 5.3 Data Bus Event System

**Description:** Pub-sub pattern for distributing keypoint data

**Events:**
- `pose:detected` — New pose data available
- `pose:lost` — Tracking lost
- `fps:update` — FPS counter update
- `config:changed` — Config reloaded (stretch)

**Subscribers:**
- Display Module (for rendering)
- Storage Module (for recording)
- REST API (for serving data)
- External apps (via module import)

**Usage:**
```javascript
// Subscribe
dataBus.on('pose:detected', (poseData) => {
  console.log(poseData.pose.normalized[0]); // Nose keypoint
});

// Emit (internal use)
dataBus.emit('pose:detected', poseData);
```

### 5.4 Display Modes

**Description:** Render pose visualization based on config

**Modes:**

**Overlay Mode:**
- Show webcam feed
- Draw skeleton lines between keypoints
- Draw keypoint dots
- Optional: Color by confidence (red = low, green = high)

**Stick Figure Mode:**
- Black background
- Green skeleton lines
- No webcam feed
- Clean visualization for analysis

**Keypoints Only Mode:**
- Show dots at keypoint locations
- No connecting lines
- Useful for debugging tracking

**None Mode:**
- Headless operation
- GUI disabled
- Data only (for module import)

**Real-time toggles:**
- User can switch modes via GUI buttons
- Changes take effect immediately
- Config updated on toggle (optional)

---

## 6. Module Boundaries

To avoid coupling and enable reusability:

1. **`poseDetector.js`** — MediaPipe wrapper, returns raw keypoints
2. **`filterPipeline.js`** — Filtering only, no detection logic
3. **`dataBus.js`** — Event distribution, no business logic
4. **`displayModule.js`** — Visualization only, subscribes to Data Bus
5. **`configManager.js`** — Config loading/validation only
6. **`storageModule.js`** — Recording/replay, independent (stretch)

**Rules:**
- Pose detector doesn't know about display or filtering
- Filter pipeline doesn't know about MediaPipe
- Display subscribes to Data Bus, doesn't query detector directly
- Each module exports clean interface, can be imported separately

**Example module import:**
```javascript
// Another app importing pose detector (no GUI)
import { PoseDetector } from './js/poseDetector.js';
import { DataBus } from './js/dataBus.js';

const detector = new PoseDetector(config);
const bus = new DataBus();

detector.on('pose', (data) => bus.emit('pose:detected', data));
bus.on('pose:detected', (poseData) => {
  // Use in your game/app
});
```

---

## 7. Testing Requirements

**Framework**:
- Vitest for unit/integration tests
- @testing-library for any DOM testing
- Mocked MediaPipe responses for detector tests

**Coverage Requirements:**
- Pose detector wrapper: 90%+ (initialization, config handling, error cases)
- Filter pipeline: 100% (pure functions, deterministic)
- Data Bus: 100% (pub-sub logic critical)
- Display module: 70% (visual rendering less critical)
- Config manager: 90%+ (validation essential)

**Sprint Requirement:**
- Each sprint must include tests for implemented features
- All tests must pass before sprint is considered complete
- Tests should be committed alongside implementation code

**Test Types:**

**Unit tests:**
- Config validation
- 1-Euro filter calculations
- Data Bus pub-sub
- Keypoint coordinate transformations

**Integration tests:**
- Pose detector → Filter → Data Bus flow
- Config changes trigger correct updates
- Model loading and initialization

**Mock strategies:**
- Mock MediaPipe PoseLandmarker responses
- Mock video input (static test frames)
- Mock file system for config loading

---

## 8. Sprint Plan

### Sprint 1 — Project Setup & Config System

**Goal:** Basic project structure with working config management

**Deliverables:**
- Project directory structure
- Package.json with dependencies (express, mediapipe, js-yaml)
- Config manager that loads/validates YAML
- Basic Express server serving static files
- Download MediaPipe models to `/models` folder
- Unit tests for config validation
- DEVLOG Sprint 1 entry

**Testing:**
- Config loads defaults for missing keys
- Config validation catches invalid values
- Model files verified present

**Context:**
Config system is foundational. Everything else depends on it. Models are pre-downloaded so detector can work offline.

---

### Sprint 2 — MediaPipe Pose Detector Core

**Goal:** Wrap MediaPipe Pose Landmarker with clean interface

**Deliverables:**
- `poseDetector.js` module
- Initialize MediaPipe with config parameters
- Process single image/frame, return 33 keypoints
- Handle detection failures gracefully
- Coordinate system conversions (normalized ↔ pixel)
- Unit tests with mocked MediaPipe responses
- Integration test: load model, detect pose in test image
- DEVLOG Sprint 2 entry

**Testing:**
- Detector initializes with various configs
- Returns correct keypoint structure
- Handles no-pose-detected case
- Coordinate conversions accurate

**Context:**
This is the core value prop. Get MediaPipe working with clean API. No GUI yet, just the engine.

---

### Sprint 3 — Filter Pipeline (1-Euro)

**Goal:** Implement smoothing layer to reduce jitter

**Deliverables:**
- `filterPipeline.js` module
- 1-Euro filter implementation (or import library)
- Filter manager: 99 filter instances (33 keypoints × 3 axes)
- Configuration: min_cutoff, beta, d_cutoff from config
- Pass-through mode when filtering disabled
- Unit tests: verify smoothing reduces jitter
- Integration test: detector → filter → output
- DEVLOG Sprint 3 entry

**Testing:**
- 1-Euro filter produces correct output for test sequences
- Config parameters affect smoothing strength
- Disabled mode is true pass-through
- All 99 filters initialized correctly

**Context:**
Raw MediaPipe output is jittery. 1-Euro filter is industry standard for real-time smoothing. Extensible design allows adding other filters later.

---

### Sprint 4 — Data Bus & Event System

**Goal:** Central hub for distributing pose data to consumers

**Deliverables:**
- `dataBus.js` event emitter
- Event types: `pose:detected`, `pose:lost`, `fps:update`
- Subscribe/emit interface
- Integration: Detector → Filter → Data Bus
- Unit tests: pub-sub mechanics
- DEVLOG Sprint 4 entry

**Testing:**
- Events emitted correctly
- Multiple subscribers receive data
- Unsubscribe works
- No memory leaks on repeated subscribe/unsubscribe

**Context:**
Data Bus decouples producer (detector) from consumers (display, storage, API). Critical for modular architecture.

---

### Sprint 5 — Display Module & GUI

**Goal:** Visualization and user controls

**Deliverables:**
- `displayModule.js` + HTML/CSS
- Canvas rendering: overlay, stick figure, keypoints modes
- GUI controls: mode selector, model selector, confidence sliders
- Real-time FPS display
- Subscribe to Data Bus for pose data
- Component tests: rendering logic
- DEVLOG Sprint 5 entry

**Testing:**
- Each display mode renders correctly
- GUI controls update config/state
- Canvas updates on new pose data
- FPS counter accurate

**Context:**
This is the user-facing part. Keep it as a subscriber to Data Bus — doesn't query detector directly. Proves modularity.

---

### Sprint 6 — Webcam Integration & Real-Time Processing

**Goal:** Live video input with continuous detection

**Deliverables:**
- Webcam access via getUserMedia
- Video frame loop at target FPS
- Detector processes frames continuously
- Display updates in real-time
- Error handling: no camera, permissions denied
- Performance monitoring: actual FPS vs target
- Integration tests: end-to-end flow
- DEVLOG Sprint 6 entry

**Testing:**
- Webcam initializes correctly
- Frame processing maintains target FPS
- Detector + filter + display chain works smoothly
- Error cases handled gracefully

**Context:**
This makes it actually usable. Everything before this was building blocks. Now they come together for real-time tracking.

---

### Sprint 7 — Polish, Documentation & Module Export

**Goal:** Production-ready with clean module interface

**Deliverables:**
- README.md with setup, usage, configuration guide
- API documentation: how to import as module
- Example: external app importing pose detector
- Performance tuning: optimize frame processing
- Error messages improved
- Config hot-reload (optional enhancement)
- Final testing: full system tests
- DEVLOG Sprint 7 entry

**Testing:**
- README instructions work from scratch
- Module import example runs
- All tests passing
- Performance meets targets (30 FPS)

**Context:**
Finish strong. Good docs make it reusable. Module export example proves it's not just a standalone app.

---

### Sprint 8 — Session Recording & Replay

**Goal:** Capture pose sessions and replay them for analysis

**Deliverables:**
- `storageModule.js` with session recording functionality
- Subscribe to Data Bus `pose:detected` events
- Buffer pose data with timestamps and frame numbers
- Export methods: JSON and CSV formats
- Session metadata: duration, frame count, detection rate stats
- Auto-save and manual save options from config
- UI controls: record/stop/export buttons in GUI
- Session replay functionality: load saved session and playback
- File naming: `session-YYYYMMDD-HHMMSS.json`
- Unit tests for storage operations
- Integration test: record → save → load → replay flow
- DEVLOG Sprint 8 entry

**Testing:**
- Recording captures all pose frames correctly
- JSON export matches schema in section 4.2
- CSV export includes all keypoints with proper formatting
- Session stats calculated accurately (detection rate, avg FPS)
- Replay loads session and emits frames via Data Bus
- Auto-save triggers based on config settings
- Storage disabled mode works (pass-through)
- File I/O errors handled gracefully
- Large sessions (10,000+ frames) don't crash

**Context:**
Users want to analyze movement patterns over time. Recording enables offline analysis, comparison, and sharing. Replay through Data Bus means existing display/analysis tools work without modification.

**Implementation Notes:**
- Use ring buffer for auto-save to prevent memory issues
- Compress JSON output (optional) to reduce file size
- CSV format: one row per frame, columns for each keypoint coordinate
- Include config snapshot in session file for reproducibility
- Replay speed control: 1x, 0.5x, 2x playback rates

---

### Sprint 9 — REST API & External Integration

**Goal:** HTTP endpoints for external applications to consume pose data

**Deliverables:**
- API routes in `server/index.js` or separate `routes/api.js`
- GET `/api/pose/current` — Returns last detected pose as JSON
- GET `/api/pose/stream` — Server-Sent Events (SSE) stream of real-time poses
- GET `/api/config` — Returns current configuration
- POST `/api/config` — Update configuration dynamically (hot-reload)
- GET `/api/health` — Health check endpoint
- GET `/api/models/status` — Model availability and info
- Subscribe API server to Data Bus for pose events
- CORS support for cross-origin requests
- API authentication (optional): API key validation
- Rate limiting to prevent abuse
- Integration tests for all endpoints
- API documentation in README with curl examples
- DEVLOG Sprint 9 entry

**Testing:**
- `/api/pose/current` returns correct pose structure
- `/api/pose/stream` SSE connection streams poses continuously
- SSE reconnection works after disconnection
- Multiple clients can connect simultaneously
- Config updates via POST are validated and applied
- Invalid config returns 400 with error details
- Health endpoint returns 200 with status info
- CORS headers present for allowed origins
- Rate limiting triggers after threshold
- API works when display is disabled (headless mode)

**Context:**
External apps (game engines, data analysis tools, mobile apps) need programmatic access. SSE provides real-time streaming without WebSocket complexity. Config hot-reload infrastructure from Sprint 7 can be reused.

**Implementation Notes:**
- Reuse SSE patterns from config hot-reload feature
- Keep last N poses in memory for `/current` endpoint
- SSE format: `data: {pose JSON}\n\n`
- Rate limit: 100 requests/minute per IP (configurable)
- API key in header: `X-API-Key: your_key_here`
- Document example integrations: Python, Unity, React

---

### Sprint 10 — Multi-Person Tracking

**Goal:** Detect and track multiple people simultaneously

**Deliverables:**
- Update `poseDetector.js` to process multiple poses from MediaPipe
- Change return type from `pose: {...}` to `poses: [{...}, {...}]`
- Update Data Bus event: `poses:detected` (plural) instead of `pose:detected`
- Modify DisplayModule to iterate and render each pose with unique colors
- Update FilterPipeline to filter multiple pose arrays independently
- Person ID tracking: maintain identity across frames (simple heuristic)
- Config: `detector.numPoses` can now be 1-10
- UI control to select number of poses to track
- Update all subscribers to handle pose arrays
- Backward compatibility: single pose mode still works
- Update all 245+ tests for array handling
- Add multi-person integration tests
- Performance testing: FPS impact of tracking 2, 3, 5 people
- DEVLOG Sprint 10 entry

**Testing:**
- Detector returns array of poses when `numPoses > 1`
- Each pose has unique identifier for tracking
- DisplayModule renders multiple skeletons with different colors
- FilterPipeline maintains separate filter state per person
- Person ID tracking maintains identity across frames (70%+ accuracy)
- Performance: 2 people at 25 FPS, 3 people at 20 FPS (target)
- No pose detected case: empty array `[]`
- All existing single-person tests still pass
- Storage module records multi-person sessions correctly
- API endpoint returns all poses in array

**Context:**
Many use cases involve multiple people (sports, dance, social activities). Architecture designed for this from start, but implementation was deferred. Person tracking enables applications like group fitness or team sports analysis.

**Implementation Notes:**
- Person ID heuristic: match poses by minimum distance between centers
- Color coding: cycle through 10 distinct colors for visualization
- Config validation: `numPoses` must be 1-10
- Filter pipeline: create separate filter instances per person
- Storage format: `poses: [[pose1_kp0, ...], [pose2_kp0, ...]]`
- Document performance tradeoffs in README

---

### Sprint 11 — World Coordinates & Angle Calculations

**Goal:** 3D coordinates and joint angle analysis

**Deliverables:**
- Enable world coordinates from MediaPipe
- Add `world` array to pose output (3D coordinates in meters)
- Config: `coordinates.world: true` to enable
- New module: `angleCalculator.js`
- Calculate joint angles from keypoint positions
- Common angles: elbow, knee, hip, shoulder flexion/extension
- Emit `angles:calculated` event through Data Bus
- Display module option: show angle values on overlay
- Storage includes world coordinates and angles when enabled
- API endpoints include world coords and angles in response
- Unit tests for angle calculations (known pose → expected angles)
- Integration test: detector → angles → display flow
- 3D visualization option (basic): show world coords as 3D scatter
- DEVLOG Sprint 11 entry

**Testing:**
- World coordinates returned when enabled in config
- World coords are in meters relative to camera
- Angle calculations are geometrically correct (±2° accuracy)
- Common angles calculated: elbow (13-15-17), knee (23-25-27), etc.
- Angles update at same rate as pose detection
- Display shows angles overlaid on keypoints
- Storage includes angles in JSON export
- API returns angles in `/api/pose/current`
- 3D visualization renders correctly (basic depth perception)
- Disabled mode doesn't compute angles (performance)

**Context:**
World coordinates enable true 3D tracking for VR/AR applications. Joint angles are critical for fitness form checking, rehabilitation, and sports analysis. These are commonly requested features for professional use cases.

**Implementation Notes:**
- World coords: MediaPipe provides `worldLandmarks` array
- Angle calculation: use 3-point angle formula with dot product
- Naming: `left_elbow_angle`, `right_knee_angle`, etc.
- Display: show angle text near joint with transparency
- 3D viz: use basic WebGL scatter plot or Three.js (optional)
- Performance: angle calc adds ~1-2ms per frame
- Document angle definitions and measurement planes

---

### Sprint 12 — Gesture Recognition

**Goal:** Detect predefined gestures from pose sequences

**Deliverables:**
- New module: `gestureDetector.js`
- Subscribe to Data Bus for pose sequences
- Gesture definition format: JSON templates with keypoint patterns
- Predefined gestures: jump, squat, arm_raise, wave, dab, t_pose
- Temporal pattern matching: detect gestures over time windows
- Config: `gestures.enabled`, `gestures.definitions`, `gestures.sensitivity`
- Emit `gesture:recognized` events with gesture name and confidence
- UI: show recognized gesture name on screen
- Storage: record gestures in session metadata
- API: `/api/gestures/current` endpoint for last recognized gesture
- Gesture builder tool (optional): record poses to create new gestures
- Unit tests for gesture matching logic
- Integration test: perform gesture → detection → event flow
- Example gesture definitions in `/config/gestures.yaml`
- DEVLOG Sprint 12 entry

**Testing:**
- Predefined gestures detected with 80%+ accuracy
- False positive rate < 5% for similar poses
- Temporal window captures gesture sequence correctly
- Confidence scores correlate with gesture quality
- Multiple rapid gestures detected independently
- Gesture definitions loaded from config
- Custom gesture definitions can be added
- Storage records gesture events with timestamps
- API returns gesture data correctly
- No gestures detected when disabled in config

**Context:**
Gesture recognition enables interactive applications: games, fitness coaching, presentations. Temporal pattern matching distinguishes similar poses (squat vs standing). Extensible gesture definition system allows customization.

**Implementation Notes:**
- Time window: 1-3 seconds for gesture completion
- Matching algorithm: Dynamic Time Warping (DTW) or simple threshold
- Gesture template: key poses + transitions + timing constraints
- Confidence: 0-1 based on keypoint position match quality
- Debounce: prevent same gesture re-triggering for 2 seconds
- Example gesture: "jump" = hips rise, knees extend, feet leave ground
- Document how to create custom gestures

---

## 9. AI Agent Constraints

When implementing this project, AI agents should:

**Do:**
- ✅ Work in discrete sprints
- ✅ Write tests for each sprint before moving on
- ✅ Update DEVLOG.md after each sprint
- ✅ Document all architectural decisions
- ✅ Flag concerns and risks honestly
- ✅ Use established MediaPipe APIs correctly
- ✅ Keep modules decoupled via Data Bus
- ✅ Make config validation robust

**Do Not:**
- ❌ Bundle unrelated features in one sprint
- ❌ Skip tests or defer them to "later"
- ❌ Tightly couple detector to display
- ❌ Hard-code values that belong in config
- ❌ Add features not in spec without discussion
- ❌ Use deprecated MediaPipe Legacy Solutions

**When Ambiguous:**
1. Check if config option should exist
2. If blocking: Propose 2-3 options with tradeoffs
3. If not blocking: Make reasonable choice and document in DEVLOG
4. Always explain reasoning

---

## 10. DEVLOG Format

Maintain `/DEVLOG.md` at the project root.

After each sprint, append an entry:

```markdown
## Sprint N - [short title]

**Summary**
- What was implemented

**Decisions**
- **[Topic]**: Chose X over Y because Z
  - Example: "Filter pipeline: Used separate filter instances per coordinate rather than per-keypoint because it's more efficient and filters don't share state"

**Testing**
- [X] tests passing across [Y] test suites
- Coverage: [X]% of implemented code
- Test types: Unit, Integration, Component

**Questions**
- Clarifications needed from the user/spec owner

**Concerns / Risks**
- Performance: Is 30 FPS achievable on average hardware?
- Browser compatibility: WebGL support varies
- Model size: Heavy model is 25MB, may slow initial load

**Next Sprint Preview**
[What's coming next]
```

---

## 11. Extensibility Hooks & Architecture Patterns

**Design principle:** All extensions communicate via Data Bus. No tight coupling between modules.

### 11.1 Multi-Person Tracking (Sprint 10)

**Architecture:**
```javascript
// Detector returns array of poses
{
  timestamp: 1700000000000,
  fps: 29.8,
  detected: true,
  poses: [
    {
      id: "person_0",  // Persistent tracking ID
      confidence: 0.95,
      normalized: [...],
      pixel: [...]
    },
    {
      id: "person_1",
      confidence: 0.87,
      normalized: [...],
      pixel: [...]
    }
  ]
}
```

**Config:**
```yaml
detector:
  numPoses: 3  # Track up to 3 people
  trackingMode: "persistent"  # or "none" for no ID tracking
```

**Implementation pattern:**
- Detector emits `poses:detected` event (plural)
- DisplayModule subscribes and renders each pose with unique color
- FilterPipeline maintains separate filter state per person ID
- Person ID matching: compare pose centroids, assign closest match
- Backward compatibility: single pose mode when `numPoses: 1`

---

### 11.2 Filter Pipeline Extensions

**Interface all filters must implement:**
```javascript
class FilterInterface {
  constructor(config) {}
  init() {}  // Initialize filter state
  filter(value, timestamp) {}  // Process single value
  reset() {}  // Clear state for new tracking
}
```

**Config-driven selection:**
```yaml
filtering:
  enabled: true
  type: "oneEuro"  # oneEuro | kalman | ema | savitzkyGolay

  # Type-specific configs
  oneEuroConfig:
    minCutoff: 1.0
    beta: 0.007
    dCutoff: 1.0

  kalmanConfig:
    processNoise: 0.01
    measurementNoise: 0.1

  emaConfig:
    alpha: 0.3  # Smoothing factor
```

**Factory pattern:**
```javascript
function createFilter(type, config) {
  switch(type) {
    case 'oneEuro': return new OneEuroFilter(config);
    case 'kalman': return new KalmanFilter(config);
    case 'ema': return new ExponentialMovingAverage(config);
    default: throw new Error(`Unknown filter: ${type}`);
  }
}
```

---

### 11.3 World Coordinates & 3D Tracking (Sprint 11)

**Data structure:**
```javascript
{
  timestamp: 1700000000000,
  fps: 29.8,
  detected: true,
  pose: {
    normalized: [...],  // 0-1 range
    pixel: [...],       // Screen pixels
    world: [            // 3D meters from camera
      {
        index: 0,
        name: "nose",
        x: 0.05,   // meters
        y: -0.12,  // meters
        z: -0.82,  // meters (negative = away from camera)
        visibility: 0.98
      },
      // ... 32 more
    ]
  }
}
```

**Config:**
```yaml
coordinates:
  normalized: true
  pixel: true
  world: true  # Enable 3D world coords

display:
  mode: "world3D"  # New visualization mode
  world3D:
    perspectiveAngle: 45
    cameraDistance: 2.0  # meters
    showAxes: true
```

**Usage:**
- World coords enable true depth perception
- Critical for VR/AR applications
- Used by angle calculator for accurate 3D angles

---

### 11.4 Angle Calculation Module (Sprint 11)

**Architecture:**
```javascript
// angleCalculator.js subscribes to Data Bus
dataBus.onPoseDetected((poseData) => {
  const angles = calculateJointAngles(poseData.pose);
  dataBus.emitAnglesCalculated(angles);
});
```

**Output format:**
```javascript
{
  timestamp: 1700000000000,
  angles: {
    left_elbow: 145.2,    // degrees
    right_elbow: 152.8,
    left_knee: 178.5,
    right_knee: 175.3,
    left_hip: 90.2,
    right_hip: 88.7,
    left_shoulder: 45.1,
    right_shoulder: 47.3
  }
}
```

**Config:**
```yaml
angles:
  enabled: true
  joints: ["elbow", "knee", "hip", "shoulder"]  # or "all"
  coordinateSystem: "world"  # world | normalized (world more accurate)
  smoothing: true  # Apply 1-Euro filter to angles too
```

**Calculation method:**
- 3-point angle: use dot product of vectors
- Example for left elbow: angle between shoulder→elbow and elbow→wrist
- Keypoint indices: shoulder(11), elbow(13), wrist(15)

---

### 11.5 REST API Module (Sprint 9)

**Endpoint design:**
```javascript
// GET /api/pose/current
{
  "timestamp": 1700000000000,
  "detected": true,
  "pose": { /* full pose data */ }
}

// GET /api/pose/stream (SSE)
data: {"timestamp":1700000000000,"pose":{...}}

data: {"timestamp":1700000033000,"pose":{...}}

// POST /api/config
{
  "display": {
    "mode": "stickFigure"
  }
}
// Returns: {"status":"updated","applied":true}
```

**Config:**
```yaml
api:
  enabled: true
  port: 3001
  cors:
    enabled: true
    allowedOrigins: ["http://localhost:*", "https://myapp.com"]
  authentication:
    enabled: false
    apiKey: "your_secret_key_here"
  rateLimit:
    enabled: true
    requestsPerMinute: 100
    burstSize: 10
```

**Implementation pattern:**
- API server subscribes to Data Bus events
- Maintains ring buffer of last 10 poses for `/current`
- SSE connection broadcasts all `pose:detected` events
- Config POST validates and triggers hot-reload

---

### 11.6 Session Storage Module (Sprint 8)

**Recording architecture:**
```javascript
// storageModule.js
class StorageModule {
  constructor(dataBus, config) {
    this.frames = [];
    this.recording = false;

    dataBus.onPoseDetected((data) => {
      if (this.recording) {
        this.frames.push({
          frameNumber: this.frames.length,
          ...data
        });
      }
    });
  }

  startRecording() { this.recording = true; }
  stopRecording() { this.recording = false; }

  async saveSession(format = 'json') {
    const session = this.buildSession();
    if (format === 'json') return this.saveJSON(session);
    if (format === 'csv') return this.saveCSV(session);
  }

  async loadSession(path) {
    const session = await this.loadJSON(path);
    return session;
  }

  replay(session, speedMultiplier = 1.0) {
    // Emit frames through Data Bus at original timing
  }
}
```

**Config:**
```yaml
storage:
  enabled: true
  format: "json"  # json | csv | both
  sessionPath: "./sessions"
  autoSave: true
  autoSaveInterval: 300000  # 5 minutes in ms
  maxFramesInMemory: 10000  # Prevent OOM
  compression: false  # gzip compression (future)
```

**Session file format:** See section 4.2 for complete JSON schema.

---

### 11.7 Gesture Recognition Module (Sprint 12)

**Architecture:**
```javascript
// gestureDetector.js
class GestureDetector {
  constructor(dataBus, config) {
    this.poseHistory = [];  // Ring buffer, last 3 seconds
    this.gestures = loadGestures(config.definitions);

    dataBus.onPoseDetected((data) => {
      this.poseHistory.push(data);
      this.pruneHistory();  // Keep only last 3 seconds

      const gesture = this.matchGesture();
      if (gesture) {
        dataBus.emitGestureRecognized(gesture);
      }
    });
  }

  matchGesture() {
    for (const gesture of this.gestures) {
      const confidence = this.scoreGesture(gesture, this.poseHistory);
      if (confidence > gesture.threshold) {
        return { name: gesture.name, confidence };
      }
    }
    return null;
  }
}
```

**Gesture definition format:**
```yaml
# config/gestures.yaml
gestures:
  - name: "jump"
    threshold: 0.8
    timeWindow: 1.5  # seconds
    sequence:
      - frame: 0  # Start pose
        conditions:
          - keypoint: "left_hip"
            y_min: 0.5  # Lower in frame
      - frame: 15  # Mid-air pose (0.5s later at 30 FPS)
        conditions:
          - keypoint: "left_hip"
            y_max: 0.3  # Higher in frame
          - keypoint: "left_knee"
            angle_min: 160  # Legs extended
      - frame: 30  # Landing
        conditions:
          - keypoint: "left_hip"
            y_min: 0.5  # Lower again

  - name: "t_pose"
    threshold: 0.85
    timeWindow: 0.5
    sequence:
      - frame: 0
        conditions:
          - keypoint: "left_shoulder"
            to: "left_elbow"
            angle: 90  # Arms horizontal
            tolerance: 15
          - keypoint: "right_shoulder"
            to: "right_elbow"
            angle: 90
            tolerance: 15
```

**Config:**
```yaml
gestures:
  enabled: true
  definitionsPath: "./config/gestures.yaml"
  sensitivity: 0.8  # Global threshold multiplier
  debounceTime: 2000  # ms before same gesture can trigger again
  builtin:
    - jump
    - squat
    - t_pose
    - wave
```

---

### 11.8 Batch Processing (Future)

**Config:**
```yaml
input:
  source: "video"  # webcam | video | image
  videoPath: "./input/workout.mp4"
  batchMode: true
  outputPath: "./output/workout_analysis.json"
```

**Processing flow:**
1. Load video file with HTML5 Video element
2. Seek to each frame sequentially
3. Process with detector
4. Storage module saves all frames
5. Progress bar updates
6. Final session exported when complete

**UI additions:**
- File upload button
- Progress bar (frames processed / total frames)
- Cancel button
- Batch result display

---

### 11.9 Module Communication Diagram

```
                    ┌─────────────┐
                    │  Data Bus   │
                    └─────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐    ┌────▼────┐    ┌─────▼─────┐
    │ Display   │    │ Storage │    │ REST API  │
    │ Module    │    │ Module  │    │  Server   │
    └───────────┘    └─────────┘    └───────────┘
          │                │                │
          │         ┌──────▼──────┐         │
          └────────▶│   Angle     │◀────────┘
                    │ Calculator  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Gesture    │
                    │  Detector   │
                    └─────────────┘
```

**Key principles:**
- All modules subscribe to Data Bus
- No direct module-to-module communication
- New modules can be added without modifying existing code
- Each module can be enabled/disabled via config
- Modules emit events for others to consume

---

## 12. Scope Summary

### MVP (Sprints 1-7) ✅
**Core functionality - COMPLETED:**
- ✅ Project setup and config system
- ✅ MediaPipe pose detector wrapper
- ✅ Filter pipeline (1-Euro smoothing)
- ✅ Data Bus event system
- ✅ Display module with 4 visualization modes
- ✅ Webcam integration and real-time processing
- ✅ Documentation and module export
- ✅ Config hot-reload (optional enhancement)

### Enhancement Features (Sprints 8-12)
**Now included in specification:**
- Sprint 8: Session Recording & Replay
- Sprint 9: REST API & External Integration
- Sprint 10: Multi-Person Tracking
- Sprint 11: World Coordinates & Angle Calculations
- Sprint 12: Gesture Recognition

### Still Out of Scope
**Features NOT planned for current specification:**

**Batch Video Processing:**
- Process pre-recorded videos offline
- Progress bar and status updates
- Export all frames from video file
- *Why deferred:* Can be added later using existing storage module patterns

**Advanced Filters:**
- Kalman filter option
- Exponential moving average
- Custom filter plugin system
- *Why deferred:* 1-Euro filter meets current needs; extensibility hooks in place

**Performance Dashboard:**
- Detailed FPS breakdown by component
- Memory usage monitoring
- GPU utilization metrics
- *Why deferred:* Basic FPS counter sufficient for now

**Cloud Deployment:**
- Hosted SaaS version
- Multi-tenant architecture
- User accounts and authentication
- *Why deferred:* Local-first design; cloud adds complexity

**Mobile App:**
- Native iOS/Android applications
- Mobile-optimized UI
- Touch gesture controls
- *Why deferred:* Web app works on mobile browsers

**3D Visualization (Advanced):**
- Full 3D pose rendering with Three.js
- VR/AR integration
- 360-degree camera rotation
- *Why deferred:* Sprint 11 includes basic 3D; advanced viz is niche

**Pose Comparison:**
- Compare two poses side-by-side
- Form checking against reference pose
- Difference highlighting
- *Why deferred:* Requires pose database and matching algorithms

**Social Features:**
- Share recordings publicly
- User profiles and leaderboards
- Comments and reactions
- *Why deferred:* Not core to pose detection functionality

**Machine Learning Training:**
- Custom model training
- Transfer learning from MediaPipe
- Model fine-tuning for specific use cases
- *Why deferred:* MediaPipe models are sufficient

**Multi-Camera Support:**
- Synchronize multiple camera feeds
- 3D reconstruction from multiple angles
- Camera calibration tools
- *Why deferred:* Complex setup; single camera sufficient

### Philosophy

**MVP (Sprints 1-7):** Clean, modular pose tracking that works and is easy to integrate

**Enhancements (Sprints 8-12):** Professional features for analysis, integration, and interactivity

**Out of Scope:** Features requiring significant infrastructure (cloud, mobile apps) or niche use cases (multi-camera, custom ML)

---

## 13. Technical Notes

**MediaPipe Models:**
- Lite (3MB): Fast, less accurate, good for low-end hardware
- Full (5MB): Balanced, recommended default
- Heavy (26MB): Most accurate, requires good hardware

**1-Euro Filter:**
- `min_cutoff`: Lower = more smoothing, more lag
- `beta`: Adapts to velocity, higher = follows faster movements
- `d_cutoff`: Derivative cutoff, usually fixed
- Typical values: min_cutoff=1.0, beta=0.007, d_cutoff=1.0

**Performance:**
- Target 30 FPS on average hardware (2020+ laptop)
- Lite model should achieve 60 FPS
- Heavy model may drop to 15-20 FPS on older hardware

**Browser compatibility:**
- Chrome/Edge: Full WebGL/WebGPU support
- Firefox: WebGL support, WebGPU in progress
- Safari: WebGL support, WebGPU experimental

**Coordinate systems:**
- Normalized: Origin top-left (0,0), bottom-right (1,1), z is depth
- Pixel: Origin top-left (0,0), bottom-right (width, height)
- World: Camera-relative 3D (meters)

---

## Usage Notes

**For AI Agents:**
1. Read this spec completely before starting
2. Follow the sprint plan sequentially
3. Update DEVLOG after each sprint
4. Flag any conflicts or ambiguities

**For Humans:**
1. This spec is the contract for what gets built
2. All deviations should be documented
3. Update this spec if requirements change
4. Keep it as a living document

---

**This specification + workflow is the contract. Any agent working on this project should follow it unless explicitly instructed otherwise, and must document every deviation.**
