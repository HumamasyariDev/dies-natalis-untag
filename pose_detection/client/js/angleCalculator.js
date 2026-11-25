/**
 * Angle Calculator Module
 * Calculates joint angles from pose keypoints
 * Sprint 11: World Coordinates & Angle Calculations
 */

import { KEYPOINT_NAMES } from './poseDetector.js';
import { OneEuroFilter } from './filterPipeline.js';

const SMOOTHING_DEFAULTS = Object.freeze({
  minCutoff: 1.0,
  beta: 0.05,
  dCutoff: 1.0
});

/**
 * Normalize the `angles.smoothing` config field into a canonical object.
 * Accepts:
 *   - undefined / null   → disabled with defaults
 *   - false / true       → disabled/enabled with defaults
 *   - object             → fields override defaults; `enabled` defaults to true
 *                          when in object form unless explicitly false.
 */
export function normalizeSmoothingConfig(value) {
  if (value === true) {
    return { enabled: true, ...SMOOTHING_DEFAULTS };
  }
  if (value === false || value === undefined || value === null) {
    return { enabled: false, ...SMOOTHING_DEFAULTS };
  }
  if (typeof value === 'object') {
    return {
      enabled: value.enabled !== false,
      minCutoff: value.minCutoff ?? SMOOTHING_DEFAULTS.minCutoff,
      beta: value.beta ?? SMOOTHING_DEFAULTS.beta,
      dCutoff: value.dCutoff ?? SMOOTHING_DEFAULTS.dCutoff
    };
  }
  return { enabled: false, ...SMOOTHING_DEFAULTS };
}

/**
 * Smooths a per-frame angle map using one OneEuroFilter per joint.
 * Filters are lazy-created on first valid reading.
 *
 * Input/output shape: { jointName: number|null }
 * - number: passed through the per-joint filter
 * - null:   resets that joint's filter and returns null
 *
 * @internal Implementation detail of AngleCalculator; exported only so
 *           unit tests can target it directly. Production code should
 *           instantiate AngleCalculator, not this class.
 */
export class AngleSmoother {
  constructor(config) {
    // Initial OneEuroFilter freq of 30 Hz matches the default in
    // FilterPipeline; OneEuroFilter adapts from real timestamps after
    // the first sample, so this is just the bootstrap value.
    this.config = config;
    this.filters = new Map();
  }

  smooth(angles, timestamp) {
    if (!this.config.enabled || !angles) {
      return angles;
    }
    const out = {};
    for (const [joint, value] of Object.entries(angles)) {
      if (value === null || value === undefined) {
        const f = this.filters.get(joint);
        if (f) f.reset();
        out[joint] = null;
        continue;
      }
      let filter = this.filters.get(joint);
      if (!filter) {
        filter = new OneEuroFilter(30, this.config.minCutoff, this.config.beta, this.config.dCutoff);
        this.filters.set(joint, filter);
      }
      out[joint] = filter.filter(value, timestamp);
    }
    return out;
  }

  updateConfig(newConfig) {
    this.config = newConfig;
    for (const filter of this.filters.values()) {
      filter.updateParams({
        minCutoff: newConfig.minCutoff,
        beta: newConfig.beta,
        dCutoff: newConfig.dCutoff
      });
    }
  }

  reset() {
    this.filters.clear();
  }
}

/**
 * Calculate angle between three points using dot product
 * @param {Object} point1 - First point {x, y, z}
 * @param {Object} point2 - Middle point (vertex of angle) {x, y, z}
 * @param {Object} point3 - Third point {x, y, z}
 * @returns {number} Angle in degrees (0-180)
 */
export function calculateAngle(point1, point2, point3) {
  // Vectors from vertex to the two other points
  const vector1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
    z: point1.z - point2.z
  };

  const vector2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
    z: point3.z - point2.z
  };

  // Dot product
  const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y + vector1.z * vector2.z;

  // Magnitudes
  const magnitude1 = Math.sqrt(vector1.x ** 2 + vector1.y ** 2 + vector1.z ** 2);
  const magnitude2 = Math.sqrt(vector2.x ** 2 + vector2.y ** 2 + vector2.z ** 2);

  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  // Calculate angle using arccos
  const cosAngle = dotProduct / (magnitude1 * magnitude2);

  // Clamp to [-1, 1] to avoid numerical errors with acos
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));

  // Return angle in degrees
  const angleRadians = Math.acos(clampedCos);
  return (angleRadians * 180) / Math.PI;
}

/**
 * Joint angle definitions
 * Each definition specifies the three keypoint indices: [point1, vertex, point3]
 */
