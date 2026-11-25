/**
 * Express server for MediaPipe Pose Detection
 * Serves static files and provides the web interface
 */

import express from 'express';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import fs from 'fs';
import yaml from 'js-yaml';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const app = express();
// Default to 3939 rather than 3000: port 3000 is heavily contested by other
// dev servers (Vite, CRA, Next, etc.). When another app holds the port, the
// browser fetches models/static assets from the wrong server and MediaPipe
// fails with "Unable to open zip archive". Override with the PORT env var.
const PORT = process.env.PORT || 3939;

// Store active SSE clients for config watching
const configWatchers = new Set();

// Pose API data structures (Sprint 9)
const poseBuffer = [];           // Ring buffer for last N poses
const MAX_POSE_BUFFER_SIZE = 10; // Keep last 10 poses
const poseStreamClients = new Set(); // SSE clients for /api/pose/stream

// Middleware for parsing JSON
app.use(express.json());

// Helper function to load current config
function loadConfig() {
  const configPath = path.join(projectRoot, 'config', 'config.yaml');
  if (fs.existsSync(configPath)) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return yaml.load(configContent);
  }
  return {};
}

// ============================================================================
// Pure security helpers
//
// Extracted from the inline route/middleware logic so the robustness-audit
// hardening fixes (2026-05-24) can be regression-tested directly — see
// tests/serverSecurity.test.js. Each function is side-effect free: no
// filesystem, no req/res, no module state. The routes below call them so the
// tested logic and the shipped logic are the same code path.
// ============================================================================

/**
 * Decide whether a request Origin is permitted by the configured allow-list.
 * Wildcard patterns (e.g. "http://localhost:*") become anchored regexes with
 * every regex metacharacter in the literal portion escaped first, so a dot in
 * a pattern like "http://127.0.0.1:*" matches only a literal dot. Without the
 * escape, that pattern would also admit a spoofed origin such as
 * "http://127x0y0z1:9000".
 *
 * @param {string|undefined} origin - The request Origin header (may be absent).
 * @param {string[]} allowedOrigins - config.api.cors.allowedOrigins patterns.
 * @returns {boolean} True if the origin is allowed.
 */
export function originAllowed(origin, allowedOrigins) {
  // Requests with no Origin (curl, server-to-server, same-origin) are allowed.
  if (!origin) return true;

  return (allowedOrigins || []).some(pattern => {
    if (pattern === '*') return true;

    if (pattern.includes('*')) {
      const escaped = pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      return new RegExp('^' + escaped + '$').test(origin);
    }

    return pattern === origin;
  });
}

/**
 * Decide whether a request is authorized given the current config and the
 * presented API key. When authentication is disabled this is always true
 * (defense-in-depth: the middleware is a no-op in the default deployment).
 *
 * @param {object} config - Parsed config object.
 * @param {string|undefined} providedKey - Value of the x-api-key header.
 * @returns {boolean} True if the request may proceed.
 */
export function isAuthorized(config, providedKey) {
  if (!config?.api?.authentication?.enabled) return true;
  const expectedKey = config.api.authentication.apiKey;
  return Boolean(providedKey) && providedKey === expectedKey;
}

/**
 * Return a copy of config with the API key stripped, so secrets are never
 * serialized onto a client-facing read path. Does not mutate the input.
 *
 * @param {object} config - Parsed config object.
 * @returns {object} Config safe to expose to clients.
 */
export function redactConfigSecrets(config) {
  if (!config?.api?.authentication?.apiKey) return config;
  return {
    ...config,
    api: {
      ...config.api,
      authentication: { ...config.api.authentication, apiKey: undefined }
    }
  };
}

/**
 * Validate a hot-reloaded config before broadcasting it. yaml.load returns
 * null for an empty file (and a scalar for a non-mapping document) without
 * throwing; broadcasting that would push `config: null` to every client and
 * break anything reading config.*. Throwing here routes to the error branch.
 *
 * @param {*} config - Result of yaml.load on the reloaded file.
 * @returns {object} The validated config.
 * @throws {Error} If config is null/undefined or not an object.
 */
export function validateReloadedConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config file is empty or not an object');
  }
  return config;
}

/**
 * Path-traversal guard: true only when filePath is strictly inside dir.
 * Callers pass an already-joined path (path.join normalizes "../" segments, so
 * a traversal attempt resolves outside dir and fails this check).
 *
 * @param {string} filePath - Candidate path, already run through path.join.
 * @param {string} dir - The directory the path must stay within.
 * @returns {boolean} True if filePath is inside dir.
 */
