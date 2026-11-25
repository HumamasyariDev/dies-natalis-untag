/**
 * Data Bus Module
 * Central hub for distributing pose data to consumers using pub-sub pattern
 */

/**
 * Event types supported by the Data Bus
 */
export const EventTypes = {
  POSE_DETECTED: 'pose:detected',
  POSE_LOST: 'pose:lost',
  FPS_UPDATE: 'fps:update',
  CONFIG_CHANGED: 'config:changed',
  // Session events (Sprint 8)
  SESSION_STARTED: 'session:started',
  SESSION_STOPPED: 'session:stopped',
  SESSION_SAVED: 'session:saved',
  SESSION_LOADED: 'session:loaded',
  // Replay events (Sprint 8)
  REPLAY_STARTED: 'replay:started',
  REPLAY_STOPPED: 'replay:stopped',
  REPLAY_PAUSED: 'replay:paused',
  REPLAY_RESUMED: 'replay:resumed',
  REPLAY_PROGRESS: 'replay:progress',
  // Angle events (Sprint 11)
  ANGLES_CALCULATED: 'angles:calculated',
  // Gesture events (Sprint 12)
  GESTURE_RECOGNIZED: 'gesture:recognized'
};

/**
 * DataBus class - Event emitter for pose data distribution
 */
export class DataBus {
  constructor() {
    this.listeners = new Map();
    this.onceListeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (e.g., 'pose:detected')
   * @param {Function} callback - Function to call when event is emitted
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event).add(callback);

