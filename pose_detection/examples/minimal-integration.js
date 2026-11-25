/**
 * Minimal Integration Example
 *
 * This file demonstrates the absolute minimum code needed to integrate
 * MediaPipe Pose Detection modules into your application.
 *
 * Use this as a starting point for custom integrations.
 */

import { PoseDetector, KEYPOINT_NAMES } from '../client/js/poseDetector.js';
import { FilterPipeline } from '../client/js/filterPipeline.js';
import { DataBus } from '../client/js/dataBus.js';

// ============================================
// STEP 1: Initialize Core Modules
// ============================================

// Configuration
const config = {
  modelPath: './models/pose_landmarker_full.task',
  runningMode: 'VIDEO',
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
};

const filterConfig = {
  minCutoff: 1.0,
  beta: 0.007,
  dCutoff: 1.0
};

// Create instances
const detector = new PoseDetector();
const filterPipeline = new FilterPipeline(filterConfig);
const dataBus = new DataBus();

// Initialize detector
await detector.initialize(config);

// ============================================
// STEP 2: Subscribe to Events
// ============================================

dataBus.onPoseDetected((data) => {
  console.log('Pose detected!');
  console.log('FPS:', data.fps);
  console.log('Number of keypoints:', data.pose.normalized.length);

  // Access specific keypoints
  const nose = data.pose.normalized[0];
  const leftShoulder = data.pose.normalized[11];
  const rightShoulder = data.pose.normalized[12];

  console.log('Nose position:', nose.x, nose.y, 'visibility:', nose.visibility);

  // Use the pose data in your application
  // Example: Send to game engine, trigger animations, record session, etc.
});

dataBus.onPoseLost(() => {
  console.log('Pose tracking lost');
  // Handle lost tracking (e.g., pause game, show warning)
});

dataBus.onFpsUpdate((fps) => {
  console.log('Current FPS:', Math.round(fps));
  // Monitor performance
});

// ============================================
// STEP 3: Setup Video Source
// ============================================

// Get webcam access
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720, facingMode: 'user' }
});

const videoElement = document.createElement('video');
videoElement.srcObject = stream;
videoElement.autoplay = true;

await new Promise((resolve) => {
  videoElement.onloadedmetadata = resolve;
});

// ============================================
// STEP 4: Processing Loop
// ============================================

async function processFrame() {
  const timestamp = performance.now();

  // 1. Run detection
  const detectionResult = await detector.detectForVideo(videoElement, timestamp);

  // 2. Apply smoothing
  const smoothedResult = filterPipeline.filter(detectionResult, timestamp);

  // 3. Emit events
  if (smoothedResult.detected) {
    dataBus.emitPoseDetected(smoothedResult);
  } else {
    dataBus.emitPoseLost();
  }

  if (smoothedResult.fps > 0) {
    dataBus.emitFpsUpdate(smoothedResult.fps);
  }

  // 4. Continue loop
  requestAnimationFrame(processFrame);
}

// Start processing
processFrame();

// ============================================
// STEP 5: Cleanup (when done)
// ============================================

function cleanup() {
  // Stop video stream
  stream.getTracks().forEach(track => track.stop());

  // Remove all event listeners
  dataBus.removeAllListeners();

  console.log('Cleanup complete');
}

// Call cleanup() when your application closes or user stops detection

// ============================================
// KEYPOINT REFERENCE
// ============================================

/*
Available keypoints (access via index or KEYPOINT_NAMES constant):

0: nose                17: left_pinky
1: left_eye_inner      18: right_pinky
2: left_eye            19: left_index
3: left_eye_outer      20: right_index
4: right_eye_inner     21: left_thumb
5: right_eye           22: right_thumb
6: right_eye_outer     23: left_hip
7: left_ear            24: right_hip
8: right_ear           25: left_knee
9: mouth_left          26: right_knee
10: mouth_right        27: left_ankle
11: left_shoulder      28: right_ankle
12: right_shoulder     29: left_heel
13: left_elbow         30: right_heel
14: right_elbow        31: left_foot_index
15: left_wrist         32: right_foot_index
16: right_wrist

Each keypoint has: { x, y, z, visibility }
- x, y: Normalized coordinates (0-1 range)
- z: Depth (negative = closer to camera)
- visibility: Confidence score (0-1)
*/

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example 1: Trigger action when user raises hands
 */
dataBus.onPoseDetected((data) => {
  const leftWrist = data.pose.normalized[15];
  const rightWrist = data.pose.normalized[16];
  const nose = data.pose.normalized[0];

  // Check if both hands are above head
  if (leftWrist.y < nose.y && rightWrist.y < nose.y) {
    console.log('Hands raised!');
    // Trigger your action here
  }
});

/**
 * Example 2: Calculate shoulder width for scaling
 */
dataBus.onPoseDetected((data) => {
  const leftShoulder = data.pose.normalized[11];
  const rightShoulder = data.pose.normalized[12];

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  console.log('Shoulder width (normalized):', shoulderWidth);

  // Use for avatar scaling, distance estimation, etc.
});

/**
 * Example 3: Track specific body part over time
 */
const noseHistory = [];

dataBus.onPoseDetected((data) => {
  const nose = data.pose.normalized[0];
  noseHistory.push({ x: nose.x, y: nose.y, timestamp: data.timestamp });

  // Keep only last 30 frames
  if (noseHistory.length > 30) {
    noseHistory.shift();
  }

  // Calculate movement speed
  if (noseHistory.length >= 2) {
    const prev = noseHistory[noseHistory.length - 2];
    const curr = noseHistory[noseHistory.length - 1];
    const distance = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    );
    console.log('Head movement speed:', distance);
  }
});

/**
 * Example 4: Export pose data for recording
 */
const recordedSession = [];

dataBus.onPoseDetected((data) => {
  // Record normalized coordinates only
  const frame = {
    timestamp: data.timestamp,
    keypoints: data.pose.normalized.map(kp => ({
      x: kp.x,
      y: kp.y,
      z: kp.z,
      visibility: kp.visibility
    }))
  };

  recordedSession.push(frame);

  // Export when done
  // JSON.stringify(recordedSession) -> save to file or send to server
});

/**
 * Example 5: Custom visualization (without DisplayModule)
 */
dataBus.onPoseDetected((data) => {
  const canvas = document.getElementById('myCanvas');
  const ctx = canvas.getContext('2d');

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw keypoints
  data.pose.pixel.forEach((kp, idx) => {
    if (kp.visibility > 0.5) {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#00FF00';
      ctx.fill();
    }
  });
});
