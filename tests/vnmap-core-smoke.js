const assert = require('assert');

require('../plugins/basemaps.js');

const registry = globalThis.VietflexBasemaps;
assert(registry, 'VietflexBasemaps must be exported');

const ids = registry.list().map((item) => item.id);
const tedp = ids.indexOf('tedp');
const vnmap = ids.indexOf('vnmap');

assert(tedp >= 0, 'TEDP basemap must exist');
assert(vnmap === tedp + 1, 'VNMap Core must be immediately below TEDP');
assert.strictEqual(registry.get('vnmap').kind, 'vnmap-core');
assert(/vnmap-core\/manifest\.json$/.test(registry.vnmapCoreManifestUrl));

console.log('VNMap Core basemap registry smoke test passed');