export function isPathInsideDir(filePath, dir) {
  return filePath.startsWith(dir + path.sep);
}

// CORS middleware (Sprint 9). Scope matters: this guards the /api surface
// against unwanted cross-origin consumers. It must NOT cover static files —
// <script type="module"> requests always carry an Origin header, so a global
// CORS gate turns every module load from a non-allowlisted origin (e.g. a
// LAN IP like http://192.168.x.x:3939) into a 500. The page HTML still loads
// (navigations send no Origin), leaving a rendered page whose JS never ran —
// a silently dead Start button.
const config = loadConfig();
if (config?.api?.cors?.enabled) {
  const allowedOrigins = config.api.cors.allowedOrigins || ['*'];

  const corsOptions = {
    origin: (origin, callback) => {
      if (originAllowed(origin, allowedOrigins)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  };

  app.use('/api', cors(corsOptions));
  console.log('[API] CORS enabled on /api for origins:', allowedOrigins);
}

// Rate limiting middleware (Sprint 9). Scope matters: this guards the EXTERNAL
// read API against abusive third-party consumers. It must NOT cover
// /api/pose/update — that is the first-party client posting its own pose stream
// every frame (30-60/s). A per-minute cap there would exhaust the budget in
// ~2s, return 429s, and trip the ApiModule's auto-disable-after-3-failures,
// silently killing forwarding. So limit the read endpoints only.
if (config?.api?.rateLimit?.enabled) {
  const requestsPerMinute = config.api.rateLimit.requestsPerMinute || 100;

  const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: requestsPerMinute,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // External read endpoints only — NOT /api/pose/update (first-party writes).
  app.use('/api/pose/current', limiter);
  app.use('/api/pose/stream', limiter);
  console.log(`[API] Rate limiting enabled on read endpoints (current, stream): ${requestsPerMinute} requests/minute`);
}

// API key authentication middleware (Sprint 9)
function authenticateApiKey(req, res, next) {
  const config = loadConfig();

  if (isAuthorized(config, req.headers['x-api-key'])) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized - Invalid or missing API key' });
}

// Serve static files from client directory
app.use(express.static(path.join(projectRoot, 'client')));

// Serve models directory
app.use('/models', express.static(path.join(projectRoot, 'models')));

// Public read of gesture definitions only. The wider `/config/` static
// mount was removed (it leaked secrets); the client still needs this
// file to seed GestureDetector at startup, and gestures.yaml contains
// no secrets.
app.get('/config/gestures.yaml', (req, res) => {
  const gesturesPath = path.join(projectRoot, 'config', 'gestures.yaml');
  if (!fs.existsSync(gesturesPath)) {
    return res.status(404).type('text/plain').send('gestures.yaml not found');
  }
  res.type('text/yaml').sendFile(gesturesPath);
});

// API endpoint to get configuration.
// IMPORTANT: secrets must be stripped before responding. The previous
// implementation also served the entire config/ directory statically,
// which leaked api.authentication.apiKey in plaintext to any unauth'd
// caller — that route has been removed.
app.get('/api/config', (req, res) => {
  const configPath = path.join(projectRoot, 'config', 'config.yaml');

  if (!fs.existsSync(configPath)) {
    return res.status(404).json({ error: 'Configuration file not found' });
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent);
    // Strip secrets before exposing config to the client.
    res.json(redactConfigSecrets(config));
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse configuration', details: error.message });
  }
});

// SSE endpoint for config hot-reload
app.get('/api/config/watch', (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Add client to watchers set
  configWatchers.add(res);

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Config watcher connected"}\n\n');

  // Remove client on disconnect
  req.on('close', () => {
    configWatchers.delete(res);
  });
});

// API endpoint to check model availability
app.get('/api/models/status', (req, res) => {
  const modelsDir = path.join(projectRoot, 'models');
  const models = {
    lite: fs.existsSync(path.join(modelsDir, 'pose_landmarker_lite.task')),
    full: fs.existsSync(path.join(modelsDir, 'pose_landmarker_full.task')),
    heavy: fs.existsSync(path.join(modelsDir, 'pose_landmarker_heavy.task'))
  };

  res.json({ models });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ============================================================================
// Pose API Endpoints (Sprint 9)
// ============================================================================

/**
 * POST /api/pose/update
 * Internal endpoint for client to send pose data to server
 * Used by apiModule.js to forward poses to server for external API
 * Sprint 11: Now includes angles
 */
app.post('/api/pose/update', authenticateApiKey, (req, res) => {
  const { timestamp, detected, pose, fps, angles } = req.body;

  if (timestamp === undefined) {
    return res.status(400).json({ error: 'Missing required field: timestamp' });
  }

  // Add to ring buffer (Sprint 11: includes angles)
  const poseData = {
    timestamp,
    detected: detected !== false,
    pose: pose || null,
    fps: fps || null,
    angles: angles || null  // Sprint 11: Include angles
  };

  poseBuffer.push(poseData);

  // Maintain ring buffer size
  if (poseBuffer.length > MAX_POSE_BUFFER_SIZE) {
    poseBuffer.shift(); // Remove oldest
  }

  // Broadcast to SSE stream clients
  const message = JSON.stringify(poseData);
  poseStreamClients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);
    } catch (error) {
      // Remove dead connections
      poseStreamClients.delete(client);
    }
  });

  res.json({ success: true, buffered: poseBuffer.length });
});

