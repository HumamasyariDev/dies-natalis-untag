# Module Integration Examples

This directory contains examples demonstrating how to integrate MediaPipe Pose Detection modules into your own applications.

## Available Examples

### 1. Module Import Example (Interactive)

**File**: `module-import-example.html`

A complete browser-based example showing how to import and use all core modules with a custom UI.

**Features**:
- Full module integration pattern
- Custom UI (different from main application)
- Live keypoint data visualization
- FPS and confidence metrics
- Event-driven architecture demonstration

**How to run**:
```bash
# From project root, start the server
npm start

# Open in browser
http://localhost:3939/examples/module-import-example.html
```

**What you'll learn**:
- How to initialize each module
- How to subscribe to Data Bus events
- How to process video frames
- How to handle webcam access
- How to implement cleanup

---

### 2. Minimal Integration (Code Reference)

**File**: `minimal-integration.js`

The absolute minimum code needed to integrate pose detection into your application.

**What's included**:
- Basic initialization (5 lines)
- Event subscription pattern
- Processing loop setup
- 5 practical usage examples

**How to use**:
```javascript
// Copy the relevant sections into your application
import { PoseDetector } from '../client/js/poseDetector.js';
// ... follow the STEP 1-5 pattern
```

**Best for**:
- Quick start reference
- Understanding the minimal requirements
- Code snippets for common tasks

---

## Integration Patterns

### Pattern 1: Full Application with GUI

Use all modules including DisplayModule for a complete pose detection application.

```javascript
import { PoseDetector } from '../client/js/poseDetector.js';
import { FilterPipeline } from '../client/js/filterPipeline.js';
import { DataBus } from '../client/js/dataBus.js';
import { DisplayModule } from '../client/js/displayModule.js';

// See: module-import-example.html
```

**Use cases**:
- Standalone pose detection tool
- Demo/prototype applications
- Education and research

---

### Pattern 2: Headless Integration

Use only detector and filter, skip DisplayModule for custom rendering or data export.

```javascript
import { PoseDetector } from '../client/js/poseDetector.js';
import { FilterPipeline } from '../client/js/filterPipeline.js';
import { DataBus } from '../client/js/dataBus.js';

// No DisplayModule - handle visualization yourself
dataBus.onPoseDetected((data) => {
  // Send to your game engine
  // Send to your custom renderer
  // Record to database
  // Send over WebSocket
});

// See: minimal-integration.js (STEP 1-4)
```

**Use cases**:
- Game character control
- VR/AR applications
- Motion capture recording
- Data analysis tools

---

### Pattern 3: Detector Only (Minimal)

Just the pose detector for maximum simplicity.

```javascript
import { PoseDetector } from '../client/js/poseDetector.js';

const detector = new PoseDetector();
await detector.initialize(config);

// Process frames directly
const result = await detector.detectForVideo(videoElement, timestamp);
console.log('Pose:', result.pose.normalized);

// See: minimal-integration.js (STEP 1 only)
```

**Use cases**:
- Simple pose queries
- Testing/debugging
- Custom processing pipelines

---

## Common Integration Tasks

### Task 1: Trigger Action on Gesture

```javascript
dataBus.onPoseDetected((data) => {
  const leftWrist = data.pose.normalized[15];
  const rightWrist = data.pose.normalized[16];

  // Check if hands are raised
  if (leftWrist.y < 0.3 && rightWrist.y < 0.3) {
    console.log('Victory pose detected!');
    // Your action here
  }
});
```

### Task 2: Track Body Part Position

```javascript
const positionHistory = [];

dataBus.onPoseDetected((data) => {
  const nose = data.pose.normalized[0];
  positionHistory.push({ x: nose.x, y: nose.y, time: data.timestamp });

  // Keep last 60 frames
  if (positionHistory.length > 60) positionHistory.shift();
});
```

### Task 3: Calculate Distance Between Keypoints

```javascript
dataBus.onPoseDetected((data) => {
  const leftShoulder = data.pose.normalized[11];
  const rightShoulder = data.pose.normalized[12];

  const distance = Math.sqrt(
    Math.pow(rightShoulder.x - leftShoulder.x, 2) +
    Math.pow(rightShoulder.y - leftShoulder.y, 2)
  );

  console.log('Shoulder width:', distance);
});
```

### Task 4: Export Session Data

