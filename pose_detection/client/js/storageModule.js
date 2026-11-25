/**
 * Storage Module - Session Recording and Replay
 *
 * Records pose detection sessions, exports to JSON/CSV, and replays sessions.
 * Subscribes to Data Bus for pose events and emits session events.
 */

export class StorageModule {
  constructor(dataBus, config) {
    this.dataBus = dataBus;
    this.config = config;

    // Recording state
    this.recording = false;
    this.frames = [];
    this.sessionStartTime = null;
    this.autoSaveTimer = null;

    // Capture resolution (video frame dimensions) of the current recording,
    // sampled from incoming frames. Persisted in the session so replay can size
    // the output canvas to the recorded pixel space — without it, a cold replay
    // (loading a session on a fresh page) paints at the wrong scale.
    this.captureResolution = null;

    // Replay state. replaying stays true across a pause (only stop clears it);
    // replayPaused distinguishes "paused" (replaying && no pending timer) from
    // "playing". session/speed are held so resume can continue the same playback
    // without the caller re-supplying them.
    this.replaying = false;
    this.replayPaused = false;
    this.replayTimer = null;
    this.currentReplayFrame = 0;
    this.replaySession = null;
    this.replaySpeed = 1.0;

    // Stats tracking
    this.detectedFrameCount = 0;
    this.totalFrameCount = 0;

    // Sprint 11: Track angles for each frame
    this.currentAngles = null;

    // Subscribe to pose events if storage is enabled
    if (this.config.enabled) {
      this.subscribeToDataBus();
      this.setupAutoSave();
    }
  }

  /**
   * Subscribe to Data Bus events
   */
  subscribeToDataBus() {
    this.dataBus.onPoseDetected((data) => {
      if (this.recording) {
        this.recordFrame(data);
      }
    });

    this.dataBus.onPoseLost(() => {
      if (this.recording) {
        this.recordFrame({
          timestamp: Date.now(),
          fps: 0,
          detected: false,
          pose: null
        });
      }
    });

    // Sprint 11: Subscribe to angles calculated events
    this.dataBus.onAnglesCalculated((anglesData) => {
      if (this.recording) {
        this.currentAngles = anglesData.angles;
      }
    });
  }