/**
 * GET /api/pose/current
 * Returns the most recent pose data
 * Requires API key if authentication is enabled
 */
app.get('/api/pose/current', authenticateApiKey, (req, res) => {
  if (poseBuffer.length === 0) {
    return res.status(404).json({
      error: 'No pose data available',
      message: 'No poses have been detected yet. Ensure detection is running and API forwarding is enabled.'
    });
  }

  // Return the most recent pose (last item in buffer)
  const currentPose = poseBuffer[poseBuffer.length - 1];
  res.json(currentPose);
});

/**
 * GET /api/pose/stream
 * Server-Sent Events (SSE) stream of real-time pose data
 * Requires API key if authentication is enabled
 */
app.get('/api/pose/stream', authenticateApiKey, (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  // Add client to stream set
  poseStreamClients.add(res);

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Pose stream connected"}\n\n');

  // Send most recent pose if available
  if (poseBuffer.length > 0) {
    const currentPose = poseBuffer[poseBuffer.length - 1];
    res.write(`data: ${JSON.stringify(currentPose)}\n\n`);
  }

  // Remove client on disconnect
  req.on('close', () => {
    poseStreamClients.delete(res);
  });
});

// ============================================================================
// Session recording endpoints (Sprint 8)
// ============================================================================

// Save session (JSON or CSV)
app.post('/api/session/save', (req, res) => {
  const { filename, format, data } = req.body;

  if (!filename || !format || !data) {
    return res.status(400).json({ error: 'Missing required fields: filename, format, data' });
  }

  const sessionsDir = path.join(projectRoot, 'sessions');

  // Ensure sessions directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const filePath = path.join(sessionsDir, filename);

  // Path-traversal guard: reject filenames that resolve outside the
  // sessions directory (e.g. "../../etc/passwd"). The GET and DELETE
  // handlers have an equivalent check; this one was missing.
  if (!isPathInsideDir(filePath, sessionsDir)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    let content;
    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      content = data; // CSV already formatted as string
    } else {
      return res.status(400).json({ error: 'Invalid format. Must be json or csv' });
    }

    fs.writeFileSync(filePath, content, 'utf8');

    const stats = fs.statSync(filePath);

    res.json({
      success: true,
      path: filePath,
      filename,
      size: stats.size,
      format
    });

    console.log(`Session saved: ${filename} (${stats.size} bytes)`);
  } catch (error) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: 'Failed to save session', details: error.message });
  }
});

// Load session
app.get('/api/session/load', (req, res) => {
  const { filename } = req.query;

  if (!filename) {
    return res.status(400).json({ error: 'Missing filename parameter' });
  }

  const sessionsDir = path.join(projectRoot, 'sessions');
  const filePath = path.join(sessionsDir, filename);

  // Security: prevent path traversal
  if (!isPathInsideDir(filePath, sessionsDir)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Session file not found' });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Determine format from extension
    if (filename.endsWith('.json')) {
      const session = JSON.parse(content);
      res.json(session);
    } else if (filename.endsWith('.csv')) {
      // Return CSV as text
      res.setHeader('Content-Type', 'text/csv');
      res.send(content);
    } else {
      res.status(400).json({ error: 'Unsupported file format' });
    }

    console.log(`Session loaded: ${filename}`);
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: 'Failed to load session', details: error.message });
  }
});

