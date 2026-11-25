/**
 * Filter Pipeline Module
 * Smoothing layer to reduce jitter in pose keypoint data
 */

import { KEYPOINT_NAMES } from './poseDetector.js';

/**
 * Low-pass filter using exponential smoothing
 */
class LowPassFilter {
  constructor(alpha, initval = 0) {
    this.y = initval;
    this.s = initval;
    this.alpha = alpha;
    this.initialized = false;
  }

  /**
   * Filter a value
   * @param {number} value - Input value
   * @param {number} alpha - Smoothing factor (0-1), higher = less smoothing
   * @returns {number} Filtered value
   */
  filter(value, alpha = null) {
    if (alpha !== null) {
      this.alpha = alpha;
    }

    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = this.alpha * value + (1 - this.alpha) * this.s;
    }

    this.y = this.s;
    return this.y;
  }

  /**
   * Get last filtered value
   */
  lastValue() {
    return this.y;
  }

  /**
   * Reset filter state
   */
  reset() {
    this.initialized = false;
    this.y = 0;
    this.s = 0;
  }
}

/**
 * 1-Euro Filter implementation
 * Reduces jitter while maintaining responsiveness to fast movements
 *
 * Based on: Casiez, G., Roussel, N., & Vogel, D. (2012).
 * "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
 */
export class OneEuroFilter {
  /**
   * Create a 1-Euro filter
   * @param {number} freq - Initial frequency (Hz), typically framerate
   * @param {number} minCutoff - Minimum cutoff frequency (lower = more smoothing)
   * @param {number} beta - Speed coefficient (higher = faster response to motion)
   * @param {number} dCutoff - Derivative cutoff frequency
   */
  constructor(freq, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter(this.alpha(minCutoff));
    this.dxFilter = new LowPassFilter(this.alpha(dCutoff));

    this.lastTime = null;
  }

  /**
   * Compute alpha (smoothing factor) from cutoff frequency
   * @param {number} cutoff - Cutoff frequency in Hz
   * @returns {number} Alpha value (0-1)
   */
  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  /**
   * Filter a value
   * @param {number} x - Input value
   * @param {number} timestamp - Timestamp in milliseconds (optional)
   * @returns {number} Filtered value
   */
  filter(x, timestamp = null) {
    // Update frequency if timestamp provided
    if (timestamp !== null && this.lastTime !== null) {
      const dt = (timestamp - this.lastTime) / 1000; // Convert to seconds
      if (dt > 0) {
        this.freq = 1.0 / dt;
      }
    }
    this.lastTime = timestamp;

    // Compute derivative
    const prevX = this.xFilter.lastValue();
    const dx = this.xFilter.initialized ? (x - prevX) * this.freq : 0;

    // Filter derivative
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff));

    // Compute adaptive cutoff based on derivative magnitude
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter signal with adaptive cutoff
    return this.xFilter.filter(x, this.alpha(cutoff));
  }

  /**
   * Reset filter state
   */
  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }

  /**
   * Update filter parameters
   * @param {Object} params - New parameters
   */
  updateParams(params) {
    if (params.minCutoff !== undefined) this.minCutoff = params.minCutoff;
    if (params.beta !== undefined) this.beta = params.beta;
    if (params.dCutoff !== undefined) this.dCutoff = params.dCutoff;
    if (params.freq !== undefined) this.freq = params.freq;
  }
}

/**
 * FilterPipeline class
 * Manages filter instances for all keypoints and coordinates
 */
export class FilterPipeline {
  /**
   * Create a filter pipeline
   * @param {Object} config - Full application config
   */
  constructor(config) {
    this.config = config;
    this.filters = new Map(); // Map of 'keypoint_axis' -> filter instance
    this.enabled = config.filtering?.enabled ?? true;

    // Initialize filters if enabled
    if (this.enabled) {
      this.initializeFilters();
    }
  }

  /**
   * Initialize all filter instances (33 keypoints × 3 axes = 99 filters)
   */
  initializeFilters() {
    const filterConfig = this.config.filtering?.oneEuroConfig ?? {
      minCutoff: 1.0,
      beta: 0.007,
      dCutoff: 1.0
    };

    const targetFps = this.config.performance?.targetFps ?? 30;

    // Create a filter for each keypoint coordinate
    const axes = ['x', 'y', 'z'];

    for (let i = 0; i < KEYPOINT_NAMES.length; i++) {
      for (const axis of axes) {
        const key = `${i}_${axis}`;
        this.filters.set(key, new OneEuroFilter(
          targetFps,
          filterConfig.minCutoff,
          filterConfig.beta,
          filterConfig.dCutoff
        ));
      }
    }
  }

