/**
 * Unit tests for ConfigManager
 * Tests config loading, validation, and error handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigManager, ConfigValidationError, validateConfig } from '../client/js/configManager.js';

describe('ConfigManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new ConfigManager();
  });

  describe('loadFromString', () => {
    it('should load valid YAML configuration', () => {
      const yaml = `
detector:
  modelPath: "./models/pose_landmarker_lite.task"
  runningMode: "VIDEO"
`;
      const config = configManager.loadFromString(yaml);
      expect(config.detector.modelPath).toBe('./models/pose_landmarker_lite.task');
      expect(config.detector.runningMode).toBe('VIDEO');
    });

    it('should merge with defaults for missing keys', () => {
      const yaml = `
detector:
  modelPath: "./models/pose_landmarker_lite.task"
`;
      const config = configManager.loadFromString(yaml);
      // Should use default for runningMode
      expect(config.detector.runningMode).toBe('VIDEO');
      // Should have default performance settings
      expect(config.performance.targetFps).toBe(30);
      expect(config.performance.enableGpu).toBe(true);
    });

    it('should use all defaults for empty config', () => {
      const config = configManager.loadFromString('');
      expect(config.detector.modelPath).toBe('./models/pose_landmarker_full.task');
      expect(config.performance.targetFps).toBe(30);
      expect(config.filtering.enabled).toBe(true);
    });

    it('should throw on invalid YAML syntax', () => {
      const invalidYaml = `
detector:
  modelPath: [invalid yaml
`;
      expect(() => configManager.loadFromString(invalidYaml))
        .toThrow(ConfigValidationError);
    });
  });

  describe('get', () => {
    beforeEach(() => {
      configManager.loadFromString('');
    });

    it('should get nested config value by path', () => {
      expect(configManager.get('detector.modelPath')).toBe('./models/pose_landmarker_full.task');
      expect(configManager.get('performance.targetFps')).toBe(30);
      expect(configManager.get('display.overlay.keypointRadius')).toBe(5);
    });

    it('should return undefined for non-existent path', () => {
      expect(configManager.get('nonexistent.path')).toBeUndefined();
    });

    it('should throw if config not loaded', () => {
      const newManager = new ConfigManager();
      expect(() => newManager.get('detector.modelPath')).toThrow('Configuration not loaded');
    });
  });

  describe('getConfig', () => {
    it('should return full config after loading', () => {
      configManager.loadFromString('');
      const config = configManager.getConfig();
      expect(config).toHaveProperty('detector');
      expect(config).toHaveProperty('performance');
      expect(config).toHaveProperty('filtering');
    });

    it('should throw if config not loaded', () => {
      expect(() => configManager.getConfig()).toThrow('Configuration not loaded');
    });
  });

  describe('getDefaults', () => {
    it('should return default configuration', () => {
      const defaults = ConfigManager.getDefaults();
      expect(defaults.detector.modelPath).toBe('./models/pose_landmarker_full.task');
      expect(defaults.performance.targetFps).toBe(30);
    });

    it('should return a copy (not reference)', () => {
      const defaults1 = ConfigManager.getDefaults();
      const defaults2 = ConfigManager.getDefaults();
      defaults1.detector.modelPath = 'modified';
      expect(defaults2.detector.modelPath).toBe('./models/pose_landmarker_full.task');
    });
  });
});

describe('validateConfig', () => {
  let validConfig;

  beforeEach(() => {
    validConfig = ConfigManager.getDefaults();
  });

  describe('detector validation', () => {
    it('should accept valid running modes', () => {
      validConfig.detector.runningMode = 'IMAGE';
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.detector.runningMode = 'VIDEO';
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.detector.runningMode = 'LIVE_STREAM';
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should reject invalid running mode', () => {
      validConfig.detector.runningMode = 'INVALID';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
      expect(() => validateConfig(validConfig)).toThrow(/runningMode/);
    });

    it('should validate confidence ranges (0-1)', () => {
      // Valid
      validConfig.detector.minDetectionConfidence = 0.5;
      expect(() => validateConfig(validConfig)).not.toThrow();

      // Too low
      validConfig.detector.minDetectionConfidence = -0.1;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);

      // Too high
      validConfig.detector.minDetectionConfidence = 1.5;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate numPoses is positive integer', () => {
      validConfig.detector.numPoses = 2;
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.detector.numPoses = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);

      validConfig.detector.numPoses = -1;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);

      validConfig.detector.numPoses = 1.5;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('performance validation', () => {
    it('should validate targetFps is positive integer', () => {
      validConfig.performance.targetFps = 60;
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.performance.targetFps = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate enableGpu is boolean', () => {
      validConfig.performance.enableGpu = false;
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.performance.enableGpu = 'yes';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('input validation', () => {
    it('should accept valid input sources', () => {
      validConfig.input.source = 'webcam';
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.input.source = 'video';
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.input.source = 'image';
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should reject invalid input source', () => {
      validConfig.input.source = 'invalid';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate webcamId is non-negative', () => {
      validConfig.input.webcamId = 0;
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.input.webcamId = -1;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('filtering validation', () => {
    it('should accept valid filter types', () => {
      validConfig.filtering.type = 'oneEuro';
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should reject invalid filter type', () => {
      validConfig.filtering.type = 'invalid';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate oneEuro config parameters', () => {
      // Valid ranges
      validConfig.filtering.oneEuroConfig.minCutoff = 1.0;
      validConfig.filtering.oneEuroConfig.beta = 0.007;
      validConfig.filtering.oneEuroConfig.dCutoff = 1.0;
      expect(() => validateConfig(validConfig)).not.toThrow();

      // minCutoff too low
      validConfig.filtering.oneEuroConfig.minCutoff = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('display validation', () => {
    it('should accept valid display modes', () => {
      const modes = ['overlay', 'stickFigure', 'keypoints', 'none'];
      for (const mode of modes) {
        validConfig.display.mode = mode;
        expect(() => validateConfig(validConfig)).not.toThrow();
      }
    });

    it('should reject invalid display mode', () => {
      validConfig.display.mode = 'invalid';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate hex colors', () => {
      // Valid
      validConfig.display.stickFigure.backgroundColor = '#FF0000';
      expect(() => validateConfig(validConfig)).not.toThrow();

      // Invalid - no hash
      validConfig.display.stickFigure.backgroundColor = 'FF0000';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);

      // Invalid - wrong length
      validConfig.display.stickFigure.backgroundColor = '#FFF';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });

    it('should validate overlay settings', () => {
      validConfig.display.overlay.keypointRadius = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);

      validConfig.display.overlay.keypointRadius = 5;
      validConfig.display.overlay.lineWidth = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('storage validation', () => {
    it('should accept valid storage formats', () => {
      validConfig.storage.format = 'json';
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.storage.format = 'csv';
      expect(() => validateConfig(validConfig)).not.toThrow();
    });

    it('should reject invalid storage format', () => {
      validConfig.storage.format = 'xml';
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });

  describe('api validation', () => {
    it('should validate port when API is enabled', () => {
      validConfig.api.enabled = true;
      validConfig.api.port = 3001;
      expect(() => validateConfig(validConfig)).not.toThrow();

      validConfig.api.port = 0;
      expect(() => validateConfig(validConfig)).toThrow(ConfigValidationError);
    });
  });
});

describe('ConfigValidationError', () => {
  it('should include field name', () => {
    const error = new ConfigValidationError('Invalid value', 'detector.runningMode');
    expect(error.name).toBe('ConfigValidationError');
    expect(error.field).toBe('detector.runningMode');
    expect(error.message).toBe('Invalid value');
  });
});
