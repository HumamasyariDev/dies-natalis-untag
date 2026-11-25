/**
 * Unit tests for FilterPipeline module
 * Tests 1-Euro filter algorithm and pipeline management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OneEuroFilter, FilterPipeline } from '../client/js/filterPipeline.js';
import { KEYPOINT_NAMES } from '../client/js/poseDetector.js';

describe('OneEuroFilter', () => {
  describe('constructor', () => {
    it('should initialize with default parameters', () => {
      const filter = new OneEuroFilter(30);
      expect(filter.freq).toBe(30);
      expect(filter.minCutoff).toBe(1.0);
      expect(filter.beta).toBe(0.007);
      expect(filter.dCutoff).toBe(1.0);
    });

    it('should accept custom parameters', () => {
      const filter = new OneEuroFilter(60, 0.5, 0.01, 2.0);
      expect(filter.freq).toBe(60);
      expect(filter.minCutoff).toBe(0.5);
      expect(filter.beta).toBe(0.01);
      expect(filter.dCutoff).toBe(2.0);
    });
  });

  describe('alpha calculation', () => {
    it('should compute alpha correctly for given cutoff', () => {
      const filter = new OneEuroFilter(30);
      const alpha = filter.alpha(1.0);

      // For freq=30, cutoff=1.0:
      // te = 1/30, tau = 1/(2*PI*1.0)
      // alpha = 1 / (1 + tau/te)
      const te = 1.0 / 30;
      const tau = 1.0 / (2 * Math.PI * 1.0);
      const expected = 1.0 / (1.0 + tau / te);

      expect(alpha).toBeCloseTo(expected, 6);
    });

    it('should return higher alpha for higher cutoff', () => {
      const filter = new OneEuroFilter(30);
      const alphaLow = filter.alpha(0.5);
      const alphaHigh = filter.alpha(2.0);

      expect(alphaHigh).toBeGreaterThan(alphaLow);
    });
  });

  describe('filter', () => {
    it('should return first value as-is', () => {
      const filter = new OneEuroFilter(30);
      const result = filter.filter(10);
      expect(result).toBe(10);
    });

    it('should smooth subsequent values', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.0, 1.0); // beta=0 for consistent smoothing

      filter.filter(0);
      const result = filter.filter(10);

      // Should be between 0 and 10 (smoothed)
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('should converge to stable value over time', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.0, 1.0);

      // Start at 0
      filter.filter(0);

      // Send constant value 100 multiple times
      let result;
      for (let i = 0; i < 100; i++) {
        result = filter.filter(100);
      }

      // Should converge close to 100
      expect(result).toBeCloseTo(100, 1);
    });

    it('should reduce jitter in noisy signal', () => {
      const filter = new OneEuroFilter(30, 0.5, 0.0, 1.0);

      // Noisy signal around 50
      const noisyValues = [50, 52, 48, 51, 49, 50, 53, 47, 50, 51];
      const filteredValues = noisyValues.map(v => filter.filter(v));

      // Calculate variance
      const mean = filteredValues.reduce((a, b) => a + b, 0) / filteredValues.length;
      const variance = filteredValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filteredValues.length;

      const noisyMean = noisyValues.reduce((a, b) => a + b, 0) / noisyValues.length;
      const noisyVariance = noisyValues.reduce((sum, v) => sum + Math.pow(v - noisyMean, 2), 0) / noisyValues.length;

      // Filtered variance should be lower
      expect(variance).toBeLessThan(noisyVariance);
    });

    it('should respond faster with higher beta for quick movements', () => {
      const filterLowBeta = new OneEuroFilter(30, 1.0, 0.001, 1.0);
      const filterHighBeta = new OneEuroFilter(30, 1.0, 0.1, 1.0);

      // Quick movement from 0 to 100
      filterLowBeta.filter(0);
      filterHighBeta.filter(0);

      const lowBetaResult = filterLowBeta.filter(100);
      const highBetaResult = filterHighBeta.filter(100);

      // Higher beta should respond faster (closer to 100)
      expect(highBetaResult).toBeGreaterThan(lowBetaResult);
    });

    it('should smooth more with lower minCutoff', () => {
      const filterHighCutoff = new OneEuroFilter(30, 2.0, 0.0, 1.0);
      const filterLowCutoff = new OneEuroFilter(30, 0.1, 0.0, 1.0);

      filterHighCutoff.filter(0);
      filterLowCutoff.filter(0);

      const highCutoffResult = filterHighCutoff.filter(100);
      const lowCutoffResult = filterLowCutoff.filter(100);

      // Lower cutoff = more smoothing = further from 100
      expect(lowCutoffResult).toBeLessThan(highCutoffResult);
    });

    it('should handle timestamps for frequency adaptation', () => {
      const filter = new OneEuroFilter(30);

      filter.filter(0, 0);
      filter.filter(10, 100); // 100ms = 10 FPS

      // Frequency should be updated
      expect(filter.freq).toBeCloseTo(10, 0);
    });
  });

  describe('reset', () => {
    it('should clear filter state', () => {
      const filter = new OneEuroFilter(30);

      // Filter some values
      filter.filter(10);
      filter.filter(20);
      filter.filter(30);

      // Reset
      filter.reset();

      // Next value should be returned as-is
      const result = filter.filter(50);
      expect(result).toBe(50);
    });

    it('should clear timestamp', () => {
      const filter = new OneEuroFilter(30);

      filter.filter(10, 1000);
      filter.reset();

      expect(filter.lastTime).toBeNull();
    });
  });

  describe('updateParams', () => {
    it('should update minCutoff', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
      filter.updateParams({ minCutoff: 0.5 });
      expect(filter.minCutoff).toBe(0.5);
    });

    it('should update beta', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
      filter.updateParams({ beta: 0.01 });
      expect(filter.beta).toBe(0.01);
    });

    it('should update dCutoff', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
      filter.updateParams({ dCutoff: 2.0 });
      expect(filter.dCutoff).toBe(2.0);
    });

    it('should update multiple params at once', () => {
      const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0);
      filter.updateParams({ minCutoff: 0.5, beta: 0.01, dCutoff: 2.0, freq: 60 });

      expect(filter.minCutoff).toBe(0.5);
      expect(filter.beta).toBe(0.01);
      expect(filter.dCutoff).toBe(2.0);
      expect(filter.freq).toBe(60);
    });
  });
});

describe('FilterPipeline', () => {
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      filtering: {
        enabled: true,
        type: 'oneEuro',
        oneEuroConfig: {
          minCutoff: 1.0,
          beta: 0.007,
          dCutoff: 1.0
        }
      },
      performance: {
        targetFps: 30
      },
      coordinates: {
        normalized: true,
        pixel: true,
        world: false
      }
    };
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.config).toBe(mockConfig);
      expect(pipeline.enabled).toBe(true);
    });

    it('should create 99 filters (33 keypoints × 3 axes)', () => {
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.getFilterCount()).toBe(99);
    });

    it('should not create filters when disabled', () => {
      mockConfig.filtering.enabled = false;
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.getFilterCount()).toBe(0);
      expect(pipeline.enabled).toBe(false);
    });

    it('should use default config values when not provided', () => {
      const minimalConfig = {};
      const pipeline = new FilterPipeline(minimalConfig);
      expect(pipeline.enabled).toBe(true);
      expect(pipeline.getFilterCount()).toBe(99);
    });
  });

  describe('process', () => {
    let pipeline;
    let mockPoseData;

    beforeEach(() => {
      pipeline = new FilterPipeline(mockConfig);

      // Create mock pose data
      mockPoseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          normalized: Array.from({ length: 33 }, (_, i) => ({
            index: i,
            name: KEYPOINT_NAMES[i],
            x: 0.5,
            y: 0.5,
            z: -0.05,
            visibility: 0.9,
            presence: 0.95
          })),
          pixel: Array.from({ length: 33 }, (_, i) => ({
            index: i,
            name: KEYPOINT_NAMES[i],
            x: 320,
            y: 240,
            z: -0.05,
            visibility: 0.9,
            presence: 0.95
          })),
          world: null
        }
      };
    });

    it('should return same structure as input', () => {
      const result = pipeline.process(mockPoseData);

      expect(result.timestamp).toBe(mockPoseData.timestamp);
      expect(result.fps).toBe(mockPoseData.fps);
      expect(result.detected).toBe(true);
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
      expect(result.pose.normalized).toHaveLength(33);
      expect(result.pose.pixel).toHaveLength(33);
    });

    it('should preserve keypoint metadata', () => {
      const result = pipeline.process(mockPoseData);

      expect(result.pose.normalized[0].index).toBe(0);
      expect(result.pose.normalized[0].name).toBe('nose');
      expect(result.pose.normalized[0].visibility).toBe(0.9);
      expect(result.pose.normalized[0].presence).toBe(0.95);
    });

    it('should filter coordinate values', () => {
      // First frame initializes filters
      pipeline.process(mockPoseData);

      // Second frame with different values
      const modifiedPoseData = JSON.parse(JSON.stringify(mockPoseData));
      modifiedPoseData.timestamp = 2000;
      modifiedPoseData.pose.normalized[0].x = 0.6;
      modifiedPoseData.pose.normalized[0].y = 0.6;

      const result = pipeline.process(modifiedPoseData);

      // Should be between initial (0.5) and new value (0.6) due to smoothing
      expect(result.pose.normalized[0].x).toBeGreaterThan(0.5);
      expect(result.pose.normalized[0].x).toBeLessThan(0.6);
    });

    it('should recalculate pixel from filtered normalized', () => {
      // First frame
      pipeline.process(mockPoseData);

      // Second frame with movement
      const modifiedPoseData = JSON.parse(JSON.stringify(mockPoseData));
      modifiedPoseData.timestamp = 2000;
      modifiedPoseData.pose.normalized[0].x = 0.6; // Would be pixel 384

      const result = pipeline.process(modifiedPoseData);

      // Pixel should be calculated from filtered normalized value
      const expectedPixelX = Math.round(result.pose.normalized[0].x * 640);
      expect(result.pose.pixel[0].x).toBe(expectedPixelX);
    });

    it('should pass through when filtering disabled', () => {
      pipeline.setEnabled(false);
      const result = pipeline.process(mockPoseData);

      // Should be exact same values
      expect(result).toBe(mockPoseData);
    });

    it('should pass through when no pose detected', () => {
      const noPoseData = {
        timestamp: 1000,
        fps: 30,
        detected: false,
        pose: null
      };

      const result = pipeline.process(noPoseData);
      expect(result).toBe(noPoseData);
    });

    it('should handle pose data without pixel coordinates', () => {
      const normalizedOnlyData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          normalized: mockPoseData.pose.normalized,
          pixel: null,
          world: null
        }
      };

      const result = pipeline.process(normalizedOnlyData);
      expect(result.pose.normalized).toHaveLength(33);
      expect(result.pose.pixel).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all filters', () => {
      const pipeline = new FilterPipeline(mockConfig);

      // Process some data
      const mockPoseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          normalized: Array.from({ length: 33 }, (_, i) => ({
            index: i,
            name: KEYPOINT_NAMES[i],
            x: 0.5,
            y: 0.5,
            z: -0.05,
            visibility: 0.9,
            presence: 0.95
          })),
          pixel: null,
          world: null
        }
      };

      pipeline.process(mockPoseData);
      pipeline.reset();

      // After reset, next value should be returned as-is
      const newData = JSON.parse(JSON.stringify(mockPoseData));
      newData.pose.normalized[0].x = 0.8;
      newData.timestamp = 2000;

      const result = pipeline.process(newData);
      expect(result.pose.normalized[0].x).toBe(0.8);
    });
  });

  describe('setEnabled', () => {
    it('should disable filtering', () => {
      const pipeline = new FilterPipeline(mockConfig);
      pipeline.setEnabled(false);
      expect(pipeline.isEnabled()).toBe(false);
    });

    it('should enable filtering', () => {
      mockConfig.filtering.enabled = false;
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.isEnabled()).toBe(false);

      pipeline.setEnabled(true);
      expect(pipeline.isEnabled()).toBe(true);
    });

    it('should initialize filters when enabling for first time', () => {
      mockConfig.filtering.enabled = false;
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.getFilterCount()).toBe(0);

      pipeline.setEnabled(true);
      expect(pipeline.getFilterCount()).toBe(99);
    });
  });

  describe('updateParams', () => {
    it('should update all filter parameters', () => {
      const pipeline = new FilterPipeline(mockConfig);

      pipeline.updateParams({
        minCutoff: 0.5,
        beta: 0.01
      });

      const params = pipeline.getParams();
      expect(params.minCutoff).toBe(0.5);
      expect(params.beta).toBe(0.01);
    });

    it('should affect filtering behavior', () => {
      const pipeline = new FilterPipeline(mockConfig);

      // Process initial frame
      const mockPoseData = {
        timestamp: 1000,
        fps: 30,
        detected: true,
        width: 640,
        height: 480,
        pose: {
          normalized: Array.from({ length: 33 }, (_, i) => ({
            index: i,
            name: KEYPOINT_NAMES[i],
            x: 0.5,
            y: 0.5,
            z: -0.05,
            visibility: 0.9,
            presence: 0.95
          })),
          pixel: null,
          world: null
        }
      };

      pipeline.process(mockPoseData);

      // Get result with default params
      const frame2 = JSON.parse(JSON.stringify(mockPoseData));
      frame2.timestamp = 2000;
      frame2.pose.normalized[0].x = 0.6;
      const result1 = pipeline.process(frame2);

      // Reset and update params to very low cutoff (more smoothing)
      pipeline.reset();
      pipeline.updateParams({ minCutoff: 0.01 });

      // Process same sequence again
      pipeline.process(mockPoseData);
      const result2 = pipeline.process(frame2);

      // Lower cutoff should result in more smoothing (further from 0.6)
      expect(result2.pose.normalized[0].x).toBeLessThan(result1.pose.normalized[0].x);
    });
  });

  describe('getParams', () => {
    it('should return current parameters', () => {
      const pipeline = new FilterPipeline(mockConfig);
      const params = pipeline.getParams();

      expect(params.enabled).toBe(true);
      expect(params.type).toBe('oneEuro');
      expect(params.minCutoff).toBe(1.0);
      expect(params.beta).toBe(0.007);
      expect(params.dCutoff).toBe(1.0);
    });
  });

  describe('getFilterCount', () => {
    it('should return correct count when enabled', () => {
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.getFilterCount()).toBe(99);
    });

    it('should return 0 when disabled', () => {
      mockConfig.filtering.enabled = false;
      const pipeline = new FilterPipeline(mockConfig);
      expect(pipeline.getFilterCount()).toBe(0);
    });
  });

  describe('filter key generation', () => {
    it('should create unique keys for all keypoint-axis combinations', () => {
      const pipeline = new FilterPipeline(mockConfig);

      // Verify filters exist for specific combinations
      const filter_0_x = pipeline.filters.get('0_x');
      const filter_0_y = pipeline.filters.get('0_y');
      const filter_0_z = pipeline.filters.get('0_z');
      const filter_32_z = pipeline.filters.get('32_z');

      expect(filter_0_x).toBeDefined();
      expect(filter_0_y).toBeDefined();
      expect(filter_0_z).toBeDefined();
      expect(filter_32_z).toBeDefined();
    });
  });

  describe('integration with pose detector output', () => {
    it('should handle typical pose detector output', () => {
      const pipeline = new FilterPipeline(mockConfig);

      // Simulate detector output
      const detectorOutput = {
        timestamp: 16.67, // 60 FPS timing
        fps: 58.2,
        detected: true,
        width: 1280,
        height: 720,
        pose: {
          normalized: KEYPOINT_NAMES.map((name, i) => ({
            index: i,
            name,
            x: 0.3 + Math.random() * 0.4,
            y: 0.2 + Math.random() * 0.6,
            z: -0.1 + Math.random() * 0.2,
            visibility: 0.8 + Math.random() * 0.2,
            presence: 0.9 + Math.random() * 0.1
          })),
          pixel: null,
          world: null
        }
      };

      const result = pipeline.process(detectorOutput);

      expect(result.detected).toBe(true);
      expect(result.pose.normalized).toHaveLength(33);

      // Verify all keypoints are present
      for (let i = 0; i < 33; i++) {
        expect(result.pose.normalized[i].index).toBe(i);
        expect(result.pose.normalized[i].name).toBe(KEYPOINT_NAMES[i]);
      }
    });

    it('should reduce jitter over multiple frames', () => {
      const pipeline = new FilterPipeline(mockConfig);

      // Simulate noisy input over multiple frames
      const baseX = 0.5;
      const frames = [];

      for (let f = 0; f < 30; f++) {
        const noise = (Math.random() - 0.5) * 0.02; // ±1% noise
        const poseData = {
          timestamp: f * 33.33,
          fps: 30,
          detected: true,
          width: 640,
          height: 480,
          pose: {
            normalized: Array.from({ length: 33 }, (_, i) => ({
              index: i,
              name: KEYPOINT_NAMES[i],
              x: baseX + noise,
              y: 0.5,
              z: 0,
              visibility: 0.9,
              presence: 0.95
            })),
            pixel: null,
            world: null
          }
        };

        const result = pipeline.process(poseData);
        frames.push({
          input: baseX + noise,
          output: result.pose.normalized[0].x
        });
      }

      // Calculate variance of input and output
      const inputValues = frames.map(f => f.input);
      const outputValues = frames.map(f => f.output);

      const inputMean = inputValues.reduce((a, b) => a + b) / inputValues.length;
      const outputMean = outputValues.reduce((a, b) => a + b) / outputValues.length;

      const inputVariance = inputValues.reduce((sum, v) => sum + Math.pow(v - inputMean, 2), 0) / inputValues.length;
      const outputVariance = outputValues.reduce((sum, v) => sum + Math.pow(v - outputMean, 2), 0) / outputValues.length;

      // Output should have lower variance (less jitter)
      expect(outputVariance).toBeLessThan(inputVariance);
    });
  });
});
