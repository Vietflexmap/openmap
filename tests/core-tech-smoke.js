'use strict';

const assert = require('assert');
require('../dist/vietflex-platform.js');

const Core = globalThis.Vietflex && globalThis.Vietflex.CoreTech;
assert(Core, 'Vietflex.CoreTech must exist');
assert.strictEqual(Core.version, '0.5.0');

const required = [
  'spatial.distance',
  'spatial.nearby',
  'spatial.intersects',
  'context.nearby',
  'context.on-route',
  'context.risk',
  'routing.analyze-hazards',
  'watch.create',
  'watch.evaluate',
  'knowledge.query',
  'knowledge.risk-profile',
  'event.publish'
];
const caps = new Set(Core.Capability.list().map(x => x.id));
required.forEach(id => assert(caps.has(id), `missing capability ${id}`));

const d = Core.Spatial.distance({ lat: 10, lng: 106 }, { lat: 10.001, lng: 106.001 });
assert(d > 0 && d < 500, 'distance sanity check failed');

Core.Data.registerDataset({
  dataset_id: 'test.events',
  dataset_version: '1',
  format: 'geojson',
  provenance: { source: 'test' }
});
assert(Core.Data.getDataset('test.events'));

Core.Watch.create({
  watch_id: 'watch:test',
  name: 'Test point',
  target: { type: 'point', lat: 10, lng: 106, radius_m: 1000 },
  conditions: { event_types: ['flood'], min_severity: 'medium' }
});

let watchHit = 0;
Core.Event.subscribe('watch.match', ({ watch, event }) => {
  if (watch.watch_id === 'watch:test' && event.type === 'flood') watchHit += 1;
});

const event = Core.Event.publish({
  event_id: 'evt:test',
  type: 'flood',
  position: { lat: 10.001, lng: 106.001 },
  severity: 'high',
  confidence: 0.9,
  source: { provider: 'test' },
  time: { observed_at: new Date().toISOString() }
});

assert.strictEqual(watchHit, 1, 'watch should match event once');
assert(Core.Knowledge.events.some(e => e.event_id === event.event_id), 'event should enter knowledge history');

const context = Core.SpatialContext.evaluate({
  position: { lat: 10, lng: 106 },
  route: [[10, 106], [10.01, 106.01]],
  events: [event]
}, { radiusM: 2000, corridorM: 200 });
assert(context.nearby.length === 1, 'nearby context failed');
assert(context.on_route.length === 1, 'on-route context failed');
assert(context.risk.score > 0, 'risk score should be positive');

const hazards = Core.Route.analyzeHazards(
  [[10, 106], [10.01, 106.01]],
  { events: [event] },
  { corridorM: 200 }
);
assert.strictEqual(hazards.count, 1, 'route hazard detection failed');

const profile = Core.Knowledge.riskProfile({ types: ['flood'] });
assert(profile.count >= 1, 'knowledge risk profile failed');

console.log('Vietflex Core Tech smoke test OK', {
  version: Core.version,
  capabilities: caps.size,
  risk: context.risk.score,
  hazards: hazards.count
});