// List available sessions
app.get('/api/session/list', (req, res) => {
  const sessionsDir = path.join(projectRoot, 'sessions');

  if (!fs.existsSync(sessionsDir)) {
    return res.json({ sessions: [] });
  }

  try {
    const files = fs.readdirSync(sessionsDir);
    const sessions = files
      .filter(file => file.endsWith('.json') || file.endsWith('.csv'))
      .map(file => {
        const filePath = path.join(sessionsDir, file);
        const stats = fs.statSync(filePath);

        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          format: file.endsWith('.json') ? 'json' : 'csv'
        };
      })
      .sort((a, b) => b.modified - a.modified); // Sort by most recent first

    res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions', details: error.message });
  }
});

// Delete session
app.delete('/api/session/delete', (req, res) => {
  const { filename } = req.query;

  if (!filename) {
    return res.status(400).json({ error: 'Missing filename parameter' });
  }

  const sessionsDir = path.join(projectRoot, 'sessions');
  const filePath = path.join(sessionsDir, filename);

  // Security: prevent path traversal
  if (!isPathInsideDir(filePath, sessionsDir)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Session file not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, filename });
    console.log(`Session deleted: ${filename}`);
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session', details: error.message });
  }
});

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'client', 'index.html'));
});

// Watch config file for changes and broadcast to SSE clients.
// fs.watch throws synchronously if the path doesn't exist, which would
// crash the process before it ever binds. Guard the call so a missing
// config file is a recoverable warning instead of a startup failure.
const configPath = path.join(projectRoot, 'config', 'config.yaml');

function startConfigWatcher() {
  let watchTimeout = null;

  if (!fs.existsSync(configPath)) {
    console.warn(`[Config] ${configPath} does not exist; hot-reload disabled.`);
    return;
  }

  fs.watch(configPath, (eventType, filename) => {
    // Debounce rapid fire changes (some editors trigger multiple events)
    clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
      console.log(`Config file changed (${eventType}), reloading...`);

      try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(configContent);

        // yaml.load returns null for an empty file and does not throw.
        // Don't broadcast a null config — clients reading config.* would
        // break. Treat it as a parse failure and route to the error branch.
        validateReloadedConfig(config);

        // Broadcast to all connected SSE clients
        const message = JSON.stringify({
          type: 'config:changed',
          config: config,
          timestamp: Date.now()
        });

        configWatchers.forEach(client => {
          try {
            client.write(`data: ${message}\n\n`);
          } catch (error) {
            // Remove dead connections
            configWatchers.delete(client);
          }
        });

        console.log(`Config reloaded and broadcast to ${configWatchers.size} client(s)`);
      } catch (error) {
        console.error('Failed to reload config:', error.message);

        // Broadcast error to clients
        const errorMessage = JSON.stringify({
          type: 'config:error',
          error: error.message,
          timestamp: Date.now()
        });

        configWatchers.forEach(client => {
          try {
            client.write(`data: ${errorMessage}\n\n`);
          } catch (err) {
            configWatchers.delete(client);
          }
        });
      }
    }, 100); // 100ms debounce
  });
}

// Only bind the port and start the filesystem watcher when this module is run
// as the entry point (node server/index.js). When it is imported — e.g. by the
// integration tests — doing either would leak a listening socket and a file
// watcher and keep the process alive. Tests drive the exported `app` via their
// own ephemeral listener instead.
const isMainModule =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

// app.listen() has no default error handling: if the port is already taken,
// Node emits an unhandled 'error' event and the process crashes with a raw
// EADDRINUSE stack trace. Listen for it ourselves and fail gracefully by
// trying the next port instead, so "something else is already on 3939"
// doesn't require the user to go hunt down and kill that other process.
const MAX_PORT_ATTEMPTS = 10;

function startServer(port, attemptsLeft) {
  const server = app.listen(port);

  server.once('listening', () => {
    if (port !== PORT) {
      console.warn(`[Server] Port ${PORT} was already in use; falling back to ${port}.`);
    }
    console.log(`MediaPipe Pose Detection server running at http://localhost:${port}`);
    console.log(`Project root: ${projectRoot}`);
    console.log(`Config hot-reload enabled, watching: ${configPath}`);
  });

  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`[Server] Port ${port} is already in use, trying ${port + 1}...`);
      startServer(port + 1, attemptsLeft - 1);
    } else if (error.code === 'EADDRINUSE') {
      console.error(
        `[Server] Ports ${PORT}-${port} are all in use. Set the PORT env var ` +
        `to pick one manually, e.g.: PORT=4000 npm start`
      );
      process.exit(1);
    } else {
      console.error('[Server] Failed to start:', error.message);
      process.exit(1);
    }
  });
}

if (isMainModule) {
  startConfigWatcher();
  startServer(PORT, MAX_PORT_ATTEMPTS);
}

export default app;