```javascript
const session = [];

dataBus.onPoseDetected((data) => {
  session.push({
    timestamp: data.timestamp,
    keypoints: data.pose.normalized
  });
});

// When done:
function exportSession() {
  const json = JSON.stringify(session, null, 2);
  // Save to file or send to server
}
```

### Task 5: Custom Visualization

```javascript
dataBus.onPoseDetected((data) => {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw only high-confidence keypoints
  data.pose.pixel.forEach((kp, idx) => {
    if (kp.visibility > 0.7) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF0000';
      ctx.fill();
    }
  });
});
```

---

## Keypoint Reference

### Common Keypoints

| Index | Name | Common Uses |
|-------|------|-------------|
| 0 | nose | Head tracking, face direction |
| 11, 12 | shoulders | Upper body orientation, shoulder width |
| 13, 14 | elbows | Arm tracking, gesture detection |
| 15, 16 | wrists | Hand position, gesture recognition |
| 23, 24 | hips | Lower body orientation, center of mass |
| 25, 26 | knees | Leg tracking, squat detection |
| 27, 28 | ankles | Foot position, jump detection |

### Full List

See `client/js/poseDetector.js` for the complete `KEYPOINT_NAMES` constant (33 keypoints).

---

## Tips for Integration

### 1. Always Initialize Async

```javascript
// ✅ Correct
await detector.initialize(config);

// ❌ Wrong
detector.initialize(config);
```

### 2. Use Data Bus for Decoupling

```javascript
// ✅ Correct: Decoupled modules
dataBus.onPoseDetected((data) => { /* handle */ });

// ❌ Wrong: Tight coupling
detector.onDetection = (data) => { /* handle */ };
```

### 3. Check Visibility Before Using Keypoints

```javascript
// ✅ Correct
if (keypoint.visibility > 0.5) {
  // Use keypoint
}

// ❌ Wrong: Using low-confidence data
const x = keypoint.x; // Might be inaccurate
```

### 4. Handle Pose Lost Events

```javascript
// ✅ Correct
dataBus.onPoseLost(() => {
  console.log('Tracking lost');
  // Pause game, show warning, etc.
});

// ❌ Wrong: Ignoring lost tracking
// User moves out of frame -> your app doesn't respond
```

### 5. Clean Up Resources

```javascript
// ✅ Correct
function cleanup() {
  stream.getTracks().forEach(track => track.stop());
  dataBus.removeAllListeners();
  cancelAnimationFrame(animationId);
}

// ❌ Wrong: Memory leaks
// Camera stays on, listeners accumulate
```

---

## Performance Considerations

### Choose the Right Model

- **Lite** (3MB): Use for mobile, low-end hardware, or when 60 FPS needed
- **Full** (5MB): Recommended default, good balance
- **Heavy** (26MB): Use when accuracy is critical and performance is sufficient

### Optimize Processing Loop

```javascript
// ✅ Good: requestAnimationFrame
function processFrame() {
  // ... detection logic
  requestAnimationFrame(processFrame);
}

// ❌ Bad: setInterval (not synced with display refresh)
setInterval(processFrame, 33);
```

### Reduce Canvas Size for Rendering

```javascript
// If you only need pose data, not high-res video
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 640, height: 480 }  // Lower resolution = better FPS
});
```

---

## Troubleshooting

### "Module not found" Error

**Problem**: `Failed to load module script`

**Solution**:
- Ensure you're running through the Express server (`npm start`)
- Check that import paths are correct relative to HTML file
- Verify all module files exist in `/client/js`

### Pose Not Detected

**Problem**: `detected: false` in all frames

**Solution**:
- Ensure good lighting
- Stand 1-2 meters from camera
- Make sure full body is visible
- Lower `minDetectionConfidence` in config

### Low FPS

**Problem**: FPS < 20

**Solution**:
- Switch to lite model
- Reduce video resolution
- Close other applications
- Check GPU acceleration is enabled

---

## Next Steps

1. **Review the main README**: `/README.md` for full documentation
2. **Check configuration options**: `/config/config.yaml`
3. **Read the specification**: `/documentation/mediapipe-pose-spec.md`
4. **Explore test files**: `/tests` for more usage examples

---

## Questions?

- See troubleshooting in main README
- Check MediaPipe documentation: https://developers.google.com/mediapipe
- Review test files for edge cases and examples