    // Return unsubscribe function for convenience
    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event for one-time execution
   * @param {string} event - Event name
   * @param {Function} callback - Function to call once
   * @returns {Function} Unsubscribe function
   */
  once(event, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }

    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }

    this.onceListeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.onceListeners.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - The callback to remove
   * @returns {boolean} True if callback was found and removed
   */
  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const deleted = listeners.delete(callback);

      // Clean up empty listener sets
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }

      return deleted;
    }

    // Also check once listeners
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      const deleted = onceListeners.delete(callback);

      if (onceListeners.size === 0) {
        this.onceListeners.delete(event);
      }

      return deleted;
    }

    return false;
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Data to pass to callbacks
   */
  emit(event, data) {
    // Call regular listeners
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in listener for event '${event}':`, error);
        }
      }
    }

    // Call and remove once listeners
    const onceListeners = this.onceListeners.get(event);
    if (onceListeners) {
      for (const callback of onceListeners) {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in once listener for event '${event}':`, error);
        }
      }
      this.onceListeners.delete(event);
    }
  }

  /**
   * Remove all listeners for an event, or all events if no event specified
   * @param {string} [event] - Optional event name
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get count of listeners for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    const regularCount = this.listeners.get(event)?.size || 0;
    const onceCount = this.onceListeners.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Get all event names that have listeners
   * @returns {string[]} Array of event names
   */
  eventNames() {
    const names = new Set([
      ...this.listeners.keys(),
      ...this.onceListeners.keys()
    ]);
    return Array.from(names);
  }

  /**
   * Check if an event has any listeners
   * @param {string} event - Event name
   * @returns {boolean} True if event has listeners
   */
  hasListeners(event) {
    return this.listenerCount(event) > 0;
  }

  // Convenience methods for common pose events

  /**
   * Emit pose detected event
   * @param {Object} poseData - Pose data from detector/filter
   */
  emitPoseDetected(poseData) {
    this.emit(EventTypes.POSE_DETECTED, poseData);
  }

  /**
   * Emit pose lost event
   * @param {Object} data - Optional data (timestamp, etc.)
   */
  emitPoseLost(data) {
    this.emit(EventTypes.POSE_LOST, data);
  }

  /**
   * Emit FPS update event.
   * @param {{fps: number, timestamp: number}} data - FPS payload. The
   *   single-number form is intentionally not used; subscribers read
   *   `data.fps` so passing a bare number would crash them.
   */
  emitFpsUpdate(data) {
    this.emit(EventTypes.FPS_UPDATE, data);
  }

  /**
   * Emit config changed event
   * @param {Object} config - New configuration
   */
  emitConfigChanged(config) {
    this.emit(EventTypes.CONFIG_CHANGED, config);
  }

  /**
   * Subscribe to pose detected events
   * @param {Function} callback - Function to call with pose data
   * @returns {Function} Unsubscribe function
   */
  onPoseDetected(callback) {
    return this.on(EventTypes.POSE_DETECTED, callback);
  }

  /**
   * Subscribe to pose lost events
   * @param {Function} callback - Function to call when pose is lost
   * @returns {Function} Unsubscribe function
   */
  onPoseLost(callback) {
    return this.on(EventTypes.POSE_LOST, callback);
  }

  /**
   * Subscribe to FPS update events
   * @param {Function} callback - Function to call with FPS value
   * @returns {Function} Unsubscribe function
   */
  onFpsUpdate(callback) {
    return this.on(EventTypes.FPS_UPDATE, callback);
  }

  /**
   * Subscribe to config changed events
   * @param {Function} callback - Function to call with new config
   * @returns {Function} Unsubscribe function
   */
  onConfigChanged(callback) {
    return this.on(EventTypes.CONFIG_CHANGED, callback);
  }

  // Session and Replay convenience methods (Sprint 8)

  /**
   * Subscribe to session started events
   * @param {Function} callback - Function to call when session starts
   * @returns {Function} Unsubscribe function
   */
  onSessionStarted(callback) {
    return this.on(EventTypes.SESSION_STARTED, callback);
  }

  /**
   * Subscribe to session stopped events
   * @param {Function} callback - Function to call when session stops
   * @returns {Function} Unsubscribe function
   */
  onSessionStopped(callback) {
    return this.on(EventTypes.SESSION_STOPPED, callback);
  }

  /**
   * Subscribe to session saved events
   * @param {Function} callback - Function to call when session is saved
   * @returns {Function} Unsubscribe function
   */
  onSessionSaved(callback) {
    return this.on(EventTypes.SESSION_SAVED, callback);
  }

  /**
   * Subscribe to session loaded events
   * @param {Function} callback - Function to call when session is loaded
   * @returns {Function} Unsubscribe function
   */
  onSessionLoaded(callback) {
    return this.on(EventTypes.SESSION_LOADED, callback);
  }

  /**
   * Subscribe to replay started events
   * @param {Function} callback - Function to call when replay starts
   * @returns {Function} Unsubscribe function
   */
  onReplayStarted(callback) {
    return this.on(EventTypes.REPLAY_STARTED, callback);
  }

  /**
   * Subscribe to replay stopped events
   * @param {Function} callback - Function to call when replay stops
   * @returns {Function} Unsubscribe function
   */
  onReplayStopped(callback) {
    return this.on(EventTypes.REPLAY_STOPPED, callback);
  }

  /**
   * Subscribe to replay paused events
   * @param {Function} callback - Function to call when replay is paused
   * @returns {Function} Unsubscribe function
   */
  onReplayPaused(callback) {
    return this.on(EventTypes.REPLAY_PAUSED, callback);
  }

  /**
   * Subscribe to replay resumed events
   * @param {Function} callback - Function to call when replay is resumed
   * @returns {Function} Unsubscribe function
   */
  onReplayResumed(callback) {
    return this.on(EventTypes.REPLAY_RESUMED, callback);
  }

  /**
   * Subscribe to replay progress events
   * @param {Function} callback - Function to call with replay progress
   * @returns {Function} Unsubscribe function
   */
  onReplayProgress(callback) {
    return this.on(EventTypes.REPLAY_PROGRESS, callback);
  }

  // Angle convenience methods (Sprint 11)

  /**
   * Emit angles calculated event
   * @param {Object} anglesData - Angles data (timestamp, angles)
   */
  emitAnglesCalculated(anglesData) {
    this.emit(EventTypes.ANGLES_CALCULATED, anglesData);
  }

  /**
   * Subscribe to angles calculated events
   * @param {Function} callback - Function to call when angles are calculated
   * @returns {Function} Unsubscribe function
   */
  onAnglesCalculated(callback) {
    return this.on(EventTypes.ANGLES_CALCULATED, callback);
  }

  // Gesture convenience methods (Sprint 12)

  /**
   * Emit gesture recognized event
   * @param {Object} gestureData - Gesture data (name, confidence, timestamp)
   */
  emitGestureRecognized(gestureData) {
    this.emit(EventTypes.GESTURE_RECOGNIZED, gestureData);
  }

  /**
   * Subscribe to gesture recognized events
   * @param {Function} callback - Function to call when gesture is recognized
   * @returns {Function} Unsubscribe function
   */
  onGestureRecognized(callback) {
    return this.on(EventTypes.GESTURE_RECOGNIZED, callback);
  }
}

export default DataBus;
