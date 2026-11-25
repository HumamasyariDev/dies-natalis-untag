/**
 * Configuration Manager
 * Loads and validates YAML configuration for the pose detection system.
 */

import yaml from 'js-yaml';

// Default configuration values
const DEFAULT_CONFIG = {
  detector: {
    modelPath: './models/pose_landmarker_full.task',
    runningMode: 'VIDEO',
    numPoses: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
    minPosePresenceConfidence: 0.5
  },
  performance: {
    targetFps: 30,
    enableGpu: true
  },
  input: {
    source: 'webcam',
    videoPath: null,
    webcamId: 0,
    frameRate: 30
  },
  filtering: {
    enabled: true,
    type: 'oneEuro',
    oneEuroConfig: {
      minCutoff: 1.0,
      beta: 0.007,
      dCutoff: 1.0
    }
  },
  coordinates: {
    normalized: true,
    pixel: true,
    world: false
  },
  display: {
    enabled: true,
    mode: 'overlay',
    overlay: {
      showWebcam: true,
      showSkeleton: true,
      showKeypoints: true,
      keypointRadius: 5,
      lineWidth: 2,
      confidenceColorCoding: false
    },
    stickFigure: {
      backgroundColor: '#000000',
      figureColor: '#00FF00',
      showKeypoints: true
    },
    keypoints: {
      showAll: true,
      visibleJoints: 'all',
      radius: 5
    }
  },
  storage: {
    enabled: false,
    format: 'json',
    sessionPath: './sessions',
    autoSave: false,
    includeTimestamps: true,
    includeConfidence: true
  },
  api: {
    enabled: false,
    port: 3001,
    endpoints: {
      current: '/api/pose/current',
      stream: '/api/pose/stream'
    }
  }
};

// Validation rules
const VALID_RUNNING_MODES = ['IMAGE', 'VIDEO', 'LIVE_STREAM'];
const VALID_INPUT_SOURCES = ['webcam', 'video', 'image'];
const VALID_FILTER_TYPES = ['oneEuro'];
const VALID_DISPLAY_MODES = ['overlay', 'stickFigure', 'keypoints', 'none'];
const VALID_STORAGE_FORMATS = ['json', 'csv'];

/**
 * Validation error class for config validation failures
 */
export class ConfigValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ConfigValidationError';
    this.field = field;
  }
}

/**
 * Deep merge two objects, with source values overwriting target values
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (target[key] && typeof target[key] === 'object') {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = { ...source[key] };
      }
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Validate a number is within a range
 */
function validateRange(value, min, max, fieldName) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ConfigValidationError(
      `${fieldName} must be a number, got ${typeof value}`,
      fieldName
    );
  }
  if (value < min || value > max) {
    throw new ConfigValidationError(
      `${fieldName} must be between ${min} and ${max}, got ${value}`,
      fieldName
    );
  }
}

/**
 * Validate a value is in a list of valid options
 */
function validateEnum(value, validOptions, fieldName) {
  if (!validOptions.includes(value)) {
    throw new ConfigValidationError(
      `${fieldName} must be one of [${validOptions.join(', ')}], got "${value}"`,
      fieldName
    );
  }
}

/**
 * Validate a value is a boolean
 */
function validateBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new ConfigValidationError(
      `${fieldName} must be a boolean, got ${typeof value}`,
      fieldName
    );
  }
}

/**
 * Validate a value is a positive integer
 */
function validatePositiveInteger(value, fieldName) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ConfigValidationError(
      `${fieldName} must be a positive integer, got ${value}`,
      fieldName
    );
  }
}

/**
 * Validate a hex color string
 */
function validateHexColor(value, fieldName) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new ConfigValidationError(
      `${fieldName} must be a valid hex color (e.g., "#FF0000"), got "${value}"`,
      fieldName
    );
  }
}

/**
 * Validate the entire configuration object
 */