  /**
   * Setup auto-save timer if enabled
   */
  setupAutoSave() {
    if (this.config.autoSave && this.config.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        if (this.recording && this.frames.length > 0) {
          this.saveSession('json', true); // Auto-save as JSON
        }
      }, this.config.autoSaveInterval);
    }
  }

  /**
   * Start recording session
   */
  startRecording() {
    if (this.recording) {
      console.warn('Recording already in progress');
      return;
    }

    this.recording = true;
    this.frames = [];
    this.sessionStartTime = Date.now();
    this.detectedFrameCount = 0;
    this.totalFrameCount = 0;
    this.captureResolution = null;

    console.log('Session recording started');
    this.dataBus.emit('session:started', { timestamp: this.sessionStartTime });
  }

  /**
   * Stop recording session
   */
  stopRecording() {
    if (!this.recording) {
      console.warn('No recording in progress');
      return;
    }

    this.recording = false;
    const sessionEndTime = Date.now();
    const duration = sessionEndTime - this.sessionStartTime;

    console.log(`Session recording stopped. Duration: ${duration}ms, Frames: ${this.frames.length}`);
    this.dataBus.emit('session:stopped', {
      duration,
      frameCount: this.frames.length,
      detectionRate: this.calculateDetectionRate()
    });

    return {
      duration,
      frameCount: this.frames.length,
      detectedFrames: this.detectedFrameCount
    };
  }

  /**
   * Record a single frame
   */
  recordFrame(data) {
    // Check memory limits
    if (this.frames.length >= this.config.maxFramesInMemory) {
      console.warn(`Maximum frames (${this.config.maxFramesInMemory}) reached. Auto-saving...`);
      this.saveSession('json', true);
      this.frames = []; // Clear buffer after save
      this.sessionStartTime = Date.now(); // Reset start time for new segment
    }

    // Sample the capture resolution from the video frame dimensions. Detected
    // frames carry width/height; pose:lost frames don't, so only sample when
    // present. Persisted at the session level for replay canvas sizing.
    if (data.width && data.height) {
      this.captureResolution = { width: data.width, height: data.height };
    }

    const frame = {
      frameNumber: this.totalFrameCount,
      timestamp: data.timestamp,
      fps: data.fps,
      detected: data.detected,
      pose: data.detected ? {
        normalized: data.pose.normalized,
        pixel: data.pose.pixel,
        world: data.pose.world || null  // Sprint 11: Include world coordinates
      } : null,
      angles: this.currentAngles || null  // Sprint 11: Include angles
    };

    this.frames.push(frame);
    this.totalFrameCount++;

    if (data.detected) {
      this.detectedFrameCount++;
    }

    // Reset angles after recording to avoid stale data
    this.currentAngles = null;
  }

  /**
   * Calculate detection rate
   */
  calculateDetectionRate() {
    if (this.totalFrameCount === 0) return 0;
    return this.detectedFrameCount / this.totalFrameCount;
  }

  /**
   * Calculate average FPS
   */
  calculateAverageFps() {
    if (this.frames.length === 0) return 0;

    const totalFps = this.frames.reduce((sum, frame) => sum + (frame.fps || 0), 0);
    return totalFps / this.frames.length;
  }

  /**
   * Build session object matching spec schema (section 4.2)
   */
  buildSession(autoSave = false) {
    const now = Date.now();
    const sessionId = this.generateSessionId(autoSave);

    return {
      sessionId,
      startTime: this.sessionStartTime,
      endTime: now,
      duration: now - this.sessionStartTime,
      config: {
        modelPath: this.config.modelPath || 'unknown',
        targetFps: this.config.targetFps || 30,
        // {width, height} of the recording, or null for sessions recorded before
        // this was tracked. Replay uses it to size the output canvas.
        resolution: this.captureResolution
      },
      frames: this.frames,
      stats: {
        totalFrames: this.totalFrameCount,
        detectedFrames: this.detectedFrameCount,
        averageFps: this.calculateAverageFps(),
        detectionRate: this.calculateDetectionRate()
      }
    };
  }

  /**
   * Generate session ID with timestamp
   * Format: session-YYYYMMDD-HHMMSS
   */
  generateSessionId(autoSave = false) {
    const date = new Date(this.sessionStartTime);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    const prefix = autoSave ? 'autosave' : 'session';
    return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  /**
   * Save session to specified format
   * @param {string} format - 'json' or 'csv'
   * @param {boolean} autoSave - Whether this is an auto-save
   * @returns {Promise<Object>} - Session data and metadata
   */
  async saveSession(format = 'json', autoSave = false) {
    if (this.frames.length === 0) {
      throw new Error('No frames to save');
    }

    const session = this.buildSession(autoSave);
    let result;

    if (format === 'json' || format === 'both') {
      result = await this.saveJSON(session);
    }

    if (format === 'csv' || format === 'both') {
      const csvResult = await this.saveCSV(session);
      result = result || csvResult;
    }

    if (!autoSave) {
      this.dataBus.emit('session:saved', {
        sessionId: session.sessionId,
        format,
        frameCount: session.stats.totalFrames
      });
    }

    return result;
  }

  /**
   * Save session as JSON
   */
  async saveJSON(session) {
    try {
      const filename = `${session.sessionId}.json`;
      const response = await fetch('/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          format: 'json',
          data: session
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save session: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Session saved as JSON: ${filename}`);

      return {
        filename,
        format: 'json',
        path: result.path,
        size: result.size
      };
    } catch (error) {
      console.error('Error saving JSON session:', error);
      throw error;
    }
  }

  /**
   * Save session as CSV
   * Format: one row per frame, columns for each keypoint coordinate
   */
  async saveCSV(session) {
    try {
      const csv = this.convertToCSV(session);
      const filename = `${session.sessionId}.csv`;

      const response = await fetch('/api/session/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          format: 'csv',
          data: csv
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to save session: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Session saved as CSV: ${filename}`);

      return {
        filename,
        format: 'csv',
        path: result.path,
        size: result.size
      };
    } catch (error) {
      console.error('Error saving CSV session:', error);
      throw error;
    }
  }

  /**
   * Convert session to CSV format
   * CSV format: frameNumber, timestamp, fps, detected, nose_x, nose_y, nose_z, nose_visibility, ...
   */
  convertToCSV(session) {
    // Build header
    const keypointNames = [
      'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
      'right_eye_inner', 'right_eye', 'right_eye_outer',
      'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
      'left_index', 'right_index', 'left_thumb', 'right_thumb',
      'left_hip', 'right_hip', 'left_knee', 'right_knee',
      'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
      'left_foot_index', 'right_foot_index'
    ];

    const header = ['frameNumber', 'timestamp', 'fps', 'detected'];
    keypointNames.forEach(name => {
      header.push(`${name}_x`, `${name}_y`, `${name}_z`, `${name}_visibility`);
    });

    const rows = [header.join(',')];

    // Build data rows
    session.frames.forEach(frame => {
      const row = [
        frame.frameNumber,
        frame.timestamp,
        frame.fps.toFixed(2),
        frame.detected ? '1' : '0'
      ];

      if (frame.detected && frame.pose && frame.pose.normalized) {
        frame.pose.normalized.forEach(kp => {
          row.push(
            kp.x.toFixed(6),
            kp.y.toFixed(6),
            kp.z.toFixed(6),
            kp.visibility.toFixed(6)
          );
        });
      } else {
        // Fill with empty values for no detection
        for (let i = 0; i < 33; i++) {
          row.push('', '', '', '');
        }
      }

      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  /**
   * Load session from file
   * @param {string} filename - Session filename
   * @returns {Promise<Object>} - Loaded session object
   */
  async loadSession(filename) {
    try {
      const response = await fetch(`/api/session/load?filename=${encodeURIComponent(filename)}`);

      if (!response.ok) {
        throw new Error(`Failed to load session: ${response.statusText}`);
      }

      const session = await response.json();
      console.log(`Session loaded: ${filename}, Frames: ${session.frames.length}`);

      this.dataBus.emit('session:loaded', {
        sessionId: session.sessionId,
        frameCount: session.frames.length
      });

      return session;
    } catch (error) {
      console.error('Error loading session:', error);
      throw error;
    }
  }

  /**
   * List available sessions
   * @returns {Promise<Array>} - Array of session filenames
   */
  async listSessions() {
    try {
      const response = await fetch('/api/session/list');

      if (!response.ok) {
        throw new Error(`Failed to list sessions: ${response.statusText}`);
      }

      const sessions = await response.json();
      return sessions;
    } catch (error) {
      console.error('Error listing sessions:', error);
      throw error;
    }
  }

  /**
   * Replay session through Data Bus
   * @param {Object} session - Session object to replay
   * @param {number} speedMultiplier - Playback speed (1.0 = normal, 0.5 = half speed, 2.0 = double)
   */
  replay(session, speedMultiplier = 1.0) {
    if (this.replaying) {
      console.warn('Replay already in progress');
      return;
    }

    if (!session || !session.frames || session.frames.length === 0) {
      console.error('Invalid session for replay');
      return;
    }

    this.replaying = true;
    this.replayPaused = false;
    this.currentReplayFrame = 0;
    this.replaySession = session;
    this.replaySpeed = speedMultiplier;

    console.log(`Starting replay of ${session.frames.length} frames at ${speedMultiplier}x speed`);
    this.dataBus.emit('replay:started', {
      sessionId: session.sessionId,
      frameCount: session.frames.length,
      speed: speedMultiplier
    });

    this._stepReplayFrame();
  }

  /**
   * Emit one replayed frame and schedule the next. The single playback loop,
   * shared by initial play (replay) and resume (resumeReplay) so both carry the
   * recording resolution (canvas sizing) and emit replay:progress (the display's
   * render driver) identically — the old duplicate resume loop silently dropped
   * both. Reads playback state from instance fields (replaySession/replaySpeed/
   * currentReplayFrame), so it can be re-entered from any point.
   * @private
   */
  _stepReplayFrame() {
    // A stop or pause may land between scheduled steps; bail without advancing.
    if (!this.replaying || this.replayPaused || !this.replaySession) {
      return;
    }

    const frames = this.replaySession.frames;
    if (this.currentReplayFrame >= frames.length) {
      this.stopReplay();
      return;
    }

    // Recording resolution, if the session stored one. Re-attached to each
    // replayed pose event (as width/height, mirroring a live detection result)
    // so the display sizes the output canvas to the recorded pixel space — this
    // is what makes a cold replay paint at the right scale. Absent for sessions
    // recorded before resolution tracking; those keep the current canvas size.
    const resolution = this.replaySession.config && this.replaySession.config.resolution;
    const frame = frames[this.currentReplayFrame];

    // Emit pose event as if it was detected in real-time. Carry the recording
    // resolution so the display can size the canvas to the recorded pixels.
    if (frame.detected) {
      this.dataBus.emit('pose:detected', {
        timestamp: frame.timestamp,
        fps: frame.fps,
        detected: true,
        pose: frame.pose,
        ...(resolution ? { width: resolution.width, height: resolution.height } : {})
      });
    } else {
      this.dataBus.emit('pose:lost');
    }

    this.dataBus.emit('replay:progress', {
      currentFrame: this.currentReplayFrame,
      totalFrames: frames.length,
      progress: (this.currentReplayFrame / frames.length) * 100
    });

    this.currentReplayFrame++;

    // Delay until the next frame, scaled by playback speed.
    let delay = 33; // Default ~30 FPS
    if (this.currentReplayFrame < frames.length) {
      const timeDiff = frames[this.currentReplayFrame].timestamp - frame.timestamp;
      delay = Math.max(1, timeDiff / this.replaySpeed);
    }

    this.replayTimer = setTimeout(() => this._stepReplayFrame(), delay);
  }

  /**
   * Stop replay
   */
  stopReplay() {
    if (!this.replaying) {
      return;
    }

    this.replaying = false;
    this.replayPaused = false;

    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }

    console.log('Replay stopped');
    this.dataBus.emit('replay:stopped', {
      framesPlayed: this.currentReplayFrame
    });

    this.currentReplayFrame = 0;
    this.replaySession = null;
    this.replaySpeed = 1.0;
  }

  /**
   * Pause replay, preserving the current position so it can be resumed.
   */
  pauseReplay() {
    if (!this.replaying || this.replayPaused) {
      return;
    }

    this.replayPaused = true;
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }

    console.log('Replay paused');
    this.dataBus.emit('replay:paused', {
      currentFrame: this.currentReplayFrame
    });
  }

  /**
   * Resume a paused replay from where it left off. Uses the session/speed stored
   * by replay(), so the caller need not re-supply them.
   */
  resumeReplay() {
    if (!this.replaying || !this.replayPaused) {
      return;
    }

    this.replayPaused = false;
    console.log('Replay resumed');
    this.dataBus.emit('replay:resumed', {
      currentFrame: this.currentReplayFrame
    });

    this._stepReplayFrame();
  }

  /**
   * Get current recording status
   */
  getStatus() {
    return {
      recording: this.recording,
      replaying: this.replaying,
      replayPaused: this.replayPaused,
      frameCount: this.frames.length,
      detectedFrames: this.detectedFrameCount,
      totalFrames: this.totalFrameCount,
      detectionRate: this.calculateDetectionRate(),
      sessionStartTime: this.sessionStartTime
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopRecording();
    this.stopReplay();

    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    this.frames = [];
  }
}