  /**
   * Process pose data through the filter pipeline
   * @param {Object} poseData - Raw pose data from detector
   * @returns {Object} Filtered pose data (same structure)
   */
  process(poseData) {
    // Pass through if filtering disabled or no pose detected
    if (!this.enabled || !poseData.detected || !poseData.pose) {
      return poseData;
    }

    const timestamp = poseData.timestamp;
    const result = {
      ...poseData,
      pose: {
        normalized: null,
        pixel: null,
        world: null
      }
    };

    // Filter normalized coordinates
    if (poseData.pose.normalized) {
      result.pose.normalized = this.filterKeypoints(
        poseData.pose.normalized,
        timestamp
      );
    }

    // Pixel coordinates are derived from normalized, so we recalculate them
    // from filtered normalized values to maintain consistency
    if (poseData.pose.pixel && result.pose.normalized) {
      result.pose.pixel = this.convertToPixel(
        result.pose.normalized,
        poseData.width,
        poseData.height
      );
    } else if (poseData.pose.pixel) {
      // If only pixel coordinates exist (shouldn't happen in normal flow)
      result.pose.pixel = poseData.pose.pixel;
    }

    // World coordinates pass through for now (stretch goal)
    if (poseData.pose.world) {
      result.pose.world = poseData.pose.world;
    }

    return result;
  }

  /**
   * Filter an array of keypoints
   * @param {Array} keypoints - Array of keypoint objects
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {Array} Filtered keypoints
   */
  filterKeypoints(keypoints, timestamp) {
    return keypoints.map((keypoint) => {
      const filteredX = this.filterValue(keypoint.index, 'x', keypoint.x, timestamp);
      const filteredY = this.filterValue(keypoint.index, 'y', keypoint.y, timestamp);
      const filteredZ = this.filterValue(keypoint.index, 'z', keypoint.z, timestamp);

      return {
        ...keypoint,
        x: filteredX,
        y: filteredY,
        z: filteredZ
      };
    });
  }

  /**
   * Filter a single value
   * @param {number} keypointIndex - Keypoint index (0-32)
   * @param {string} axis - Axis name ('x', 'y', or 'z')
   * @param {number} value - Value to filter
   * @param {number} timestamp - Timestamp in milliseconds
   * @returns {number} Filtered value
   */
  filterValue(keypointIndex, axis, value, timestamp) {
    const key = `${keypointIndex}_${axis}`;
    const filter = this.filters.get(key);

    if (!filter) {
      // Filter not found, return raw value
      return value;
    }

    return filter.filter(value, timestamp);
  }

  /**
   * Convert filtered normalized coordinates to pixel coordinates
   * @param {Array} normalizedKeypoints - Filtered normalized keypoints
   * @param {number} width - Canvas/video width
   * @param {number} height - Canvas/video height
   * @returns {Array} Pixel keypoints
   */
  convertToPixel(normalizedKeypoints, width, height) {
    return normalizedKeypoints.map((keypoint) => ({
      ...keypoint,
      x: Math.round(keypoint.x * width),
      y: Math.round(keypoint.y * height)
      // z remains the same (depth value)
    }));
  }

  /**
   * Reset all filters
   */
  reset() {
    for (const filter of this.filters.values()) {
      filter.reset();
    }
  }

  /**
   * Enable or disable filtering
   * @param {boolean} enabled - Whether filtering should be enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;

    // Initialize filters if enabling for first time
    if (enabled && this.filters.size === 0) {
      this.initializeFilters();
    }
  }

  /**
   * Check if filtering is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Update filter parameters for all filters
   * @param {Object} params - New parameters (minCutoff, beta, dCutoff)
   */
  updateParams(params) {
    for (const filter of this.filters.values()) {
      filter.updateParams(params);
    }

    // Update config
    if (this.config.filtering?.oneEuroConfig) {
      Object.assign(this.config.filtering.oneEuroConfig, params);
    }
  }

  /**
   * Get current filter parameters
   */
  getParams() {
    return {
      enabled: this.enabled,
      type: this.config.filtering?.type ?? 'oneEuro',
      ...this.config.filtering?.oneEuroConfig
    };
  }

  /**
   * Get number of active filters
   */
  getFilterCount() {
    return this.filters.size;
  }
}

export default FilterPipeline;