export function validateConfig(config) {
  const errors = [];

  try {
    // Detector validation
    validateEnum(config.detector.runningMode, VALID_RUNNING_MODES, 'detector.runningMode');
    validatePositiveInteger(config.detector.numPoses, 'detector.numPoses');
    validateRange(config.detector.minDetectionConfidence, 0, 1, 'detector.minDetectionConfidence');
    validateRange(config.detector.minTrackingConfidence, 0, 1, 'detector.minTrackingConfidence');
    validateRange(config.detector.minPosePresenceConfidence, 0, 1, 'detector.minPosePresenceConfidence');

    // Performance validation
    validatePositiveInteger(config.performance.targetFps, 'performance.targetFps');
    validateBoolean(config.performance.enableGpu, 'performance.enableGpu');

    // Input validation
    validateEnum(config.input.source, VALID_INPUT_SOURCES, 'input.source');
    if (typeof config.input.webcamId !== 'number' || config.input.webcamId < 0) {
      throw new ConfigValidationError(
        'input.webcamId must be a non-negative integer',
        'input.webcamId'
      );
    }
    // Frame rate is optional (older configs omit it; initWebcam defaults to 30).
    if (config.input.frameRate !== undefined) {
      validatePositiveInteger(config.input.frameRate, 'input.frameRate');
    }

    // Filtering validation
    validateBoolean(config.filtering.enabled, 'filtering.enabled');
    validateEnum(config.filtering.type, VALID_FILTER_TYPES, 'filtering.type');

    if (config.filtering.type === 'oneEuro') {
      validateRange(config.filtering.oneEuroConfig.minCutoff, 0.001, 100, 'filtering.oneEuroConfig.minCutoff');
      validateRange(config.filtering.oneEuroConfig.beta, 0, 10, 'filtering.oneEuroConfig.beta');
      validateRange(config.filtering.oneEuroConfig.dCutoff, 0.001, 100, 'filtering.oneEuroConfig.dCutoff');
    }

    // Coordinates validation
    validateBoolean(config.coordinates.normalized, 'coordinates.normalized');
    validateBoolean(config.coordinates.pixel, 'coordinates.pixel');
    validateBoolean(config.coordinates.world, 'coordinates.world');

    // Display validation
    validateBoolean(config.display.enabled, 'display.enabled');
    validateEnum(config.display.mode, VALID_DISPLAY_MODES, 'display.mode');

    // Overlay settings
    validateBoolean(config.display.overlay.showWebcam, 'display.overlay.showWebcam');
    validateBoolean(config.display.overlay.showSkeleton, 'display.overlay.showSkeleton');
    validateBoolean(config.display.overlay.showKeypoints, 'display.overlay.showKeypoints');
    validatePositiveInteger(config.display.overlay.keypointRadius, 'display.overlay.keypointRadius');
    validatePositiveInteger(config.display.overlay.lineWidth, 'display.overlay.lineWidth');
    validateBoolean(config.display.overlay.confidenceColorCoding, 'display.overlay.confidenceColorCoding');

    // Stick figure settings
    validateHexColor(config.display.stickFigure.backgroundColor, 'display.stickFigure.backgroundColor');
    validateHexColor(config.display.stickFigure.figureColor, 'display.stickFigure.figureColor');
    validateBoolean(config.display.stickFigure.showKeypoints, 'display.stickFigure.showKeypoints');

    // Keypoints settings
    validateBoolean(config.display.keypoints.showAll, 'display.keypoints.showAll');
    validatePositiveInteger(config.display.keypoints.radius, 'display.keypoints.radius');

    // Storage validation
    validateBoolean(config.storage.enabled, 'storage.enabled');
    validateEnum(config.storage.format, VALID_STORAGE_FORMATS, 'storage.format');
    validateBoolean(config.storage.autoSave, 'storage.autoSave');
    validateBoolean(config.storage.includeTimestamps, 'storage.includeTimestamps');
    validateBoolean(config.storage.includeConfidence, 'storage.includeConfidence');

    // API validation
    validateBoolean(config.api.enabled, 'api.enabled');
    if (config.api.enabled) {
      validatePositiveInteger(config.api.port, 'api.port');
    }

  } catch (error) {
    if (error instanceof ConfigValidationError) {
      throw error;
    }
    throw new ConfigValidationError(`Validation error: ${error.message}`, 'unknown');
  }

  return true;
}

/**
 * ConfigManager class for loading and managing configuration
 */
export class ConfigManager {
  constructor() {
    this.config = null;
    this.configPath = null;
  }

  /**
   * Load configuration from YAML string
   */
  loadFromString(yamlString) {
    let parsed;

    try {
      parsed = yaml.load(yamlString);
    } catch (error) {
      throw new ConfigValidationError(
        `Failed to parse YAML: ${error.message}`,
        'yaml'
      );
    }

    // Merge with defaults
    this.config = deepMerge(DEFAULT_CONFIG, parsed || {});

    // Validate
    validateConfig(this.config);

    return this.config;
  }

  /**
   * Load configuration from file (Node.js environment)
   */
  async loadFromFile(filePath) {
    const fs = await import('fs');
    const path = await import('path');

    this.configPath = path.resolve(filePath);

    if (!fs.existsSync(this.configPath)) {
      throw new ConfigValidationError(
        `Config file not found: ${this.configPath}`,
        'configPath'
      );
    }

    const yamlContent = fs.readFileSync(this.configPath, 'utf8');
    return this.loadFromString(yamlContent);
  }

  /**
   * Get the current configuration
   */
  getConfig() {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadFromFile or loadFromString first.');
    }
    return this.config;
  }

  /**
   * Get a specific configuration value by path
   * @param {string} path - Dot-separated path like "detector.modelPath"
   */
  get(path) {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const parts = path.split('.');
    let value = this.config;

    for (const part of parts) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Get default configuration
   */
  static getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

export default ConfigManager;
