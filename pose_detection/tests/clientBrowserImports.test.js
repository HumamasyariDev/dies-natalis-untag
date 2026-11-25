/**
 * Guard against the bug class that 410 Node-run tests missed: a client ES
 * module using a *bare* import specifier (e.g. `import yaml from 'js-yaml'` or
 * `import('@mediapipe/tasks-vision')`). Node resolves those from node_modules,
 * so unit tests stay green — but a browser cannot resolve a bare specifier
 * without an import map, so the whole module graph fails to load and the app
 * is silently dead in production.
 *
 * This test walks the real browser entry graph starting at client/js/main.js
 * (following only relative imports, the way a browser would) and asserts every
 * import specifier it encounters is either:
 *   - browser-resolvable on its own (./, ../, /, or an http(s) URL), or
 *   - a bare specifier that index.html's <script type="importmap"> maps.
 *
 * Node-only modules that live under client/js but are NOT reachable from
 * main.js (e.g. configManager.js, used only by tests + loadFromFile) are
 * correctly ignored, because the browser never loads them.
 *
 * It is a static-analysis heuristic (regex over source), not a real module
 * loader — good enough to catch an unresolvable bare import, which is all it
 * needs to do.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const clientDir = path.join(projectRoot, 'client');
const entryFile = path.join(clientDir, 'js', 'main.js');
const indexHtml = path.join(clientDir, 'index.html');

/** Extract static + dynamic import specifiers from a module's source. */
function extractSpecifiers(src) {
  const specs = [];
  // static:  import ... from 'x'   |   import 'x'   (side-effect)
  const staticRe = /import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
  // dynamic: import('x')  /  await import( "x" )
  const dynRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = staticRe.exec(src))) specs.push(m[1]);
  while ((m = dynRe.exec(src))) specs.push(m[1]);
  return specs;
}

function isRelativeOrUrl(spec) {
  return (
    spec.startsWith('./') ||
    spec.startsWith('../') ||
    spec.startsWith('/') ||
    /^https?:\/\//.test(spec)
  );
}

/** Parse the bare specifiers declared by index.html's import map. */
function importMapKeys(html) {
  const m = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return new Set();
  const map = JSON.parse(m[1]);
  return new Set(Object.keys(map.imports || {}));
}

/** Walk the graph from entry, following only relative imports (browser-style). */
function collectGraph(entry) {
  const visited = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (visited.has(file) || !fs.existsSync(file)) continue;
    visited.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const spec of extractSpecifiers(src)) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        stack.push(path.resolve(path.dirname(file), spec));
      }
    }
  }
  return visited;
}

describe('client browser module graph (bare-specifier guard)', () => {
  const mapped = importMapKeys(fs.readFileSync(indexHtml, 'utf8'));
  const graph = collectGraph(entryFile);

  it('starts from a graph that actually includes the core client modules', () => {
    // Sanity: if traversal silently found nothing, the real assertion is moot.
    const names = [...graph].map((f) => path.basename(f));
    expect(names).toContain('main.js');
    expect(names).toContain('poseDetector.js');
  });

  it('every import in the main.js graph is browser-resolvable or import-mapped', () => {
    const violations = [];

    for (const file of graph) {
      const src = fs.readFileSync(file, 'utf8');
      for (const spec of extractSpecifiers(src)) {
        if (isRelativeOrUrl(spec)) continue;
        // Exact key, or a trailing-slash prefix key (e.g. "pkg/" mapping subpaths).
        const isMapped =
          mapped.has(spec) ||
          [...mapped].some((k) => k.endsWith('/') && spec.startsWith(k));
        if (!isMapped) {
          violations.push(`${path.relative(projectRoot, file)} imports bare '${spec}'`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps @mediapipe/tasks-vision in the import map (poseDetector depends on it)', () => {
    // poseDetector.js dynamically imports this; without the map, Start breaks.
    expect(mapped.has('@mediapipe/tasks-vision')).toBe(true);
  });
});
