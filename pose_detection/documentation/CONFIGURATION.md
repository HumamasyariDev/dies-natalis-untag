# Configuration Guide

Complete guide to configuring MediaPipe Pose Detection system.

---

## Overview

The pose detection system is fully configurable via `/config/config.yaml`. All behavior, visualization, and performance settings can be modified without changing code.

**Configuration file**: `/config/config.yaml`

---

## Table of Contents

- [Detector Settings](#detector-settings)
- [Performance Settings](#performance-settings)
- [Input Settings](#input-settings)
- [Filtering Settings](#filtering-settings)
- [Coordinate Systems](#coordinate-systems)
- [Display Settings](#display-settings)
- [Storage Settings](#storage-settings-future)
- [API Settings](#api-settings-future)
- [Common Configuration Scenarios](#common-configuration-scenarios)
- [Validation and Errors](#validation-and-errors)

---

## Detector Settings

Controls MediaPipe pose detection behavior.

### `detector.modelPath`

**Type**: String
**Default**: `"./models/pose_landmarker_full.task"`
**Options**:
- `"./models/pose_landmarker_lite.task"` (3MB)
- `"./models/pose_landmarker_full.task"` (5MB)
- `"./models/pose_landmarker_heavy.task"` (26MB)

**Description**: Path to MediaPipe model file. Models trade off speed vs accuracy.

**Choosing a model**:

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| **lite** | 3MB | 60+ FPS | Good | Mobile, low-end hardware, fast movements |
| **full** | 5MB | ~30 FPS | Better | General use, recommended default |
| **heavy** | 26MB | 15-20 FPS | Best | High accuracy needs, static scenes |

**Example**:
```yaml
detector:
  modelPath: "./models/pose_landmarker_lite.task"  # Use lite for better FPS
```

---

### `detector.runningMode`

**Type**: String
**Default**: `"VIDEO"`
**Options**: `"IMAGE"` | `"VIDEO"` | `"LIVE_STREAM"`

**Description**: MediaPipe processing mode.

- **VIDEO**: For video files or webcam with frame-by-frame processing (recommended)
- **IMAGE**: For single image processing (not used in MVP)
- **LIVE_STREAM**: For real-time streaming with callbacks (advanced)

**Example**:
```yaml
detector:
  runningMode: "VIDEO"  # Standard for webcam
```

---

### `detector.numPoses`

**Type**: Number
**Default**: `1`
**Range**: 1 (MVP supports single pose only)

**Description**: Number of people to detect. Currently limited to 1.

**Note**: Architecture supports multi-person tracking, but MVP implements single-person only.

---

### `detector.minDetectionConfidence`

**Type**: Number
**Default**: `0.5`
**Range**: 0.0 - 1.0

**Description**: Minimum confidence threshold for initial pose detection.

**When to adjust**:
- **Lower (0.3-0.4)**: Difficult lighting, distant subjects, occlusions
- **Higher (0.6-0.7)**: Reduce false positives, ensure high-quality detections

**Example**:
```yaml
detector:
  minDetectionConfidence: 0.3  # More lenient detection
```

**Trade-offs**:
- Lower = more detections but more false positives
- Higher = fewer false positives but may miss valid poses

---

### `detector.minTrackingConfidence`

**Type**: Number
**Default**: `0.5`
**Range**: 0.0 - 1.0

**Description**: Minimum confidence to maintain tracking of existing pose.

**When to adjust**:
- **Lower (0.3-0.4)**: Keep tracking through brief occlusions or fast movements
- **Higher (0.6-0.7)**: Stricter tracking, lose track more easily but more accurate

**Example**:
```yaml
detector:
  minTrackingConfidence: 0.4  # Maintain tracking longer
```

**Relationship with minDetectionConfidence**:
- Detection finds new poses (more expensive)
- Tracking follows existing poses (cheaper)
- Lower tracking confidence = less re-detection = better performance

---

### `detector.minPosePresenceConfidence`

**Type**: Number
**Default**: `0.5`
**Range**: 0.0 - 1.0

**Description**: Minimum confidence that a pose exists in the frame.

**When to adjust**:
- Similar to detection confidence
- Typically set to same value as `minDetectionConfidence`

---

## Performance Settings

Controls computational performance and resource usage.

### `performance.targetFps`

**Type**: Number
**Default**: `30`
**Range**: 1 - 60

**Description**: Target frames per second for processing.

**Recommendations**:
- **30 FPS**: Standard, smooth for most uses
- **24 FPS**: Cinematic, acceptable for visualization
- **60 FPS**: Very smooth, requires lite model and powerful hardware

**Example**:
```yaml
performance:
  targetFps: 24  # Lower for better compatibility
```

**Note**: This is a target, not a guarantee. Actual FPS depends on hardware and model.

---

### `performance.enableGpu`

**Type**: Boolean
**Default**: `true`

**Description**: Enable GPU acceleration for MediaPipe processing.

**When to disable**:
- GPU driver issues
- Testing CPU-only performance
- Debugging rendering problems

**Example**:
```yaml
performance:
  enableGpu: false  # Use CPU only
```

**Performance impact**:
- GPU enabled: 2-5x faster processing
- GPU disabled: Fallback to CPU, significantly slower

---

## Input Settings

Controls video input source (MVP: webcam only).

### `input.source`

**Type**: String
**Default**: `"webcam"`
**Options**: `"webcam"` | `"video"` | `"image"`

**Description**: Input source type.

**MVP**: Only `"webcam"` is fully implemented.

---

### `input.videoPath`

**Type**: String or null
**Default**: `null`

**Description**: Path to video file for batch processing (future feature).

---

### `input.webcamId`

**Type**: Number
**Default**: `0`

**Description**: Webcam device ID when multiple cameras present.

**Example**:
```yaml
input:
  source: "webcam"
  webcamId: 1  # Use second camera
```

---

### `input.frameRate`

**Type**: Number (`30` | `60`)
**Default**: `30`

**Description**: Target capture frame rate, also exposed as the **Frame rate** UI
selector (applies on the next Start).

A high frame rate caps each frame's exposure time, so the choice trades frame
rate against image brightness:

- **`30` (steady)** — requested as an advisory `ideal` only (never a `min`). The
  camera is free to lengthen exposure and hold a steady 30 fps even in dim light.
  The right default for typical indoor use.
- **`60` (bright light)** — *forces* a high-rate mode (a `min` above 30, since
  browsers otherwise hand back the default 30 even when a 60 mode exists). The
  camera only sustains 60 fps with ample light; in dim light its auto-exposure
  doubles the exposure time and the rate collapses to 30 or 15. Opt in only when
  the scene is well lit.

**Example**:
```yaml
input:
  source: "webcam"
  frameRate: 60  # Bright-light mode; prefer 30 indoors
```

---

## Filtering Settings

Controls smoothing and noise reduction.

### `filtering.enabled`

**Type**: Boolean
**Default**: `true`

**Description**: Enable/disable smoothing filter.

**When to disable**:
- Debugging raw detector output
- Custom filtering implementation
- Offline analysis requiring raw data

**Example**:
```yaml
filtering:
  enabled: false  # Raw detector output
```

---

### `filtering.type`

**Type**: String
**Default**: `"oneEuro"`
**Options**: `"oneEuro"` (MVP: only option)

**Description**: Filter algorithm type. Architecture supports multiple filters, MVP implements 1-Euro only.

---

### `filtering.oneEuroConfig.minCutoff`

**Type**: Number
**Default**: `1.0`
**Range**: 0.01 - 10.0

**Description**: Minimum cutoff frequency for low-pass filter. **Most important tuning parameter**.

**Effect**:
- **Lower (0.3-0.7)**: More smoothing, more lag, very stable
- **Higher (1.5-3.0)**: Less smoothing, more responsive, some jitter

**When to adjust**:

| Use Case | Recommended minCutoff |
|----------|----------------------|
| Steady camera, slow movements | 0.5 - 0.7 |
| General use (default) | 1.0 |
| Fast movements, gaming | 1.5 - 2.0 |
| Very responsive, some jitter OK | 2.5 - 3.0 |

**Example**:
```yaml
filtering:
  oneEuroConfig:
    minCutoff: 0.5  # Very smooth for presentation
```

---

### `filtering.oneEuroConfig.beta`

**Type**: Number
**Default**: `0.007`
**Range**: 0.0 - 1.0

**Description**: Speed coefficient for velocity adaptation. Higher = more responsive to fast movements.

**When to adjust**:
- **Lower (0.001-0.005)**: Slow movements, consistent smoothing
- **Higher (0.01-0.02)**: Fast movements, reduce lag

**Example**:
```yaml
filtering:
  oneEuroConfig:
    beta: 0.015  # More responsive to speed changes
```

**Advanced**: Beta adjusts cutoff frequency based on velocity. For stable scenes, use lower beta. For dynamic scenes with speed changes, use higher beta.

---

### `filtering.oneEuroConfig.dCutoff`

**Type**: Number
**Default**: `1.0`
**Range**: 0.01 - 10.0

**Description**: Cutoff frequency for derivative (velocity) calculation.

**When to adjust**:
- Rarely needs changing from default
- Lower = smoother velocity estimation
- Higher = more responsive velocity tracking

---

## Coordinate Systems

Controls which coordinate systems are calculated.

### `coordinates.normalized`

**Type**: Boolean
**Default**: `true`

**Description**: Calculate normalized coordinates (0-1 range, resolution-independent).

**Keep enabled** for application logic and recording. Required for resolution-independent pose analysis.

---

### `coordinates.pixel`

**Type**: Boolean
**Default**: `true`

**Description**: Calculate pixel coordinates for canvas rendering.

**Keep enabled** if using DisplayModule or custom canvas rendering.

---

### `coordinates.world`

**Type**: Boolean
**Default**: `false` (future feature)

**Description**: Calculate 3D world coordinates relative to camera.

**Note**: Not implemented in MVP.

---

## Display Settings

Controls visualization and GUI behavior.

### `display.enabled`

**Type**: Boolean
**Default**: `true`

**Description**: Enable/disable visualization.

**When to disable**:
- Headless mode (data collection only)
- Custom rendering implementation
- Performance testing

**Example**:
```yaml
display:
  enabled: false  # No visualization, detection only
```

---

### `display.mode`

**Type**: String
**Default**: `"overlay"`
**Options**: `"overlay"` | `"stickFigure"` | `"keypoints"` | `"none"`

**Description**: Visualization mode.

**Modes**:

#### Overlay Mode
Shows skeleton and keypoints over webcam feed.
- **Best for**: Real-time feedback, full context, demonstrations
- **Performance**: Moderate (draws video + skeleton)

#### Stick Figure Mode
Simplified pose on solid background.
- **Best for**: Clean visualization, motion analysis, presentations
- **Performance**: Fast (no video rendering)

#### Keypoints Mode
Individual joints only, no skeleton connections.
- **Best for**: Debugging, specific joint tracking
- **Performance**: Fastest rendering

#### None Mode
No visualization (detection continues).
- **Best for**: Headless use, custom rendering, data collection
- **Performance**: No rendering overhead

**Example**:
```yaml
display:
  mode: "stickFigure"  # Clean visualization
```

---

### Overlay Mode Settings

```yaml
display:
  overlay:
    showWebcam: true           # Show video background
    showSkeleton: true         # Draw skeleton connections
    showKeypoints: true        # Draw keypoint circles
    keypointRadius: 5          # Circle size in pixels
    lineWidth: 2               # Skeleton line width
    confidenceColorCoding: false  # Color by confidence (future)
```

**Customization examples**:

```yaml
# Skeleton only, no keypoint circles
overlay:
  showWebcam: true
  showSkeleton: true
  showKeypoints: false

# Thicker lines for presentations
overlay:
  keypointRadius: 8
  lineWidth: 4
```

---

### Stick Figure Mode Settings

```yaml
display:
  stickFigure:
    backgroundColor: "#000000"  # Hex color
    figureColor: "#00FF00"      # Skeleton/keypoint color
    showKeypoints: true         # Show joint circles
```

**Customization examples**:

```yaml
# White figure on dark background
stickFigure:
  backgroundColor: "#1a1a1a"
  figureColor: "#ffffff"

# Minimal skeleton, no keypoints
stickFigure:
  showKeypoints: false
```

---

### Keypoints Mode Settings

```yaml
display:
  keypoints:
    showAll: true              # Show all 33 keypoints
    visibleJoints: "all"       # Or array: ["nose", "left_wrist", "right_wrist"]
    radius: 5                  # Circle radius
```

**Customization examples**:

```yaml
# Show only hands and face
keypoints:
  showAll: false
  visibleJoints:
    - "nose"
    - "left_wrist"
    - "right_wrist"
    - "left_thumb"
    - "right_thumb"
```

---

## Storage Settings (Future)

**Status**: Not implemented in MVP

```yaml
storage:
  enabled: false
  format: "json"                  # json | csv
  sessionPath: "./sessions"
  autoSave: false
  includeTimestamps: true
  includeConfidence: true
```

Will be used for recording pose sessions to disk.

---

## API Settings (Future)

**Status**: Not implemented in MVP

```yaml
api:
  enabled: false
  port: 3001
  endpoints:
    current: "/api/pose/current"  # GET current pose
    stream: "/api/pose/stream"    # SSE stream
```

Will be used for REST API access to pose data.

---

## Common Configuration Scenarios

### Scenario 1: Maximum Performance

For low-end hardware or when FPS is critical.

```yaml
detector:
  modelPath: "./models/pose_landmarker_lite.task"  # Fastest model
  minDetectionConfidence: 0.5
  minTrackingConfidence: 0.4  # Keep tracking longer

performance:
  targetFps: 30
  enableGpu: true  # GPU is essential

filtering:
  enabled: true
  oneEuroConfig:
    minCutoff: 1.5  # Less smoothing = faster processing

display:
  mode: "stickFigure"  # No video rendering
```

---

### Scenario 2: Maximum Accuracy

For precise motion capture or analysis.

```yaml
detector:
  modelPath: "./models/pose_landmarker_heavy.task"  # Most accurate
  minDetectionConfidence: 0.6  # Higher threshold
  minTrackingConfidence: 0.6

performance:
  targetFps: 24  # Accept lower FPS
  enableGpu: true

filtering:
  enabled: true
  oneEuroConfig:
    minCutoff: 0.7  # More smoothing = more stable
    beta: 0.005     # Less velocity adaptation
```

---

### Scenario 3: Gaming / Real-time Control

For responsive character control or interactive applications.

```yaml
detector:
  modelPath: "./models/pose_landmarker_full.task"
  minDetectionConfidence: 0.5
  minTrackingConfidence: 0.4

performance:
  targetFps: 30
  enableGpu: true

filtering:
  enabled: true
  oneEuroConfig:
    minCutoff: 2.0   # Very responsive
    beta: 0.015      # Adapt to speed changes

display:
  mode: "none"  # No visualization overhead
```

---

### Scenario 4: Demo / Presentation

For smooth, visually appealing presentations.

```yaml
detector:
  modelPath: "./models/pose_landmarker_full.task"
  minDetectionConfidence: 0.5
  minTrackingConfidence: 0.5

performance:
  targetFps: 30
  enableGpu: true

filtering:
  enabled: true
  oneEuroConfig:
    minCutoff: 0.5   # Very smooth
    beta: 0.007

display:
  mode: "overlay"
  overlay:
    showWebcam: true
    showSkeleton: true
    showKeypoints: true
    keypointRadius: 6
    lineWidth: 3  # Thicker for visibility
```

---

### Scenario 5: Headless Data Collection

For recording pose data without visualization.

```yaml
detector:
  modelPath: "./models/pose_landmarker_full.task"
  minDetectionConfidence: 0.5
  minTrackingConfidence: 0.5

performance:
  targetFps: 30
  enableGpu: true

filtering:
  enabled: false  # Raw data for analysis

coordinates:
  normalized: true  # Resolution-independent
  pixel: false      # Don't need pixel coords

display:
  enabled: false  # No visualization
```

---

## Validation and Errors

### Configuration Validation

The ConfigManager validates configuration on load:

```javascript
const configManager = new ConfigManager();
try {
  await configManager.loadConfig();
} catch (error) {
  console.error('Invalid configuration:', error.message);
}
```

### Common Validation Errors

**Missing required fields**:
```
Error: Missing required field: detector.modelPath
```
**Solution**: Ensure all required fields are present in config.yaml

**Invalid values**:
```
Error: detector.minDetectionConfidence must be between 0 and 1
```
**Solution**: Check value ranges match documentation

**Invalid model path**:
```
Error: Failed to load model: ./models/invalid.task
```
**Solution**: Verify model file exists and path is correct

**Invalid display mode**:
```
Error: Invalid display mode: 'invalid'. Must be: overlay, stickFigure, keypoints, none
```
**Solution**: Use one of the valid mode strings

---

## Runtime Configuration Changes

### Hot-Reload (Automatic)

**NEW**: The system supports automatic configuration hot-reload without server restart!

#### How It Works

1. Edit `/config/config.yaml` with any text editor
2. Save the file
3. Server automatically detects the change
4. New configuration is validated
5. Changes are broadcast to all connected browser clients via Server-Sent Events (SSE)
6. Applications automatically apply compatible changes

#### What Can Be Hot-Reloaded

**Fully supported** (applied immediately):
- Display mode (`display.mode`)
- Visualization settings (`display.overlay`, `display.stickFigure`, etc.)
- Filter parameters (`filtering.oneEuroConfig.minCutoff`, `beta`, `dCutoff`)
- Performance settings (`performance.targetFps`, `enableGpu`)
- Detection confidence thresholds
- Most configuration options

**Requires restart**:
- Model selection (`detector.modelPath`) - Model must be reloaded
- Running mode changes - Detector must be reinitialized

#### Usage Example

```bash
# Terminal 1: Start server
npm start

# Terminal 2 (or any editor): Edit config
vim config/config.yaml
# Change: filtering.oneEuroConfig.minCutoff: 0.5

# Server automatically detects and broadcasts change
# Connected clients automatically apply new filter settings
```

#### Technical Details

- **Protocol**: Server-Sent Events (SSE) over `/api/config/watch`
- **Debouncing**: 100ms debounce prevents rapid-fire updates
- **Validation**: Config is validated before broadcast (errors logged but don't crash)
- **Multiple clients**: All connected browsers receive updates simultaneously
- **Auto-reconnect**: Clients automatically reconnect if connection drops

### Via UI

- **Model selection**: Dropdown in application
- **Display mode**: Mode selector dropdown

### Programmatically

```javascript
// Subscribe to config changes
dataBus.onConfigChanged((newConfig) => {
  console.log('Config updated:', newConfig);
  // React to changes
});

// Manually change display mode
displayModule.setMode('stickFigure');

// Emit config change event (hot-reload does this automatically)
dataBus.emitConfigChanged(newConfig);
```

---

## Configuration Best Practices

### 1. Start with Defaults

Use default configuration and adjust based on needs.

### 2. Test Performance

Monitor FPS and adjust model/settings accordingly:
```javascript
dataBus.onFpsUpdate((fps) => {
  if (fps < 20) {
    console.warn('Low FPS, consider lite model or adjust settings');
  }
});
```

### 3. Tune Filtering Gradually

Adjust `minCutoff` in small increments (0.1-0.2) and observe effect.

### 4. Match Model to Use Case

| Use Case | Recommended Model |
|----------|------------------|
| Real-time game control | lite |
| General pose detection | full |
| Motion capture | heavy |
| Mobile devices | lite |
| Desktop analysis | full or heavy |

### 5. Document Custom Configurations

If you create custom configs, document why you chose those settings.

---

## Example Configurations

See `/config/config.example.yaml` for complete example with all options documented.

---

## Further Reading

- **Main README**: Setup and usage guide
- **API Documentation**: `/documentation/API.md`
- **MediaPipe Pose**: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker

---

**Questions? Check troubleshooting in main README or file an issue.**
