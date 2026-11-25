/**
 * API Module
 * Forwards pose data from Data Bus to server for external API consumption
 * Runs client-side, sends data to server endpoints
 */

export class ApiModule {
  constructor(dataBus, config) {
    this.dataBus = dataBus;
    this.config = config;
    this.enabled = config?.api?.enabled || false;
    this.updateEndpoint = config?.api?.endpoints?.update || '/api/pose/update';

    // Track API status
    this.connected = false;
    this.failedAttempts = 0;
    this.maxFailedAttempts = 3;

    // Sprint 11: Track current angles
    this.currentAngles = null;

    // Unsubscribe functions
    this.unsubscribePose = null;
    this.unsubscribeAngles = null;

    // Subscribe to config changes (always active)
    this.dataBus.onConfigChanged((newConfig) => {
      this.handleConfigChange(newConfig);
    });

    if (this.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize API module and subscribe to Data Bus
   */
  initialize() {
    console.log('[ApiModule] Initializing - API forwarding enabled');

    // Subscribe to pose:detected events
    this.unsubscribePose = this.dataBus.onPoseDetected((poseData) => {
      this.sendPoseUpdate(poseData);
    });

    // Sprint 11: Subscribe to angles:calculated events
    this.unsubscribeAngles = this.dataBus.onAnglesCalculated((anglesData) => {
      this.currentAngles = anglesData.angles;
    });

    this.connected = true;
  }

  /**
   * Send pose data to server
   * @param {Object} poseData - Pose data from Data Bus
   */
  async sendPoseUpdate(poseData) {
    if (!this.enabled || !this.connected) {
      return;
    }

    try {
      const response = await fetch(this.updateEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: Date.now(),
          detected: poseData.detected !== false,
          pose: poseData.pose || null,
          fps: poseData.fps || null,
          angles: this.currentAngles || null  // Sprint 11: Include angles
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Reset failed attempts on success
      this.failedAttempts = 0;

      // Reset angles after sending to avoid stale data
      this.currentAngles = null;

    } catch (error) {
      this.failedAttempts++;

      // Only log every 10th error to avoid console spam
      if (this.failedAttempts % 10 === 1) {
        console.warn(`[ApiModule] Failed to send pose update (${this.failedAttempts} attempts):`, error.message);
      }

      // Disable after too many failures
      if (this.failedAttempts >= this.maxFailedAttempts && this.connected) {
        console.error(`[ApiModule] Too many failed attempts (${this.maxFailedAttempts}), disabling API forwarding`);
        this.connected = false;
      }
    }
  }

  /**
   * Handle configuration changes
   * @param {Object} newConfig - New configuration
   */
  handleConfigChange(newConfig) {
    const wasEnabled = this.enabled;
    this.enabled = newConfig?.api?.enabled || false;

    if (!wasEnabled && this.enabled) {
      // API was just enabled
      console.log('[ApiModule] API enabled via config change');
      this.connected = true;
      this.failedAttempts = 0;

      if (!this.unsubscribePose) {
        this.initialize();
      }
    } else if (wasEnabled && !this.enabled) {
      // API was just disabled
      console.log('[ApiModule] API disabled via config change');
      this.connected = false;
    }

    // Update endpoint if changed
    if (newConfig?.api?.endpoints?.update) {
      this.updateEndpoint = newConfig.api.endpoints.update;
    }
  }

  /**
   * Manually enable API forwarding
   */
  enable() {
    if (!this.enabled) {
      this.enabled = true;
      this.connected = true;
      this.failedAttempts = 0;

      if (!this.unsubscribePose) {
        this.initialize();
      }

      console.log('[ApiModule] API forwarding enabled');
    }
  }

  /**
   * Manually disable API forwarding
   */
  disable() {
    if (this.enabled) {
      this.enabled = false;
      this.connected = false;
      console.log('[ApiModule] API forwarding disabled');
    }
  }

  /**
   * Get current status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      failedAttempts: this.failedAttempts,
      endpoint: this.updateEndpoint
    };
  }

  /**
   * Cleanup and unsubscribe
   */
  destroy() {
    if (this.unsubscribePose) {
      this.unsubscribePose();
      this.unsubscribePose = null;
    }

    this.connected = false;
    console.log('[ApiModule] Destroyed');
  }
}

export default ApiModule;
