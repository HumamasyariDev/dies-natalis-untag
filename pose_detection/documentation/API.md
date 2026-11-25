# API Documentation

Comprehensive API reference for MediaPipe Pose Detection modules.

---

## Table of Contents

- [PoseDetector](#posedetector)
- [FilterPipeline](#filterpipeline)
- [DataBus](#databus)
- [DisplayModule](#displaymodule)
- [ConfigManager](#configmanager)
- [Data Structures](#data-structures)
- [Constants](#constants)
- [Error Handling](#error-handling)

---

## PoseDetector

MediaPipe wrapper for pose detection and tracking.

### Import

```javascript
import { PoseDetector, KEYPOINT_NAMES } from './client/js/poseDetector.js';
```

### Constructor

```javascript
const detector = new PoseDetector();
```

Creates a new PoseDetector instance. No parameters required.

### Methods

#### `initialize(config)`

Initialize the detector with MediaPipe model and configuration.

**Parameters**:
- `config` (Object): Configuration object
  - `modelPath` (String): Path to MediaPipe `.task` model file
  - `runningMode` (String): `'VIDEO'` | `'IMAGE'` | `'LIVE_STREAM'`
  - `minDetectionConfidence` (Number): 0.0 - 1.0, default 0.5
  - `minTrackingConfidence` (Number): 0.0 - 1.0, default 0.5
  - `minPosePresenceConfidence` (Number): 0.0 - 1.0, default 0.5
  - `numPoses` (Number): Number of poses to detect (MVP: 1 only)

**Returns**: `Promise<void>`

**Throws**: Error if model fails to load or configuration is invalid

**Example**:
```javascript
const config = {
  modelPath: './models/pose_landmarker_full.task',
  runningMode: 'VIDEO',
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
};

await detector.initialize(config);
```

---

#### `detectForVideo(videoElement, timestamp)`

Process a single video frame and detect pose landmarks.

**Parameters**:
- `videoElement` (HTMLVideoElement): Video element containing the frame
- `timestamp` (Number): Current timestamp in milliseconds (use `performance.now()`)

**Returns**: `Promise<DetectionResult>`

**DetectionResult Structure**:
```javascript
{
  timestamp: 123456.789,        // Timestamp in ms
  fps: 30.5,                     // Current FPS
  detected: true,                // Whether pose was detected
  pose: {
    normalized: [               // Array of 33 keypoints (normalized 0-1)
      { x: 0.5, y: 0.3, z: -0.1, visibility: 0.95 },
      // ... 32 more keypoints
    ],
    pixel: [                    // Array of 33 keypoints (pixel coordinates)
      { x: 640, y: 384, z: -0.1, visibility: 0.95 },
      // ... 32 more keypoints
    ]
  }
}
```

**Example**:
```javascript
const timestamp = performance.now();
const result = await detector.detectForVideo(videoElement, timestamp);

if (result.detected) {
  console.log('Nose position:', result.pose.normalized[0]);
  console.log('FPS:', result.fps);
}
```

---

#### `setVideoSize(width, height)`

Update video dimensions for pixel coordinate calculation.

**Parameters**:
- `width` (Number): Video width in pixels
- `height` (Number): Video height in pixels

**Returns**: `void`

**Example**:
```javascript
videoElement.onloadedmetadata = () => {
  detector.setVideoSize(videoElement.videoWidth, videoElement.videoHeight);
};
```

---

### Properties

#### `isInitialized` (readonly)

**Type**: `Boolean`

Returns `true` if detector has been initialized with a model.

**Example**:
```javascript
if (detector.isInitialized) {
  const result = await detector.detectForVideo(video, timestamp);
}
```

---

### Constants

#### `KEYPOINT_NAMES`

Array of 33 keypoint names corresponding to landmark indices.

**Type**: `Array<String>`

**Example**:
```javascript
console.log(KEYPOINT_NAMES[0]);   // "nose"
console.log(KEYPOINT_NAMES[11]);  // "left_shoulder"
console.log(KEYPOINT_NAMES[15]);  // "left_wrist"
```

**Full List**:
```
0: nose                 17: left_pinky
1: left_eye_inner       18: right_pinky
2: left_eye             19: left_index
3: left_eye_outer       20: right_index
4: right_eye_inner      21: left_thumb
5: right_eye            22: right_thumb
6: right_eye_outer      23: left_hip
7: left_ear             24: right_hip
8: right_ear            25: left_knee
9: mouth_left           26: right_knee
10: mouth_right         27: left_ankle
11: left_shoulder       28: right_ankle
12: right_shoulder      29: left_heel
13: left_elbow          30: right_heel
14: right_elbow         31: left_foot_index
15: left_wrist          32: right_foot_index
16: right_wrist
```

---

## FilterPipeline

Smooths pose data using 1-Euro filter to reduce jitter and noise.

### Import

```javascript
import { FilterPipeline, OneEuroFilter } from './client/js/filterPipeline.js';
```

### Constructor

```javascript
const filter = new FilterPipeline(config);
```

**Parameters**:
- `config` (Object): Filter configuration
  - `minCutoff` (Number): Minimum cutoff frequency (lower = more smoothing, more lag)
  - `beta` (Number): Speed coefficient (adapts to velocity)
  - `dCutoff` (Number): Cutoff for derivative

**Defaults**:
```javascript
{
  minCutoff: 1.0,   // Good default for body tracking
  beta: 0.007,      // Moderate velocity adaptation
  dCutoff: 1.0      // Standard derivative filtering
}
```

**Example**:
```javascript
// More smoothing (for stable footage)
const smoothFilter = new FilterPipeline({ minCutoff: 0.5, beta: 0.007, dCutoff: 1.0 });

// Less smoothing (for fast movements)
const responsiveFilter = new FilterPipeline({ minCutoff: 2.0, beta: 0.01, dCutoff: 1.0 });
```

---

### Methods

#### `filter(detectionResult, timestamp)`

Apply smoothing filter to detection result.

**Parameters**:
- `detectionResult` (DetectionResult): Output from `PoseDetector.detectForVideo()`
- `timestamp` (Number): Current timestamp in milliseconds

**Returns**: `DetectionResult` (same structure, but with smoothed coordinates)

**Example**:
```javascript
const rawResult = await detector.detectForVideo(videoElement, timestamp);
const smoothedResult = filterPipeline.filter(rawResult, timestamp);

console.log('Raw nose X:', rawResult.pose.normalized[0].x);
console.log('Smoothed nose X:', smoothedResult.pose.normalized[0].x);
```

---

#### `reset()`

Reset all filter states. Use when tracking is lost or user changes.

**Returns**: `void`

**Example**:
```javascript
dataBus.onPoseLost(() => {
  filterPipeline.reset();  // Clear filter history
});
```

---

### OneEuroFilter (Low-level)

Individual filter for a single value. FilterPipeline uses 99 of these internally (33 keypoints × 3 axes).

**Constructor**:
```javascript
const filter = new OneEuroFilter(minCutoff, beta, dCutoff);
```

**Method**:
```javascript
const smoothedValue = filter.filter(value, timestamp);
```

**Note**: You rarely need to use OneEuroFilter directly. Use FilterPipeline instead.

---

## DataBus

Event distribution system using pub-sub pattern for decoupled architecture.

### Import

```javascript
import { DataBus } from './client/js/dataBus.js';
```

### Constructor

```javascript
const bus = new DataBus();
```

No parameters required.

---

### Event Subscription Methods

#### `onPoseDetected(callback)`

Subscribe to pose detection events.

**Parameters**:
- `callback` (Function): `(data: DetectionResult) => void`

**Returns**: `void`

**Example**:
```javascript
bus.onPoseDetected((data) => {
  console.log('Pose detected at', data.timestamp);
  console.log('Keypoints:', data.pose.normalized);
});
```

---

#### `onPoseLost(callback)`

Subscribe to pose lost events (tracking failure).

**Parameters**:
- `callback` (Function): `() => void`

**Returns**: `void`

**Example**:
```javascript
bus.onPoseLost(() => {
  console.log('Pose tracking lost');
  showWarningMessage('Please stay in frame');
});
```

---

#### `onFpsUpdate(callback)`

Subscribe to FPS update events.

**Parameters**:
- `callback` (Function): `(fps: Number) => void`

**Returns**: `void`

**Example**:
```javascript
bus.onFpsUpdate((fps) => {
  fpsDisplay.textContent = Math.round(fps);

  if (fps < 20) {
    console.warn('Low FPS, consider switching to lite model');
  }
});
```

---

#### `onConfigChanged(callback)`

Subscribe to configuration change events.

**Parameters**:
- `callback` (Function): `(config: Object) => void`

**Returns**: `void`

**Example**:
```javascript
bus.onConfigChanged((newConfig) => {
  console.log('Config updated:', newConfig);
  // Reinitialize modules if needed
});
```

---

### Event Emission Methods

These are typically called by the main application, not by consumers.

#### `emitPoseDetected(data)`

Emit pose detected event to all subscribers.

**Parameters**:
- `data` (DetectionResult): Pose data

**Returns**: `void`

---

#### `emitPoseLost()`

Emit pose lost event to all subscribers.

**Returns**: `void`

---

#### `emitFpsUpdate(fps)`

Emit FPS update event to all subscribers.

**Parameters**:
- `fps` (Number): Current frames per second

**Returns**: `void`

---

#### `emitConfigChanged(config)`

Emit configuration change event to all subscribers.

**Parameters**:
- `config` (Object): New configuration

**Returns**: `void`

---

### Cleanup Methods

#### `removeAllListeners()`

Remove all event listeners. Call when shutting down application.

**Returns**: `void`

**Example**:
```javascript
function cleanup() {
  dataBus.removeAllListeners();
  console.log('All listeners removed');
}
```

---

#### `removeListener(eventName, callback)`

Remove specific listener.

**Parameters**:
- `eventName` (String): Event name (`'pose:detected'`, `'pose:lost'`, `'fps:update'`, `'config:changed'`)
- `callback` (Function): The callback function to remove

**Returns**: `void`

**Example**:
```javascript
const myHandler = (data) => console.log(data);
bus.onPoseDetected(myHandler);

// Later:
bus.removeListener('pose:detected', myHandler);
```

---

## DisplayModule

Visualization layer for rendering pose data to canvas.

### Import

```javascript
import { DisplayModule } from './client/js/displayModule.js';
```

### Constructor

```javascript
const display = new DisplayModule(canvasElement, config);
```

**Parameters**:
- `canvasElement` (HTMLCanvasElement): Canvas element for rendering
- `config` (Object): Display configuration
  - `display.mode` (String): Display mode
  - `display.overlay` (Object): Overlay mode settings
  - `display.stickFigure` (Object): Stick figure mode settings
  - `display.keypoints` (Object): Keypoints mode settings

**Example**:
```javascript
const canvas = document.getElementById('myCanvas');
const config = {
  display: {
    mode: 'overlay',
    overlay: {
      showWebcam: true,
      showSkeleton: true,
      showKeypoints: true,
      keypointRadius: 5,
      lineWidth: 2
    }
  }
};

const display = new DisplayModule(canvas, config);
```

---

### Methods

#### `subscribeToDataBus(dataBus)`

Subscribe display module to data bus events. Automatically renders when pose is detected.

**Parameters**:
- `dataBus` (DataBus): Data bus instance

**Returns**: `void`

**Example**:
```javascript
const bus = new DataBus();
const display = new DisplayModule(canvas, config);

display.subscribeToDataBus(bus);
// Now display will automatically render when bus emits pose:detected
```

---

#### `setMode(mode)`

Change display mode at runtime.

**Parameters**:
- `mode` (String): `'overlay'` | `'stickFigure'` | `'keypoints'` | `'none'`

**Returns**: `void`

**Example**:
```javascript
// Switch to stick figure view
display.setMode('stickFigure');

// Disable visualization but keep detection running
display.setMode('none');
```

---

#### `updateVideoSize(width, height)`

Update video dimensions for proper rendering.

**Parameters**:
- `width` (Number): Video width in pixels
- `height` (Number): Video height in pixels

**Returns**: `void`

**Example**:
```javascript
videoElement.onloadedmetadata = () => {
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;

  canvas.width = width;
  canvas.height = height;

  display.updateVideoSize(width, height);
};
```

---

#### `render(poseData, videoElement)`

Manually render pose data. Usually not needed if subscribed to DataBus.

**Parameters**:
- `poseData` (DetectionResult): Pose data to render
- `videoElement` (HTMLVideoElement): Video element (for overlay mode)

**Returns**: `void`

**Example**:
```javascript
// Manual rendering (without DataBus)
const result = await detector.detectForVideo(video, timestamp);
display.render(result, video);
```

---

#### `destroy()`

Clean up display module and remove event listeners.

**Returns**: `void`

**Example**:
```javascript
function cleanup() {
  display.destroy();
}
```

---

### Display Modes

#### Overlay Mode

Renders skeleton and keypoints over webcam feed.

**Settings**:
```javascript
{
  showWebcam: true,          // Show video background
  showSkeleton: true,        // Draw skeleton connections
  showKeypoints: true,       // Draw keypoint circles
  keypointRadius: 5,         // Keypoint circle size
  lineWidth: 2,              // Skeleton line width
  confidenceColorCoding: false  // Color by confidence (future)
}
```

**Use case**: Real-time feedback with full context

---

#### Stick Figure Mode

Simplified pose visualization on solid background.

**Settings**:
```javascript
{
  backgroundColor: '#000000',  // Background color
  figureColor: '#00FF00',      // Skeleton/keypoint color
  showKeypoints: true          // Show keypoint circles
}
```

**Use case**: Clean visualization, focus on pose structure

---

#### Keypoints Mode

Show only keypoint circles, no skeleton connections.

**Settings**:
```javascript
{
  showAll: true,                      // Show all keypoints
  visibleJoints: 'all',               // Or array of keypoint names
  radius: 5                           // Keypoint circle radius
}
```

**Use case**: Debugging, specific joint tracking

---

#### None Mode

No visualization. Detection continues but canvas is not updated.

**Use case**: Headless mode, custom rendering, performance testing

---

## ConfigManager

Loads and validates YAML configuration.

### Import

```javascript
import { ConfigManager } from './client/js/configManager.js';
```

### Constructor

```javascript
const configManager = new ConfigManager();
```

---

### Methods

#### `loadConfig(path)`

Load configuration from YAML file.

**Parameters**:
- `path` (String, optional): Config file path, default: `/api/config`

**Returns**: `Promise<void>`

**Throws**: Error if config fails to load or is invalid

**Example**:
```javascript
const configManager = new ConfigManager();
await configManager.loadConfig();  // Loads from /api/config
const config = configManager.getConfig();
```

---

#### `getConfig()`

Get current configuration object.

**Returns**: `Object` (config)

**Example**:
```javascript
const config = configManager.getConfig();
console.log('Model path:', config.detector.modelPath);
console.log('Target FPS:', config.performance.targetFps);
```

---

#### `validateConfig(config)`

Validate configuration object structure.

**Parameters**:
- `config` (Object): Configuration to validate

**Returns**: `Boolean` (true if valid)

**Throws**: Error if invalid with descriptive message

**Example**:
```javascript
const customConfig = { detector: { modelPath: './models/lite.task' } };

try {
  configManager.validateConfig(customConfig);
  console.log('Config is valid');
} catch (error) {
  console.error('Invalid config:', error.message);
}
```

---

## Data Structures

### DetectionResult

Returned by `PoseDetector.detectForVideo()` and `FilterPipeline.filter()`.

```typescript
interface DetectionResult {
  timestamp: number;        // Timestamp in milliseconds
  fps: number;              // Current FPS
  detected: boolean;        // Whether pose was detected
  pose: {
    normalized: Keypoint[]; // 33 keypoints (0-1 normalized coords)
    pixel: Keypoint[];      // 33 keypoints (pixel coords)
  }
}
```

---

### Keypoint

Individual body landmark with position and confidence.

```typescript
interface Keypoint {
  x: number;          // X coordinate (0-1 normalized or pixels)
  y: number;          // Y coordinate (0-1 normalized or pixels)
  z: number;          // Depth (normalized, negative = closer)
  visibility: number; // Confidence score (0-1)
}
```

**Important**:
- **Normalized coordinates**: `x` and `y` range from 0 to 1 (0,0 = top-left, 1,1 = bottom-right)
- **Pixel coordinates**: `x` and `y` are actual pixel positions on canvas
- **Z coordinate**: Depth relative to hips, negative = closer to camera
- **Visibility**: Confidence score, values > 0.5 are generally reliable

---

### Configuration Object

Full configuration structure:

```javascript
{
  detector: {
    modelPath: String,              // Path to .task file
    runningMode: String,            // VIDEO | IMAGE | LIVE_STREAM
    numPoses: Number,               // 1 (MVP)
    minDetectionConfidence: Number, // 0-1
    minTrackingConfidence: Number,  // 0-1
    minPosePresenceConfidence: Number // 0-1
  },
  performance: {
    targetFps: Number,              // Target frames per second
    enableGpu: Boolean              // GPU acceleration
  },
  filtering: {
    enabled: Boolean,
    type: String,                   // 'oneEuro'
    oneEuroConfig: {
      minCutoff: Number,            // Smoothing amount
      beta: Number,                 // Velocity adaptation
      dCutoff: Number               // Derivative filter
    }
  },
  display: {
    enabled: Boolean,
    mode: String,                   // overlay | stickFigure | keypoints | none
    overlay: { /* ... */ },
    stickFigure: { /* ... */ },
    keypoints: { /* ... */ }
  }
}
```

See `/config/config.yaml` for complete structure with defaults.

---

## Constants

### Keypoint Indices

Use these constants to access specific keypoints:

```javascript
import { KEYPOINT_NAMES } from './client/js/poseDetector.js';

// Access by index
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

// Use in code
const nosePosition = result.pose.normalized[NOSE];
const leftWrist = result.pose.normalized[LEFT_WRIST];
```

---

## Error Handling

### Common Errors

#### Model Loading Errors

```javascript
try {
  await detector.initialize(config);
} catch (error) {
  if (error.message.includes('Failed to load model')) {
    // Check internet connection or model file location
    console.error('Model not found, check path:', config.modelPath);
  }
}
```

#### Camera Access Errors

```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // User denied camera permission
    showError('Please allow camera access');
  } else if (error.name === 'NotFoundError') {
    // No camera connected
    showError('No camera found');
  } else if (error.name === 'NotReadableError') {
    // Camera in use by another app
    showError('Camera already in use');
  }
}
```

#### Configuration Errors

```javascript
try {
  await configManager.loadConfig();
} catch (error) {
  // Config validation failed
  console.error('Invalid configuration:', error.message);
  // Fall back to default config
}
```

---

## Best Practices

### 1. Always Check Initialization

```javascript
if (!detector.isInitialized) {
  await detector.initialize(config);
}
```

### 2. Handle Pose Lost Events

```javascript
dataBus.onPoseLost(() => {
  // Reset any game state, pause animations, etc.
});
```

### 3. Check Visibility Before Using Keypoints

```javascript
const nose = result.pose.normalized[0];
if (nose.visibility > 0.5) {
  // Reliable data, safe to use
  processNosePosition(nose.x, nose.y);
}
```

### 4. Clean Up Resources

```javascript
function shutdown() {
  // Stop webcam
  stream.getTracks().forEach(track => track.stop());

  // Remove listeners
  dataBus.removeAllListeners();

  // Destroy display
  display.destroy();

  // Cancel animation loop
  cancelAnimationFrame(animationId);
}
```

### 5. Use Normalized Coordinates for Logic

```javascript
// ✅ Good: Resolution-independent
if (leftWrist.y < nose.y) {  // Hand above head
  console.log('Hand raised');
}

// ❌ Bad: Resolution-dependent
if (leftWrist_pixel.y < 200) {  // Breaks on different resolutions
  console.log('Hand raised');
}
```

---

## Performance Tips

1. **Choose appropriate model**: Use lite for mobile/low-end hardware
2. **Lower video resolution**: Smaller frames = faster processing
3. **Use requestAnimationFrame**: Browser-optimized frame timing
4. **Enable GPU**: Set `enableGpu: true` in config
5. **Monitor FPS**: Use Data Bus to track performance
6. **Reduce rendering complexity**: Use `none` mode if visualization not needed

---

## Examples

See `/examples` directory for complete integration examples:

- `module-import-example.html` - Interactive browser example
- `minimal-integration.js` - Minimal code snippets
- `examples/README.md` - Integration patterns and common tasks

---

## Further Reading

- **Main README**: `/README.md` - Setup and usage guide
- **Specification**: `/documentation/mediapipe-pose-spec.md` - Complete project spec
- **DEVLOG**: `/documentation/mediapipe-pose-DEVLOG.md` - Development history
- **MediaPipe Docs**: https://developers.google.com/mediapipe

---

**Questions or issues? Check troubleshooting in main README or submit an issue on GitHub.**
