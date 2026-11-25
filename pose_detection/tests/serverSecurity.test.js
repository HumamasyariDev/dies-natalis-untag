/**
 * Server security regression tests (robustness-audit hardening pass, 2026-05-24).
 *
 * The original api.test.js only validated request/response *shapes* — it never
 * started the server, so none of the security fixes were actually exercised.
 * This suite covers them two ways:
 *
 *   1. Unit tests of the pure helpers extracted from server/index.js. These are
 *      hermetic (no filesystem, no network) and pin the exact logic of each fix
 *      — most importantly the CORS metacharacter escaping and the auth decision,
 *      which are otherwise buried in closures and coupled to the live config.
 *   2. Integration tests that drive the real exported Express `app` on an
 *      ephemeral port, proving the helpers are actually wired into the routes
 *      and middleware (path traversal, secret redaction, CORS, auth wiring).
 *
 * The app is imported with side effects gated (see isMainModule in
 * server/index.js), so importing it neither binds port 3000 nor starts the
 * config watcher.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { once } from 'events';
import yaml from 'js-yaml';

import app, {
  originAllowed,
  isAuthorized,
  redactConfigSecrets,
  validateReloadedConfig,
  isPathInsideDir,
} from '../server/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const sessionsDir = path.join(projectRoot, 'sessions');

// The real, committed config the imported app loaded at startup. Tests assert
// against it so they survive edits to config.yaml instead of hardcoding values.
const liveConfig = yaml.load(
  fs.readFileSync(path.join(projectRoot, 'config', 'config.yaml'), 'utf8')
);

let server;
let baseUrl;

beforeAll(async () => {
  server = app.listen(0); // ephemeral port — avoids clashing with a dev server on 3000
  await once(server, 'listening');
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

// ---------------------------------------------------------------------------
// Unit: CORS wildcard matching + metacharacter escaping
// ---------------------------------------------------------------------------
describe('originAllowed (CORS wildcard escaping)', () => {
  it('allows an exact, non-wildcard match', () => {
    expect(originAllowed('http://localhost:3000', ['http://localhost:3000'])).toBe(true);
  });

  it('rejects an origin that is not in the allow-list', () => {
    expect(originAllowed('http://evil.com', ['http://localhost:3000'])).toBe(false);
  });

  it('matches a wildcard port pattern', () => {
    expect(originAllowed('http://localhost:8080', ['http://localhost:*'])).toBe(true);
  });

  it('treats "*" as allow-all', () => {
    expect(originAllowed('http://anything.example', ['*'])).toBe(true);
  });

  it('allows requests with no Origin header (curl, server-to-server)', () => {
    expect(originAllowed(undefined, ['http://localhost:*'])).toBe(true);
    expect(originAllowed('', ['http://localhost:*'])).toBe(true);
  });

  it('tolerates a missing/empty allow-list without throwing', () => {
    expect(originAllowed('http://localhost:3000', undefined)).toBe(false);
    expect(originAllowed('http://localhost:3000', [])).toBe(false);
  });

  // THE regression guard for the hardening fix: dots in a pattern must be
  // literal. Before escaping, "http://127.0.0.1:*" compiled to a regex whose
  // "." matched ANY character, so a spoofed host would have been admitted.
  it('does not let a dotted pattern match a spoofed host (metacharacter escape)', () => {
    expect(originAllowed('http://127.0.0.1:8080', ['http://127.0.0.1:*'])).toBe(true);
    expect(originAllowed('http://127x0y0z1:8080', ['http://127.0.0.1:*'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: API key authorization decision
// ---------------------------------------------------------------------------
describe('isAuthorized (API key auth decision)', () => {
  const enabled = (apiKey) => ({ api: { authentication: { enabled: true, apiKey } } });

  it('allows everything when authentication is disabled', () => {
    expect(isAuthorized({ api: { authentication: { enabled: false, apiKey: 'k' } } }, undefined)).toBe(true);
    expect(isAuthorized({ api: { authentication: { enabled: false, apiKey: 'k' } } }, 'wrong')).toBe(true);
  });

  it('allows everything when there is no auth config at all', () => {
    expect(isAuthorized({}, undefined)).toBe(true);
    expect(isAuthorized(undefined, undefined)).toBe(true);
  });

  it('rejects a missing key when auth is enabled', () => {
    expect(isAuthorized(enabled('secret'), undefined)).toBe(false);
    expect(isAuthorized(enabled('secret'), '')).toBe(false);
  });

  it('rejects a wrong key when auth is enabled', () => {
    expect(isAuthorized(enabled('secret'), 'nope')).toBe(false);
  });

  it('accepts the correct key when auth is enabled', () => {
    expect(isAuthorized(enabled('secret'), 'secret')).toBe(true);
  });

  it('cannot be satisfied when the expected key is unset', () => {
    // enabled but apiKey undefined: an undefined provided key must NOT match.
    expect(isAuthorized(enabled(undefined), undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: secret redaction
// ---------------------------------------------------------------------------
describe('redactConfigSecrets', () => {
  it('strips the API key while preserving the rest of the auth block', () => {
    const input = { api: { authentication: { enabled: true, apiKey: 'secret' }, cors: { enabled: true } } };
    const out = redactConfigSecrets(input);
    expect(out.api.authentication.apiKey).toBeUndefined();
    expect(out.api.authentication.enabled).toBe(true);
    expect(out.api.cors.enabled).toBe(true);
  });

  it('does not mutate the input config', () => {
    const input = { api: { authentication: { enabled: true, apiKey: 'secret' } } };
    redactConfigSecrets(input);
    expect(input.api.authentication.apiKey).toBe('secret');
  });

  it('serializes without the key (undefined values are dropped by JSON)', () => {
    const input = { api: { authentication: { enabled: true, apiKey: 'secret' } } };
    const round = JSON.parse(JSON.stringify(redactConfigSecrets(input)));
    expect('apiKey' in round.api.authentication).toBe(false);
  });

  it('returns config unchanged when there is no key to strip', () => {
    expect(redactConfigSecrets({ api: { authentication: { enabled: false } } }))
      .toEqual({ api: { authentication: { enabled: false } } });
    expect(redactConfigSecrets({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Unit: hot-reload config validation
// ---------------------------------------------------------------------------
describe('validateReloadedConfig', () => {
  it('throws on the null that yaml.load returns for an empty file', () => {
    expect(() => validateReloadedConfig(null)).toThrow();
    expect(() => validateReloadedConfig(undefined)).toThrow();
  });

  it('throws on a scalar (non-mapping) document', () => {
    expect(() => validateReloadedConfig('just a string')).toThrow();
    expect(() => validateReloadedConfig(42)).toThrow();
  });

  it('returns a valid object config', () => {
    const cfg = { detector: { numPoses: 1 } };
    expect(validateReloadedConfig(cfg)).toBe(cfg);
  });
});

// ---------------------------------------------------------------------------
// Unit: path-traversal guard
// ---------------------------------------------------------------------------
describe('isPathInsideDir', () => {
  it('accepts a direct child path', () => {
    expect(isPathInsideDir(path.join(sessionsDir, 'a.json'), sessionsDir)).toBe(true);
  });

  it('rejects a traversal that resolves outside the directory', () => {
    expect(isPathInsideDir(path.join(sessionsDir, '..', '..', 'etc', 'passwd'), sessionsDir)).toBe(false);
  });

  it('rejects a sibling directory that merely shares a name prefix', () => {
    // "/x/sessions-evil" starts with "/x/sessions" but is NOT inside it; the
    // trailing path.sep in the guard is what prevents this false-accept.
    expect(isPathInsideDir(sessionsDir + '-evil' + path.sep + 'a.json', sessionsDir)).toBe(false);
  });
});

// ===========================================================================
// Integration: drive the real Express app
// ===========================================================================

describe('GET /api/config (integration — secret redaction)', () => {
  it('never serves the API key on the config read path', async () => {
    const res = await fetch(`${baseUrl}/api/config`);
    expect(res.status).toBe(200);

    const body = await res.json();
    // The auth block is present but the key is gone.
    expect(body.api.authentication).toBeDefined();
    expect(body.api.authentication.apiKey).toBeUndefined();

    // And the raw bytes don't leak it, whatever the live config's key is.
    const raw = JSON.stringify(body);
    const liveKey = liveConfig?.api?.authentication?.apiKey;
    if (liveKey) {
      expect(raw).not.toContain(liveKey);
    }
  });
});

describe('Session routes (integration — path traversal)', () => {
  const SAFE_NAME = '__sectest_session.json';

  afterAll(() => {
    const p = path.join(sessionsDir, SAFE_NAME);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it('rejects a traversal filename on save (POST /api/session/save)', async () => {
    const res = await fetch(`${baseUrl}/api/session/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: '../escaped.json', format: 'json', data: { x: 1 } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid filename/i);
    // The guard runs before any write, so nothing escaped the sessions dir.
    expect(fs.existsSync(path.join(projectRoot, 'escaped.json'))).toBe(false);
  });

  it('rejects a traversal filename on load (GET /api/session/load)', async () => {
    const res = await fetch(`${baseUrl}/api/session/load?filename=${encodeURIComponent('../../package.json')}`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid filename/i);
  });

  it('rejects a traversal filename on delete (DELETE /api/session/delete)', async () => {
    const res = await fetch(`${baseUrl}/api/session/delete?filename=${encodeURIComponent('../../package.json')}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid filename/i);
  });

  it('allows a safe filename to round-trip through save and load', async () => {
    const payload = { recordedAt: 'test', frames: [{ t: 0 }] };

    const saveRes = await fetch(`${baseUrl}/api/session/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: SAFE_NAME, format: 'json', data: payload }),
    });
    expect(saveRes.status).toBe(200);
    expect((await saveRes.json()).success).toBe(true);

    const loadRes = await fetch(`${baseUrl}/api/session/load?filename=${encodeURIComponent(SAFE_NAME)}`);
    expect(loadRes.status).toBe(200);
    expect(await loadRes.json()).toEqual(payload);
  });
});

describe('CORS (integration — wired to the live allow-list)', () => {
  it('reflects an allowed origin', async () => {
    const origin = 'http://localhost:9999';
    const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('reflects an allowed loopback-IP origin', async () => {
    const origin = 'http://127.0.0.1:8080';
    const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
  });

  it('does not admit a host that spoofs the dotted loopback pattern', async () => {
    // End-to-end counterpart to the escaping unit test, against the real
    // "http://127.0.0.1:*" entry in config.yaml.
    const origin = 'http://127x0y0z1:8080';
    const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe(origin);
  });

  it('does not reflect a wholly unlisted origin', async () => {
    const origin = 'http://evil.example';
    const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe(origin);
  });
});

describe('POST /api/pose/update (integration — auth wiring)', () => {
  // Auth is disabled in the committed config, so the middleware must be a no-op
  // here. The enabled-path logic is covered hermetically by isAuthorized above.
  it('accepts a write with no API key while auth is disabled', async () => {
    const res = await fetch(`${baseUrl}/api/pose/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timestamp: 1, detected: false, pose: null, fps: null }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('still validates the request body (missing timestamp -> 400)', async () => {
    const res = await fetch(`${baseUrl}/api/pose/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ detected: true }),
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Integration: rate-limit scope
// ---------------------------------------------------------------------------
describe('Rate limiting (integration — scoped to external read endpoints)', () => {
  // Regression guard for the scope fix. The limiter must protect the external
  // READ endpoints (current, stream) WITHOUT throttling /api/pose/update — the
  // first-party per-frame write path. A 100/min cap on update would block pose
  // forwarding within ~2s at 30-60 FPS and trip the ApiModule's
  // auto-disable-after-3-failures. `standardHeaders: true` tags limited
  // responses with RateLimit-* headers; their presence proves where the
  // limiter is mounted. (Match by prefix to stay robust across draft versions.)
  const hasRateLimitHeader = (res) =>
    [...res.headers.keys()].some((k) => k.toLowerCase().startsWith('ratelimit'));

  const limitingEnabled = !!liveConfig?.api?.rateLimit?.enabled;
  const limit = liveConfig?.api?.rateLimit?.requestsPerMinute || 100;

  it('mounts the limiter on the read path but not the write path', async () => {
    // 404 when the pose buffer is empty, but the limiter ran first and tagged it.
    const readRes = await fetch(`${baseUrl}/api/pose/current`);
    const writeRes = await fetch(`${baseUrl}/api/pose/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timestamp: 1, detected: false, pose: null, fps: null }),
    });

    if (limitingEnabled) {
      expect(hasRateLimitHeader(readRes)).toBe(true);
    }
    // The write path is NEVER rate-limited, regardless of the config toggle.
    expect(hasRateLimitHeader(writeRes)).toBe(false);
  });

  it('leaves POST /api/pose/update unthrottled past the read limit', async () => {
    // Fire more writes, at once, than the per-minute read cap. None may come
    // back 429 — this is exactly the per-frame forwarding scenario the old
    // `/api/pose` mount would have broken.
    const burst = limit + 25;
    const body = JSON.stringify({ timestamp: 1, detected: false, pose: null, fps: null });
    const results = await Promise.all(
      Array.from({ length: burst }, () =>
        fetch(`${baseUrl}/api/pose/update`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      )
    );
    const statuses = results.map((r) => r.status);
    expect(statuses).not.toContain(429);
    expect(statuses.every((s) => s === 200)).toBe(true);
  });
});
