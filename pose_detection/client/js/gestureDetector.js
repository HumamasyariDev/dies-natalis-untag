/**
 * Gesture Detector Module (Sprint 12)
 * Recognizes predefined gestures from pose sequences using temporal pattern matching
 */

import { KEYPOINT_NAMES } from './poseDetector.js';

export class GestureDetector {
  constructor(dataBus, config) {
    this.dataBus = dataBus;
    this.config = config;
    this.enabled = config?.enabled !== false;

    // Pose history buffer (ring buffer for last 3 seconds)
    this.poseHistory = [];
    this.maxHistoryDuration = 3000; // milliseconds

    // Gesture definitions
    this.gestures = [];

    // Debounce tracking
    this.lastGestureTime = new Map();

    // Motion tracking for gestures that require movement
    this.motionHistory = new Map();

    // Subscription handles so we can unsubscribe cleanly on disable/destroy.
    this.unsubscribePose = null;
    this.unsubscribeConfig = null;

    // Bind handlers so subscribe/unsubscribe references match.
    this.onPoseDetected = (poseData) => {
      if (poseData.detected) {
        this.addToHistory(poseData);
        this.detectGestures();
      }
    };
    this.onConfigChanged = (newConfig) => this.handleConfigChange(newConfig);

    // Config-change subscription is permanent — we always want to listen
    // for re-enable events, even while disabled.
    this.unsubscribeConfig = this.dataBus.onConfigChanged(this.onConfigChanged);

    if (this.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize gesture detector
   */
  async initialize() {
    console.log('[GestureDetector] Initializing gesture recognition');

    // Load gesture definitions
    await this.loadGestures();

    this.subscribeToPose();

    console.log(`[GestureDetector] Loaded ${this.gestures.length} gesture definitions`);
  }

  /**
   * (Re-)subscribe to pose events. Safe to call multiple times — a
   * second call without an unsubscribe in between is a no-op so we
   * never double-fire.
   */
  subscribeToPose() {
    if (this.unsubscribePose) return;
    this.unsubscribePose = this.dataBus.onPoseDetected(this.onPoseDetected);
  }

  unsubscribeFromPose() {
    if (this.unsubscribePose) {
      this.unsubscribePose();
      this.unsubscribePose = null;
    }
  }

  /**
   * Load gesture definitions from config
   */
  async loadGestures() {
    try {
      // Fetch gestures.yaml from server
      const response = await fetch('/config/gestures.yaml');
      if (!response.ok) {
        console.warn('[GestureDetector] gestures.yaml not found, using empty gesture set');
        return;
      }

      const yamlText = await response.text();

      // Parse YAML (simple parser for our use case)
      const gesturesData = this.parseGesturesYAML(yamlText);

      if (gesturesData && gesturesData.gestures) {
        this.gestures = gesturesData.gestures;
      }
    } catch (error) {
      console.error('[GestureDetector] Error loading gestures:', error);
    }
  }

  /**
   * Simple YAML parser for gesture definitions
   * @param {string} yamlText - YAML content
   * @returns {Object} Parsed gestures object
   */
  /**
   * Extract a string value following a `key:` prefix. Tolerates either
   * a quoted value (`name: "wave"`) or a bare token (`name: wave`).
   * Returns null if no value can be parsed.
   */
  static parseStringValue(line) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return null;
    const raw = line.slice(colonIdx + 1).trim();
    if (!raw) return null;
    if (raw.startsWith('"')) {
      const end = raw.indexOf('"', 1);
      return end === -1 ? raw.slice(1) : raw.slice(1, end);
    }
    if (raw.startsWith("'")) {
      const end = raw.indexOf("'", 1);
      return end === -1 ? raw.slice(1) : raw.slice(1, end);
    }
    // Bare token — stop at first whitespace or comment.
    const m = raw.match(/^[^\s#]+/);
    return m ? m[0] : null;
  }

  parseGesturesYAML(yamlText) {
    // This is a simplified YAML parser - in production, use a proper YAML library
    // For now, we'll convert it to JSON-like structure
    const gestures = [];
    const lines = yamlText.split('\n');
    let currentGesture = null;
    let currentConditions = null;
    let currentKeypoints = null;
    let currentMotion = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // New gesture
      if (trimmed.startsWith('- name:')) {
        if (currentGesture) {
          gestures.push(currentGesture);
        }
        currentGesture = {
          name: GestureDetector.parseStringValue(trimmed.slice(2)) || 'unnamed_gesture',
          threshold: 0.8,
          timeWindow: 1.0,
          debounceTime: 2000,
          conditions: [],
          motion: null
        };
        currentConditions = null;
        currentKeypoints = null;
        currentMotion = null;
      }

      // Gesture properties
      if (currentGesture) {
        if (trimmed.includes('threshold:')) {
          currentGesture.threshold = parseFloat(trimmed.split(':')[1]);
        } else if (trimmed.includes('timeWindow:')) {
          currentGesture.timeWindow = parseFloat(trimmed.split(':')[1]);
        } else if (trimmed.includes('debounceTime:')) {
          currentGesture.debounceTime = parseInt(trimmed.split(':')[1]);
        } else if (trimmed.includes('description:')) {
          currentGesture.description = GestureDetector.parseStringValue(trimmed) || '';
        } else if (trimmed === 'conditions:') {
          // Start of conditions array
        } else if (trimmed === '- keypoints:') {
          currentKeypoints = [];
          currentConditions = { keypoints: currentKeypoints };
          currentGesture.conditions.push(currentConditions);
        } else if (trimmed === 'motion:') {
          currentMotion = {};
          currentGesture.motion = currentMotion;
        } else if (currentMotion && trimmed.includes(':')) {
          // Motion property
          const [key, value] = trimmed.split(':').map(s => s.trim());
          if (value.startsWith('"')) {
            currentMotion[key] = value.replace(/"/g, '');
          } else {
            currentMotion[key] = parseFloat(value) || value;
          }
        } else if (currentKeypoints && trimmed.startsWith('- name:')) {
          // New keypoint condition
          const keypointCondition = {
            name: GestureDetector.parseStringValue(trimmed.slice(2)) || ''
          };
          currentKeypoints.push(keypointCondition);
        } else if (currentKeypoints && currentKeypoints.length > 0) {
          // Keypoint property
          const lastKeypoint = currentKeypoints[currentKeypoints.length - 1];
          if (trimmed.includes(':')) {
            const [key, value] = trimmed.split(':').map(s => s.trim());
            if (key.includes('_range')) {
              // Parse range like [0.25, 0.45]
              const nums = value.match(/[\d.]+/g);
              if (nums && nums.length === 2) {
                lastKeypoint[key] = [parseFloat(nums[0]), parseFloat(nums[1])];
              }
            } else if (value.startsWith('"')) {
              lastKeypoint[key] = value.replace(/"/g, '');
            } else {
              lastKeypoint[key] = parseFloat(value) || value;
            }
          }
        }
      }
    }

    // Add last gesture
    if (currentGesture) {
      gestures.push(currentGesture);
    }

    return { gestures };
  }

  /**
   * Add pose data to history buffer
   * @param {Object} poseData - Pose data from detector
   */
  addToHistory(poseData) {
    const timestamp = poseData.timestamp || Date.now();

    this.poseHistory.push({
      timestamp,
      pose: poseData.pose,
      fps: poseData.fps
    });

    // Remove old entries (older than maxHistoryDuration)
    const cutoffTime = timestamp - this.maxHistoryDuration;
    this.poseHistory = this.poseHistory.filter(entry => entry.timestamp > cutoffTime);
  }

  /**
   * Detect gestures from current pose history
   */
  detectGestures() {
    if (this.poseHistory.length === 0) return;

    const now = Date.now();

    for (const gesture of this.gestures) {
      // Check debounce
      const lastTime = this.lastGestureTime.get(gesture.name) || 0;
      if (now - lastTime < gesture.debounceTime) {
        continue;
      }

      // Score the gesture
      const confidence = this.scoreGesture(gesture);

      // Check if gesture is recognized
      if (confidence >= gesture.threshold) {
        this.recognizeGesture(gesture, confidence);
        this.lastGestureTime.set(gesture.name, now);
      }
    }
  }

  /**
   * Score a gesture based on current pose history
   * @param {Object} gesture - Gesture definition
   * @returns {number} Confidence score (0-1)
   */
  scoreGesture(gesture) {
    if (this.poseHistory.length === 0) return 0;

    const currentPose = this.poseHistory[this.poseHistory.length - 1];
    if (!currentPose || !currentPose.pose) return 0;

    let totalScore = 0;
    let totalConditions = 0;

    // Check static conditions
    for (const conditionSet of gesture.conditions) {
      if (conditionSet.keypoints) {
        for (const kp of conditionSet.keypoints) {
          totalConditions++;
          const score = this.checkKeypointCondition(currentPose.pose, kp);
          totalScore += score;
        }
      }
    }

    // Check motion conditions if present
    if (gesture.motion) {
      totalConditions++;
      const motionScore = this.checkMotionCondition(gesture);
      totalScore += motionScore;
    }

    return totalConditions > 0 ? totalScore / totalConditions : 0;
  }

  /**
   * Check if a keypoint condition is met
   * @param {Object} pose - Current pose data
   * @param {Object} condition - Keypoint condition
   * @returns {number} Score (0-1)
   */
  checkKeypointCondition(pose, condition) {
    const keypointIndex = KEYPOINT_NAMES.indexOf(condition.name);
    if (keypointIndex === -1) return 0;

    // Normalized coords may be absent if the only enabled coordinate
    // system is `world`. Treat that as "can't evaluate condition".
    if (!pose || !pose.normalized) return 0;

    const keypoint = pose.normalized[keypointIndex];
    if (!keypoint || keypoint.visibility < 0.5) return 0;

    let score = 1.0;
    let checks = 0;
    let passed = 0;

    // Y range check
    if (condition.y_range) {
      checks++;
      const [min, max] = condition.y_range;
      if (keypoint.y >= min && keypoint.y <= max) {
        passed++;
      }
    }

    // Y less than another keypoint
    if (condition.y_less_than) {
      checks++;
      if (typeof condition.y_less_than === 'string') {
        const otherIndex = KEYPOINT_NAMES.indexOf(condition.y_less_than);
        if (otherIndex !== -1 && pose.normalized[otherIndex]) {
          const diff = pose.normalized[otherIndex].y - keypoint.y;
          const minDiff = condition.y_difference_min || 0;
          if (diff >= minDiff) {
            passed++;
          }
        }
      } else {
        if (keypoint.y < condition.y_less_than) {
          passed++;
        }
      }
    }

    // Y greater than another keypoint
    if (condition.y_greater_than) {
      checks++;
      if (typeof condition.y_greater_than === 'string') {
        const otherIndex = KEYPOINT_NAMES.indexOf(condition.y_greater_than);
        if (otherIndex !== -1 && pose.normalized[otherIndex]) {
          const diff = keypoint.y - pose.normalized[otherIndex].y;
          const minDiff = condition.y_difference_min || 0;
          if (diff >= minDiff) {
            passed++;
          }
        }
      } else {
        if (keypoint.y > condition.y_greater_than) {
          passed++;
        }
      }
    }

    // X less than another keypoint
    if (condition.x_less_than) {
      checks++;
      const otherIndex = KEYPOINT_NAMES.indexOf(condition.x_less_than);
      if (otherIndex !== -1 && pose.normalized[otherIndex]) {
        const diff = pose.normalized[otherIndex].x - keypoint.x;
        const minDiff = condition.x_difference_min || 0;
        if (diff >= minDiff) {
          passed++;
        }
      }
    }

    // X greater than another keypoint
    if (condition.x_greater_than) {
      checks++;
      const otherIndex = KEYPOINT_NAMES.indexOf(condition.x_greater_than);
      if (otherIndex !== -1 && pose.normalized[otherIndex]) {
        const diff = keypoint.x - pose.normalized[otherIndex].x;
        const minDiff = condition.x_difference_min || 0;
        if (diff >= minDiff) {
          passed++;
        }
      }
    }

    // X range check
    if (condition.x_range) {
      checks++;
      const [min, max] = condition.x_range;
      if (keypoint.x >= min && keypoint.x <= max) {
        passed++;
      }
    }

    return checks > 0 ? passed / checks : 1.0;
  }

  /**
   * Check motion condition for a gesture
   * @param {Object} gesture - Gesture definition
   * @returns {number} Score (0-1)
   */
  checkMotionCondition(gesture) {
    if (!gesture.motion) return 0;

    const { keypoint: keypointName, direction, amplitude_min, velocity_min } = gesture.motion;

    const keypointIndex = KEYPOINT_NAMES.indexOf(keypointName);
    if (keypointIndex === -1) return 0;

    // Need at least 10 frames to detect motion
    if (this.poseHistory.length < 10) return 0;

    // Get keypoint positions inside the gesture's configured time window.
    // The previous implementation took the last 30 entries assuming a
    // fixed 30 FPS — at higher framerates that's a much shorter wall-time
    // window and motion thresholds become unreliable.
    const windowMs = (gesture.timeWindow || 1.0) * 1000;
    const lastTs = this.poseHistory[this.poseHistory.length - 1].timestamp;
    const cutoff = lastTs - windowMs;

    const positions = this.poseHistory
      .filter(entry => entry.timestamp >= cutoff)
      .map(entry => entry.pose?.normalized?.[keypointIndex])
      .filter(kp => kp && kp.visibility > 0.5);

    if (positions.length < 5) return 0;

    // Calculate movement
    if (direction === 'horizontal') {
      const xPositions = positions.map(p => p.x);
      const amplitude = Math.max(...xPositions) - Math.min(...xPositions);

      if (amplitude >= (amplitude_min || 0.1)) {
        return 1.0;
      }
    } else if (direction === 'vertical') {
      const yPositions = positions.map(p => p.y);
      const amplitude = Math.max(...yPositions) - Math.min(...yPositions);

      if (amplitude >= (amplitude_min || 0.1)) {
        return 1.0;
      }
    }

    return 0;
  }

  /**
   * Recognize and emit gesture event
   * @param {Object} gesture - Recognized gesture
   * @param {number} confidence - Confidence score
   */
  recognizeGesture(gesture, confidence) {
    const gestureData = {
      name: gesture.name,
      description: gesture.description || gesture.name,
      confidence: Math.round(confidence * 100) / 100,
      timestamp: Date.now()
    };

    console.log(`[GestureDetector] Recognized: ${gesture.name} (${(confidence * 100).toFixed(0)}%)`);

    this.dataBus.emitGestureRecognized(gestureData);
  }

  /**
   * Handle configuration changes
   * @param {Object} newConfig - New configuration
   */
  handleConfigChange(newConfig) {
    const wasEnabled = this.enabled;
    this.enabled = newConfig?.gestures?.enabled !== false;

    if (!wasEnabled && this.enabled) {
      console.log('[GestureDetector] Gesture recognition enabled via config change');
      this.loadGestures();
      // Re-establish the pose subscription that was dropped on disable
      // (or never created if the detector started disabled).
      this.subscribeToPose();
    } else if (wasEnabled && !this.enabled) {
      console.log('[GestureDetector] Gesture recognition disabled via config change');
      this.unsubscribeFromPose();
      this.clearHistory();
    }
  }

  /**
   * Get current status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      enabled: this.enabled,
      gestureCount: this.gestures.length,
      historyLength: this.poseHistory.length,
      historyDuration: this.poseHistory.length > 0
        ? this.poseHistory[this.poseHistory.length - 1].timestamp - this.poseHistory[0].timestamp
        : 0
    };
  }

  /**
   * Clear pose history
   */
  clearHistory() {
    this.poseHistory = [];
    this.lastGestureTime.clear();
    this.motionHistory.clear();
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.unsubscribeFromPose();
    if (this.unsubscribeConfig) {
      this.unsubscribeConfig();
      this.unsubscribeConfig = null;
    }
    this.clearHistory();
    this.gestures = [];
    console.log('[GestureDetector] Destroyed');
  }
}

export default GestureDetector;