export const JOINT_ANGLES = {
  left_elbow: {
    name: 'left_elbow',
    points: [11, 13, 15], // shoulder -> elbow -> wrist
    description: 'Left elbow flexion/extension'
  },
  right_elbow: {
    name: 'right_elbow',
    points: [12, 14, 16], // shoulder -> elbow -> wrist
    description: 'Right elbow flexion/extension'
  },
  left_knee: {
    name: 'left_knee',
    points: [23, 25, 27], // hip -> knee -> ankle
    description: 'Left knee flexion/extension'
  },
  right_knee: {
    name: 'right_knee',
    points: [24, 26, 28], // hip -> knee -> ankle
    description: 'Right knee flexion/extension'
  },
  left_hip: {
    name: 'left_hip',
    points: [11, 23, 25], // shoulder -> hip -> knee
    description: 'Left hip flexion/extension'
  },
  right_hip: {
    name: 'right_hip',
    points: [12, 24, 26], // shoulder -> hip -> knee
    description: 'Right hip flexion/extension'
  },
  left_shoulder: {
    name: 'left_shoulder',
    points: [13, 11, 23], // elbow -> shoulder -> hip
    description: 'Left shoulder abduction/adduction'
  },
  right_shoulder: {
    name: 'right_shoulder',
    points: [14, 12, 24], // elbow -> shoulder -> hip
    description: 'Right shoulder abduction/adduction'
  },
  left_ankle: {
    name: 'left_ankle',
    points: [25, 27, 31], // knee -> ankle -> foot_index
    description: 'Left ankle angle'
  },
  right_ankle: {
    name: 'right_ankle',
    points: [26, 28, 32], // knee -> ankle -> foot_index
    description: 'Right ankle angle'
  }
};

/**
 * Calculate all joint angles from pose data
 * @param {Object} poseData - Pose data with keypoints
 * @param {Object} config - Angle configuration
 * @returns {Object|null} Object with angle values, or null if pose not detected
 */
export function calculateJointAngles(poseData, config) {
  if (!poseData || !poseData.detected || !poseData.pose) {
    return null;
  }

  // Determine which coordinate system to use
  let keypoints;
  if (config.coordinateSystem === 'world' && poseData.pose.world) {
    keypoints = poseData.pose.world;
  } else if (config.coordinateSystem === 'normalized' && poseData.pose.normalized) {
    keypoints = poseData.pose.normalized;
  } else {
    // Default to normalized if world not available
    keypoints = poseData.pose.normalized;
  }

  if (!keypoints || keypoints.length !== 33) {
    return null;
  }

  const angles = {};

  // Determine which joints to calculate. Treat missing/"all"/non-array as
  // "calculate every defined joint" so a partial angles config that omits
  // joints doesn't crash with "undefined is not iterable".
  const jointsToCalculate = Array.isArray(config.joints)
    ? config.joints
    : Object.keys(JOINT_ANGLES);

  for (const jointName of jointsToCalculate) {
    const jointDef = JOINT_ANGLES[jointName];
    if (!jointDef) {
      continue; // Skip unknown joint names
    }

    const [idx1, idx2, idx3] = jointDef.points;
    const point1 = keypoints[idx1];
    const point2 = keypoints[idx2];
    const point3 = keypoints[idx3];

    // Check if all points have sufficient visibility
    const minVisibility = 0.5; // Threshold for reliable angle calculation
    if (point1.visibility >= minVisibility &&
        point2.visibility >= minVisibility &&
        point3.visibility >= minVisibility) {

      const angle = calculateAngle(point1, point2, point3);
      angles[jointName] = Math.round(angle * 10) / 10; // Round to 1 decimal place
    } else {
      angles[jointName] = null; // Insufficient visibility
    }
  }

  return angles;
}

/**
 * AngleCalculator class - subscribes to Data Bus and calculates angles
 */
export class AngleCalculator {
  constructor(dataBus, config) {
    this.dataBus = dataBus;
    this.config = config || {
      enabled: false,
      joints: 'all',
      coordinateSystem: 'world',
      smoothing: false
    };

    this.enabled = this.config.enabled !== false;
    this.unsubscribe = null;
    this.lastAngles = null;
    this.smoother = new AngleSmoother(normalizeSmoothingConfig(this.config.smoothing));

    // Bind methods
    this.onPoseDetected = this.onPoseDetected.bind(this);
  }

  /**
   * Start listening for pose data and calculating angles
   */
  start() {
    if (!this.enabled) {
      return;
    }

    // Subscribe to pose detected events
    this.unsubscribe = this.dataBus.onPoseDetected(this.onPoseDetected);
  }

  /**
   * Stop listening and calculating angles
   */
  stop() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.smoother.reset();
  }

  /**
   * Handle pose detected event
   * @param {Object} poseData - Pose data from detector
   */
  onPoseDetected(poseData) {
    if (!this.enabled) {
      return;
    }

    const rawAngles = calculateJointAngles(poseData, this.config);
    if (!rawAngles) {
      return;
    }

    const angles = this.smoother.smooth(rawAngles, poseData.timestamp);
    this.lastAngles = angles;

    this.dataBus.emit('angles:calculated', {
      timestamp: poseData.timestamp,
      angles: angles
    });
  }

  /**
   * Get the last calculated angles
   * @returns {Object|null} Last angles or null
   */
  getLastAngles() {
    return this.lastAngles;
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.enabled = this.config.enabled !== false;
    if (newConfig.smoothing !== undefined) {
      this.smoother.updateConfig(normalizeSmoothingConfig(newConfig.smoothing));
    }
  }
}

export default AngleCalculator;
