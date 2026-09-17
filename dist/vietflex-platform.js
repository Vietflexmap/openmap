/* Vietflex Core Tech v0.5.0
 * Stable domain core + capability registry + event/context/route/watch/knowledge contracts.
 * Ports & Adapters: concrete storage, routing, search, stream and AI implementations stay outside the stable domain core.
 */
(function (global) {
  'use strict';

  const VERSION = '0.5.0';
  const CORE_SCHEMA = 'vietflex-core-tech/0.5';

  function clone(v) {
    if (v === undefined) return undefined;
    return JSON.parse(JSON.stringify(v));
  }
  function nowISO() { return new Date().toISOString(); }
  function uuid(prefix) {
    if (global.crypto && global.crypto.randomUUID) return prefix + ':' + global.crypto.randomUUID();
    return prefix + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 9);
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function finite(value) { return Number.isFinite(Number(value)); }
  function asArray(value) { return Array.isArray(value) ? value : value == null ? [] : [value]; }

  class Registry {
    constructor(name) { this.name = name; this.items = new Map(); }
    register(id, value, meta) {
      if (!id || !value) throw new Error(this.name + ': id và value là bắt buộc');
      this.items.set(id, { id, value, meta: Object.assign({}, meta || {}) });
      return this;
    }
    unregister(id) { this.items.delete(id); return this; }
    get(id) { return this.items.get(id) || null; }
    has(id) { return this.items.has(id); }
    clear() { this.items.clear(); return this; }
    list() { return Array.from(this.items.values()).map(x => ({ id: x.id, meta: clone(x.meta) })); }
  }

  const config = {
    language: 'vi',
    defaultCRS: 'EPSG:4326',
    datasetVersion: null,
    schemaVersion: VERSION,
    endpoints: {},
    security: { defaultPermission: 'read' },
    runtime: {
      eventHistoryLimit: 1000,
      knowledgeEventLimit: 5000
    }
  };

  function normalizePoint(input) {
    if (!input) return null;
    if (Array.isArray(input) && input.length >= 2) {
      const lat = Number(input[0]), lon = Number(input[1]);
      return finite(lat) && finite(lon) ? { lat, lon } : null;
    }
    if (input.type === 'Point' && Array.isArray(input.coordinates)) {
      const lon = Number(input.coordinates[0]), lat = Number(input.coordinates[1]);
      return finite(lat) && finite(lon) ? { lat, lon } : null;
    }
    if (input.geometry) return normalizePoint(input.geometry);
    if (typeof input === 'object') {
      const lat = Number(input.lat ?? input.latitude);
      const lon = Number(input.lon ?? input.lng ?? input.longitude);
      return finite(lat) && finite(lon) ? { lat, lon } : null;
    }
    return null;
  }

  function pointGeometry(input) {
    const p = normalizePoint(input);
    return p ? { type: 'Point', coordinates: [p.lon, p.lat] } : null;
  }

  function haversineMeters(a0, b0) {
    const a = normalizePoint(a0), b = normalizePoint(b0);
    if (!a || !b) return Infinity;
    const R = 6371008.8;
    const rad = Math.PI / 180;
    const p1 = a.lat * rad, p2 = b.lat * rad;
    const dp = (b.lat - a.lat) * rad, dl = (b.lon - a.lon) * rad;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function toLineCoordinates(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      if (!input.length) return [];
      if (Array.isArray(input[0])) {
        return input.map(p => {
          const q = normalizePoint(p);
          return q ? [q.lon, q.lat] : null;
        }).filter(Boolean);
      }
      return [];
    }
    if (input.type === 'LineString') return input.coordinates || [];
    if (input.geometry) return toLineCoordinates(input.geometry);
    if (input.shape) return toLineCoordinates(input.shape);
    return [];
  }

  function distancePointToLineMeters(point0, line0) {
    const p = normalizePoint(point0);
    const line = toLineCoordinates(line0);
    if (!p || !line.length) return Infinity;
    if (line.length === 1) return haversineMeters(p, { lon: line[0][0], lat: line[0][1] });

    const cosLat = Math.cos(p.lat * Math.PI / 180);
    const xy = (coord) => [
      (Number(coord[0]) - p.lon) * 111320 * cosLat,
      (Number(coord[1]) - p.lat) * 110540
    ];
    let best = Infinity;
    for (let i = 1; i < line.length; i += 1) {
      const [ax, ay] = xy(line[i - 1]);
      const [bx, by] = xy(line[i]);
      const dx = bx - ax, dy = by - ay;
      const denom = dx * dx + dy * dy;
      const t = denom ? clamp(-(ax * dx + ay * dy) / denom, 0, 1) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }

  function geometryBBox(input) {
    const g = input && input.geometry ? input.geometry : input;
    if (!g || !g.type) {
      const p = normalizePoint(g);
      return p ? [p.lon, p.lat, p.lon, p.lat] : null;
    }
    const flat = [];
    (function walk(v) {
      if (!Array.isArray(v)) return;
      if (v.length >= 2 && finite(v[0]) && finite(v[1]) && !Array.isArray(v[0])) {
        flat.push([Number(v[0]), Number(v[1])]);
        return;
      }
      v.forEach(walk);
    })(g.coordinates);
    if (!flat.length) return null;
    return [
      Math.min(...flat.map(p => p[0])),
      Math.min(...flat.map(p => p[1])),
      Math.max(...flat.map(p => p[0])),
      Math.max(...flat.map(p => p[1]))
    ];
  }

  function bboxIntersects(a, b) {
    if (!a || !b) return false;
    return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  }

  function pointInRing(point0, ring) {
    const p = normalizePoint(point0);
    if (!p || !Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    const x = p.lon, y = p.lat;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Number(ring[i][0]), yi = Number(ring[i][1]);
      const xj = Number(ring[j][0]), yj = Number(ring[j][1]);
      const hit = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function pointInGeometry(point, geometry0) {
    const g = geometry0 && geometry0.geometry ? geometry0.geometry : geometry0;
    if (!g) return false;
    if (g.type === 'Polygon') {
      if (!g.coordinates?.length || !pointInRing(point, g.coordinates[0])) return false;
      return !g.coordinates.slice(1).some(ring => pointInRing(point, ring));
    }
    if (g.type === 'MultiPolygon') {
      return (g.coordinates || []).some(poly => pointInGeometry(point, { type: 'Polygon', coordinates: poly }));
    }
    return false;
  }

  function itemGeometry(item) {
    if (!item) return null;
    if (item.geometry) return item.geometry;
    if (item.position) return pointGeometry(item.position);
    if (normalizePoint(item)) return pointGeometry(item);
    return null;
  }

  function itemPoint(item) {
    return normalizePoint(item?.position || item?.geometry || item);
  }

  const TemporalCore = {
    normalizeTimestamp(value) {
      if (value === undefined || value === null) return nowISO();
      if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error('TemporalCore: timestamp không hợp lệ');
      return d.toISOString();
    },
    normalizeWindow(input) {
      const x = input || {};
      const observed = x.observed_at || x.observedAt || x.time || null;
      const validFrom = x.valid_from || x.validFrom || observed || null;
      const validTo = x.valid_to || x.validTo || x.end_time || x.endTime || null;
      const received = x.received_at || x.receivedAt || x.ingested_at || x.ingestedAt || nowISO();
      const expires = x.expires_at || x.expiresAt || null;
      return {
        observed_at: observed ? this.normalizeTimestamp(observed) : null,
        valid_from: validFrom ? this.normalizeTimestamp(validFrom) : null,
        valid_to: validTo ? this.normalizeTimestamp(validTo) : null,
        received_at: this.normalizeTimestamp(received),
        expires_at: expires ? this.normalizeTimestamp(expires) : null
      };
    },
    isActive(window0, at) {
      const w = window0 || {};
      const t = new Date(this.normalizeTimestamp(at || nowISO())).getTime();
      const from = w.valid_from ? new Date(w.valid_from).getTime() : -Infinity;
      const to = w.valid_to ? new Date(w.valid_to).getTime() : Infinity;
      const expires = w.expires_at ? new Date(w.expires_at).getTime() : Infinity;
      return t >= from && t <= to && t <= expires;
    },
    ageMs(window0, at) {
      const w = window0 || {};
      const raw = w.observed_at || w.received_at || w.valid_from;
      if (!raw) return null;
      return Math.max(0, new Date(this.normalizeTimestamp(at || nowISO())).getTime() - new Date(raw).getTime());
    },
    align(streams, toleranceMs) {
      const tolerance = Number.isFinite(toleranceMs) ? toleranceMs : 500;
      const rows = [];
      Object.keys(streams || {}).forEach(streamName => {
        (streams[streamName] || []).forEach(item => {
          const raw = item.time?.observed_at || item.time || item.timestamp || item.observed_at;
          rows.push({ stream: streamName, t: new Date(this.normalizeTimestamp(raw)).getTime(), item });
        });
      });
      rows.sort((a, b) => a.t - b.t);
      return rows.map((row, index) => ({
        index,
        time: new Date(row.t).toISOString(),
        stream: row.stream,
        item: row.item,
        tolerance_ms: tolerance
      }));
    }
  };

  const SchemaCore = {
    version: VERSION,
    registry: new Registry('SchemaCore.registry'),
    namespaces: [
      'vf.feature','vf.place','vf.road','vf.track','vf.sensor','vf.device',
      'vf.event','vf.media','vf.raster','vf.terrain','vf.ai_result','vf.route',
      'vf.watch','vf.knowledge','vf.context','vf.dataset'
    ],
    namePolicy: ['name:vi','name_vi','name','name:latin','name_en'],
    register(id, schema, meta) { this.registry.register(id, schema, meta); return this; },
    list() { return this.registry.list(); },
    createFeature(input) {
      const x = input || {};
      return {
        vf_id: x.vf_id || uuid('vf'),
        vf_type: x.vf_type || 'vf.feature',
        schema_version: x.schema_version || this.version,
        dataset_version: x.dataset_version || config.datasetVersion,
        geometry: x.geometry || null,
        properties: Object.assign({}, x.properties || {}),
        name_vi: x.name_vi || x.name || null,
        name: x.name || x.name_vi || null,
        time: TemporalCore.normalizeWindow(x.time || x),
        source: typeof x.source === 'object'
          ? Object.assign({}, x.source)
          : Object.assign({ provider: x.source || null, source_id: x.source_id || null }, x.source_meta || {}),
        provenance: Object.assign({}, x.provenance || {}),
        quality: Object.assign({}, x.quality || {}),
        metadata: Object.assign({ language: config.language, crs: config.defaultCRS }, x.metadata || {})
      };
    },
    validateFeature(feature) {
      const errors = [];
      if (!feature || typeof feature !== 'object') errors.push('feature phải là object');
      if (feature && !feature.vf_id) errors.push('thiếu vf_id');
      if (feature && !feature.vf_type) errors.push('thiếu vf_type');
      if (feature && !feature.schema_version) errors.push('thiếu schema_version');
      if (feature && feature.geometry && typeof feature.geometry !== 'object') errors.push('geometry không hợp lệ');
      if (feature && feature.time && typeof feature.time !== 'object') errors.push('time phải là object');
      return { valid: errors.length === 0, errors };
    }
  };

  const CapabilityCore = {
    registry: new Registry('CapabilityCore.registry'),
    register(definition, handler) {
      if (!definition || !definition.id) throw new Error('CapabilityCore: thiếu capability id');
      this.registry.register(definition.id, handler || definition.handler || {}, {
        version: definition.version || '1.0.0',
        category: definition.category || 'general',
        permission: definition.permission || 'read',
        stability: definition.stability || 'stable',
        inputSchema: definition.inputSchema || null,
        outputSchema: definition.outputSchema || null,
        provider: definition.provider || null,
        local: Boolean(definition.local),
        description_vi: definition.description_vi || null
      });
      return this;
    },
    unregister(id) { this.registry.unregister(id); return this; },
    has(id) { return this.registry.has(id); },
    list() { return this.registry.list(); },
    describe(id) {
      const x = this.registry.get(id);
      return x ? { id: x.id, meta: clone(x.meta) } : null;
    },
    async execute(id, payload, context) {
      const entry = this.registry.get(id);
      if (!entry) throw new Error('Capability chưa được đăng ký: ' + id);
      const handler = entry.value;
      if (typeof handler === 'function') return handler(payload, context || {});
      if (handler && typeof handler.execute === 'function') return handler.execute(payload, context || {});
      throw new Error('Capability không có execute handler: ' + id);
    }
  };

  class EventBus {
    constructor() { this.handlers = new Map(); }
    on(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(fn);
      return () => this.off(type, fn);
    }
    off(type, fn) {
      const set = this.handlers.get(type);
      if (set) set.delete(fn);
    }
    emit(type, payload) {
      const fire = (set) => set && set.forEach(fn => { try { fn(payload, type); } catch (_) {} });
      fire(this.handlers.get(type));
      if (type !== '*') fire(this.handlers.get('*'));
    }
  }

  const EventCore = {
    bus: new EventBus(),
    history: [],
    create(input) {
      const x = input || {};
      const geometry = x.geometry || pointGeometry(x.position || x);
      return {
        event_id: x.event_id || uuid('evt'),
        schema_version: x.schema_version || VERSION,
        type: x.type || 'vf.event',
        geometry: geometry || null,
        severity: x.severity ?? null,
        status: x.status || 'active',
        confidence: x.confidence == null ? null : clamp(Number(x.confidence), 0, 1),
        time: TemporalCore.normalizeWindow(x.time || x),
        source: typeof x.source === 'object' ? Object.assign({}, x.source) : { provider: x.source || null },
        asset_id: x.asset_id || null,
        refs: Object.assign({}, x.refs || {}),
        properties: Object.assign({}, x.properties || x.payload || {}),
        media: Array.isArray(x.media) ? clone(x.media) : [],
        dataset_version: x.dataset_version || config.datasetVersion,
        provenance: Object.assign({}, x.provenance || {}),
        quality: Object.assign({}, x.quality || {})
      };
    },
    validate(event) {
      const errors = [];
      if (!event?.event_id) errors.push('thiếu event_id');
      if (!event?.type) errors.push('thiếu type');
      if (!event?.time || typeof event.time !== 'object') errors.push('thiếu time');
      if (event?.confidence != null && (!finite(event.confidence) || Number(event.confidence) < 0 || Number(event.confidence) > 1)) {
        errors.push('confidence phải trong [0,1]');
      }
      return { valid: errors.length === 0, errors };
    },
    publish(typeOrEvent, payload) {
      let event;
      if (typeof typeOrEvent === 'string') {
        event = payload?.event_id ? payload : this.create(Object.assign({}, payload || {}, { type: typeOrEvent }));
      } else {
        event = typeOrEvent?.event_id ? typeOrEvent : this.create(typeOrEvent || {});
      }
      const checked = this.validate(event);
      if (!checked.valid) throw new Error('EventCore: ' + checked.errors.join('; '));
      this.history.push(event);
      const limit = config.runtime.eventHistoryLimit || 1000;
      if (this.history.length > limit) this.history.splice(0, this.history.length - limit);
      this.bus.emit(event.type, event);
      return event;
    },
    subscribe(type, fn) { return this.bus.on(type, fn); },
    recent(options) {
      const opts = options || {};
      const types = opts.types ? new Set(asArray(opts.types)) : null;
      const activeOnly = opts.activeOnly !== false;
      return this.history.filter(e => {
        if (types && !types.has(e.type)) return false;
        if (activeOnly && (e.status !== 'active' || !TemporalCore.isActive(e.time, opts.at))) return false;
        return true;
      }).slice(-(opts.limit || this.history.length));
    }
  };

  const DataCore = {
    sources: new Registry('DataCore.sources'),
    datasets: new Registry('DataCore.datasets'),
    registerSource(id, adapter, meta) { this.sources.register(id, adapter, meta); return this; },
    unregisterSource(id) { this.sources.unregister(id); return this; },
    listSources() { return this.sources.list(); },
    registerDataset(definition) {
      if (!definition?.dataset_id) throw new Error('DataCore: dataset_id là bắt buộc');
      const def = Object.assign({
        schema_version: VERSION,
        dataset_version: null,
        license: null,
        provenance: {},
        quality: {},
        update_policy: {},
        endpoint: null,
        format: null
      }, clone(definition));
      this.datasets.register(def.dataset_id, def, {
        dataset_version: def.dataset_version,
        format: def.format,
        license: def.license
      });
      return def;
    },
    getDataset(id) { const x = this.datasets.get(id); return x ? clone(x.value) : null; },
    listDatasets() { return this.datasets.list(); },
    unregisterDataset(id) { this.datasets.unregister(id); return this; },
    categories: ['osm','dem','satellite','gps','camera','iot','tpms','obd','imu','lidar','weather','traffic','administrative','community'],
    principles: ['source-of-truth','provenance','license-metadata','timestamped-ingest','qa','versioned-builds']
  };

  const SpatialCore = {
    operations: [
      'distance','buffer','intersect','within','nearest','nearby','spatial-query',
      'routing','geocoding','reverse-geocoding','map-matching','terrain'
    ],
    distance(a, b) { return haversineMeters(a, b); },
    distanceToLine(point, line) { return distancePointToLineMeters(point, line); },
    nearby(point, items, options) {
      const opts = Object.assign({ radiusM: 1000 }, options || {});
      const p = normalizePoint(point);
      if (!p) throw new Error('SpatialCore.nearby: point không hợp lệ');
      return (items || []).map(item => {
        const q = itemPoint(item);
        const distance_m = q ? haversineMeters(p, q) : Infinity;
        return { item, distance_m };
      }).filter(x => x.distance_m <= opts.radiusM).sort((a, b) => a.distance_m - b.distance_m);
    },
    intersects(a, b) {
      const pa = normalizePoint(a), pb = normalizePoint(b);
      if (pa && b?.type && /Polygon/.test(b.type)) return pointInGeometry(pa, b);
      if (pb && a?.type && /Polygon/.test(a.type)) return pointInGeometry(pb, a);
      return bboxIntersects(geometryBBox(a), geometryBBox(b));
    },
    within(point, polygon) { return pointInGeometry(point, polygon); },
    async run(operation, payload, options) {
      const local = {
        distance: () => this.distance(payload.a, payload.b),
        nearby: () => this.nearby(payload.point, payload.items, payload.options),
        intersect: () => this.intersects(payload.a, payload.b),
        intersects: () => this.intersects(payload.a, payload.b),
        within: () => this.within(payload.point, payload.polygon)
      };
      if (local[operation]) return local[operation]();
      const capabilityId = (options && options.capability) || 'spatial.' + operation;
      return CapabilityCore.execute(capabilityId, payload, options || {});
    }
  };

  function numericSeverity(value) {
    if (value == null) return 0;
    if (finite(value)) return clamp(Number(value), 0, 5);
    const key = String(value).toLowerCase();
    return ({
      info: 0.5, low: 1, minor: 1, medium: 2, moderate: 2.5,
      high: 3.5, major: 4, severe: 4.5, critical: 5
    })[key] ?? 1;
  }

  const SpatialContextEngine = {
    defaults: {
      nearbyRadiusM: 1000,
      routeCorridorM: 150,
      riskHalfLifeMs: 3 * 3600 * 1000
    },
    nearby(input, options) {
      const x = input || {};
      const opts = Object.assign({}, this.defaults, options || x.options || {});
      const at = opts.at || nowISO();
      const events = (x.events || x.items || []).filter(e =>
        opts.includeInactive || (e.status !== 'resolved' && TemporalCore.isActive(e.time || {}, at))
      );
      return SpatialCore.nearby(x.position || x.point, events, { radiusM: opts.radiusM || opts.nearbyRadiusM })
        .map(row => Object.assign({}, row, {
          active: TemporalCore.isActive(row.item.time || {}, at),
          risk: this.score(row.item, row.distance_m, opts)
        }));
    },
    onRoute(input, options) {
      const x = input || {};
      const opts = Object.assign({}, this.defaults, options || x.options || {});
      const route = x.route?.geometry || x.route?.shape || x.route;
      const corridor = opts.corridorM || opts.routeCorridorM;
      const at = opts.at || nowISO();
      return (x.events || x.items || []).map(item => {
        const p = itemPoint(item);
        const distance_m = p ? distancePointToLineMeters(p, route) : Infinity;
        return {
          item,
          distance_m,
          active: TemporalCore.isActive(item.time || {}, at),
          risk: this.score(item, distance_m, opts)
        };
      }).filter(row =>
        row.distance_m <= corridor &&
        (opts.includeInactive || (row.item.status !== 'resolved' && row.active))
      ).sort((a, b) => b.risk - a.risk || a.distance_m - b.distance_m);
    },
    intersects(input) {
      const x = input || {};
      return (x.items || x.events || []).filter(item => SpatialCore.intersects(x.geometry, itemGeometry(item)));
    },
    score(item, distanceM, options) {
      const opts = Object.assign({}, this.defaults, options || {});
      const sev = numericSeverity(item?.severity);
      const conf = item?.confidence == null ? 0.75 : clamp(Number(item.confidence), 0, 1);
      const age = TemporalCore.ageMs(item?.time || {}, opts.at || nowISO());
      const freshness = age == null ? 0.8 : Math.exp(-age / Math.max(1, opts.riskHalfLifeMs));
      const distanceFactor = !finite(distanceM) ? 1 : 1 / (1 + Math.max(0, Number(distanceM)) / 250);
      return Number(clamp((sev / 5) * 0.5 + conf * 0.2 + freshness * 0.2 + distanceFactor * 0.1, 0, 1).toFixed(4));
    },
    risk(input, options) {
      const x = input || {};
      const nearby = x.position ? this.nearby(x, options) : [];
      const onRoute = x.route ? this.onRoute(x, options) : [];
      const all = [...nearby, ...onRoute];
      const max = all.reduce((m, r) => Math.max(m, r.risk || 0), 0);
      const mean = all.length ? all.reduce((s, r) => s + (r.risk || 0), 0) / all.length : 0;
      return {
        score: Number(clamp(max * 0.7 + mean * 0.3, 0, 1).toFixed(4)),
        nearby,
        on_route: onRoute,
        evaluated_at: nowISO()
      };
    },
    evaluate(input, options) {
      const x = input || {};
      return {
        nearby: x.position ? this.nearby(x, options) : [],
        on_route: x.route ? this.onRoute(x, options) : [],
        risk: this.risk(x, options),
        evaluated_at: nowISO()
      };
    }
  };

  const RouteEngine = {
    providers: new Registry('RouteEngine.providers'),
    registerProvider(id, provider, meta) { this.providers.register(id, provider, meta); return this; },
    unregisterProvider(id) { this.providers.unregister(id); return this; },
    listProviders() { return this.providers.list(); },
    async compute(payload, options) {
      const opts = options || {};
      if (opts.provider && this.providers.has(opts.provider)) {
        const provider = this.providers.get(opts.provider).value;
        if (typeof provider === 'function') return provider(payload, opts);
        if (provider?.route) return provider.route(payload, opts);
      }
      if (CapabilityCore.has('routing.route')) return CapabilityCore.execute('routing.route', payload, opts);
      throw new Error('RouteEngine: chưa có routing.route capability hoặc route provider.');
    },
    analyzeHazards(route, context, options) {
      const events = context?.events || context?.items || [];
      const rows = SpatialContextEngine.onRoute({ route, events }, options);
      return {
        hazards: rows,
        count: rows.length,
        max_risk: rows.reduce((m, r) => Math.max(m, r.risk || 0), 0),
        blocked: rows.filter(r => r.item?.properties?.blocking || r.item?.status === 'blocked').length,
        evaluated_at: nowISO()
      };
    }
  };

  const WatchEngine = {
    registry: new Registry('WatchEngine.registry'),
    create(input) {
      const x = input || {};
      const watch = {
        watch_id: x.watch_id || uuid('watch'),
        schema_version: x.schema_version || VERSION,
        name: x.name || null,
        enabled: x.enabled !== false,
        target: clone(x.target || {}),
        conditions: clone(x.conditions || {}),
        delivery: clone(x.delivery || []),
        created_at: x.created_at || nowISO(),
        metadata: clone(x.metadata || {})
      };
      if (!watch.target.type) throw new Error('WatchEngine: target.type là bắt buộc');
      this.registry.register(watch.watch_id, watch, { target: watch.target.type, enabled: watch.enabled });
      return clone(watch);
    },
    remove(id) { this.registry.unregister(id); return this; },
    get(id) { const x = this.registry.get(id); return x ? clone(x.value) : null; },
    list() { return this.registry.list().map(x => clone(this.registry.get(x.id).value)); },
    matches(watch0, event) {
      const watch = watch0?.watch_id ? watch0 : this.get(watch0);
      if (!watch || !watch.enabled || !event) return false;
      const c = watch.conditions || {};
      if (c.event_types?.length && !c.event_types.includes(event.type)) return false;
      if (c.status?.length && !c.status.includes(event.status)) return false;
      if (c.min_severity != null && numericSeverity(event.severity) < numericSeverity(c.min_severity)) return false;
      if (c.min_confidence != null && Number(event.confidence ?? 0) < Number(c.min_confidence)) return false;

      const target = watch.target || {};
      if (target.type === 'asset') return Boolean(target.asset_id && target.asset_id === event.asset_id);
      if (target.type === 'point') {
        const p = normalizePoint(target);
        const e = itemPoint(event);
        return Boolean(p && e && haversineMeters(p, e) <= Number(target.radius_m || 500));
      }
      if (target.type === 'route') {
        const e = itemPoint(event);
        return Boolean(e && distancePointToLineMeters(e, target.geometry || target.shape) <= Number(target.corridor_m || 150));
      }
      if (target.type === 'polygon') {
        const e = itemPoint(event);
        return Boolean(e && pointInGeometry(e, target.geometry));
      }
      return false;
    },
    evaluateEvent(event, options) {
      const matches = this.list().filter(w => this.matches(w, event, options));
      matches.forEach(watch => EventCore.bus.emit('watch.match', {
        watch,
        event,
        matched_at: nowISO()
      }));
      return matches;
    }
  };

  const KnowledgeCore = {
    entries: new Registry('KnowledgeCore.entries'),
    events: [],
    put(input) {
      const x = input || {};
      const entry = {
        knowledge_id: x.knowledge_id || uuid('kn'),
        schema_version: x.schema_version || VERSION,
        type: x.type || 'vf.knowledge',
        geometry: x.geometry || null,
        subject: x.subject || null,
        facts: clone(x.facts || {}),
        evidence: clone(x.evidence || []),
        confidence: x.confidence == null ? null : clamp(Number(x.confidence), 0, 1),
        valid_from: x.valid_from || null,
        valid_to: x.valid_to || null,
        updated_at: nowISO(),
        provenance: clone(x.provenance || {})
      };
      this.entries.register(entry.knowledge_id, entry, { type: entry.type, subject: entry.subject });
      return clone(entry);
    },
    get(id) { const x = this.entries.get(id); return x ? clone(x.value) : null; },
    list() { return this.entries.list().map(x => clone(this.entries.get(x.id).value)); },
    query(options) {
      const opts = options || {};
      return this.list().filter(x => {
        if (opts.type && x.type !== opts.type) return false;
        if (opts.subject && x.subject !== opts.subject) return false;
        if (opts.geometry && x.geometry && !SpatialCore.intersects(opts.geometry, x.geometry)) return false;
        return true;
      });
    },
    ingestEvent(event) {
      if (!event?.event_id) return null;
      if (this.events.some(e => e.event_id === event.event_id)) return event;
      this.events.push(clone(event));
      const limit = config.runtime.knowledgeEventLimit || 5000;
      if (this.events.length > limit) this.events.splice(0, this.events.length - limit);
      return event;
    },
    riskProfile(options) {
      const opts = options || {};
      const from = opts.from ? new Date(TemporalCore.normalizeTimestamp(opts.from)).getTime() : -Infinity;
      const to = opts.to ? new Date(TemporalCore.normalizeTimestamp(opts.to)).getTime() : Infinity;
      const events = this.events.filter(e => {
        const t = new Date(e.time?.observed_at || e.time?.received_at || 0).getTime();
        if (t < from || t > to) return false;
        if (opts.types?.length && !opts.types.includes(e.type)) return false;
        if (opts.geometry && itemPoint(e) && !SpatialCore.intersects(opts.geometry, itemGeometry(e))) return false;
        return true;
      });
      const byType = {};
      events.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
      return {
        count: events.length,
        by_type: byType,
        max_severity: events.reduce((m, e) => Math.max(m, numericSeverity(e.severity)), 0),
        updated_at: nowISO()
      };
    }
  };

  const DomainServices = {
    services: new Registry('DomainServices.services'),
    register(id, service, meta) { this.services.register(id, service, meta); return this; },
    get(id) { const x = this.services.get(id); return x ? x.value : null; },
    list() { return this.services.list(); },
    async execute(capabilityId, payload, context) {
      return CapabilityCore.execute(capabilityId, payload, context || {});
    }
  };

  const AdapterLayer = {
    registry: new Registry('AdapterLayer.registry'),
    supportedKinds: [
      'postgis','gpkg','pmtiles','cog','object-storage','maplibre',
      'valhalla','photon','mqtt','sse','api','mcp','geoai','device'
    ],
    register(id, adapter, meta) { this.registry.register(id, adapter, meta); return this; },
    unregister(id) { this.registry.unregister(id); return this; },
    get(id) { const x = this.registry.get(id); return x ? x.value : null; },
    list() { return this.registry.list(); }
  };

  const GatewayCore = {
    registry: new Registry('GatewayCore.registry'),
    ports: ['cdn','api','mcp','sse','mqtt','events'],
    transports: ['http','https','sse','websocket','mqtt'],
    register(id, gateway, meta) { this.registry.register(id, gateway, meta); return this; },
    unregister(id) { this.registry.unregister(id); return this; },
    get(id) { const x = this.registry.get(id); return x ? x.value : null; },
    list() { return this.registry.list(); }
  };

  const PluginCore = {
    registry: new Registry('PluginCore.registry'),
    install(manifest, plugin) {
      if (!manifest || !manifest.id) throw new Error('PluginCore: manifest thiếu id');
      this.registry.register(manifest.id, plugin || {}, {
        version: manifest.version || '0.0.0',
        requires: manifest.requires || {},
        layers: manifest.layers || [],
        capabilities: manifest.capabilities || [],
        schemas: manifest.schemas || [],
        adapters: manifest.adapters || [],
        gateways: manifest.gateways || []
      });
      (manifest.capabilities || []).forEach(cap => {
        if (typeof cap === 'object' && cap.id && plugin?.capabilities?.[cap.id]) {
          CapabilityCore.register(cap, plugin.capabilities[cap.id]);
        }
      });
      Object.entries(plugin?.adapters || {}).forEach(([id, adapter]) => {
        AdapterLayer.register(id, adapter, { plugin: manifest.id });
      });
      Object.entries(plugin?.gateways || {}).forEach(([id, gateway]) => {
        GatewayCore.register(id, gateway, { plugin: manifest.id });
      });
      return this;
    },
    uninstall(id) { this.registry.unregister(id); return this; },
    list() { return this.registry.list(); }
  };

  const SDKCore = {
    contract: {
      version: VERSION,
      coreSchema: CORE_SCHEMA,
      defaultCRS: 'EPSG:4326',
      geojsonCoordinateOrder: '[longitude, latitude]',
      jsConvenienceCoordinateOrder: '[latitude, longitude]',
      time: 'ISO-8601 UTC',
      language: 'vi',
      principle: 'capability-first'
    },
    capabilities() { return CapabilityCore.list(); },
    adapters() { return AdapterLayer.list(); },
    gateways() { return GatewayCore.list(); },
    plugins() { return PluginCore.list(); },
    datasets() { return DataCore.listDatasets(); },
    watches() { return WatchEngine.list(); }
  };

  function registerLocalCapabilities() {
    const defs = [
      ['spatial.distance', 'spatial', 'read', p => SpatialCore.distance(p.a, p.b)],
      ['spatial.nearby', 'spatial', 'analyze', p => SpatialCore.nearby(p.point, p.items, p.options)],
      ['spatial.intersects', 'spatial', 'analyze', p => SpatialCore.intersects(p.a, p.b)],
      ['context.nearby', 'context', 'analyze', p => SpatialContextEngine.nearby(p, p.options)],
      ['context.on-route', 'context', 'analyze', p => SpatialContextEngine.onRoute(p, p.options)],
      ['context.risk', 'context', 'analyze', p => SpatialContextEngine.risk(p, p.options)],
      ['routing.analyze-hazards', 'routing', 'analyze', p => RouteEngine.analyzeHazards(p.route, p.context || p, p.options)],
      ['watch.create', 'watch', 'write', p => WatchEngine.create(p)],
      ['watch.evaluate', 'watch', 'analyze', p => WatchEngine.evaluateEvent(p.event || p, p.options)],
      ['knowledge.query', 'knowledge', 'read', p => KnowledgeCore.query(p)],
      ['knowledge.risk-profile', 'knowledge', 'analyze', p => KnowledgeCore.riskProfile(p)],
      ['event.publish', 'event', 'write', p => EventCore.publish(p)]
    ];
    defs.forEach(([id, category, permission, fn]) => CapabilityCore.register({
      id, version: '1.0.0', category, permission, provider: 'vietflex-local', local: true,
      description_vi: 'Capability lõi cục bộ của Vietflex Core Tech'
    }, { execute: fn }));
  }

  registerLocalCapabilities();

  EventCore.subscribe('*', event => {
    KnowledgeCore.ingestEvent(event);
    WatchEngine.evaluateEvent(event);
  });

  const StorageCompat = {
    register(id, adapter, meta) {
      AdapterLayer.register(id, adapter, Object.assign({ kind: id }, meta || {}));
      return this;
    },
    list() { return AdapterLayer.list(); },
    formats: {
      postgis: { role: 'query-dynamic-transactional' },
      gpkg: { role: 'portable-offline-package' },
      cog: { role: 'cloud-optimized-raster' },
      pmtiles: { role: 'static-tile-distribution' },
      objectStorage: { role: 'immutable-artifacts-media-tiles' }
    }
  };

  const MobilityIoTCompat = {
    protocols: ['ble','usb','can','obd','tpms','wifi','serial','mqtt','http'],
    register(id, adapter, meta) {
      AdapterLayer.register(id, adapter, Object.assign({ domain: 'mobility-iot' }, meta || {}));
      return this;
    },
    list() {
      return AdapterLayer.list().filter(x =>
        x.meta.domain === 'mobility-iot' || x.meta.kind === 'mqtt' || x.meta.kind === 'device'
      );
    },
    normalizeTelemetry(input) {
      const x = input || {};
      return {
        time: TemporalCore.normalizeTimestamp(x.time || x.timestamp),
        device_id: x.device_id || null,
        asset_id: x.asset_id || null,
        lat: x.lat ?? null,
        lon: x.lon ?? x.lng ?? null,
        speed_kmh: x.speed_kmh ?? null,
        heading_deg: x.heading_deg ?? null,
        rpm: x.rpm ?? null,
        tire_pressure_kpa: x.tire_pressure_kpa || null,
        tire_temperature_c: x.tire_temperature_c || null,
        payload: Object.assign({}, x.payload || {})
      };
    }
  };

  const GeoAICompat = {
    tasks: [
      'image-understanding','video-event-detection','geo-query-generation',
      'feature-extraction','qa','anomaly-detection','sensor-fusion'
    ],
    register(id, adapter, meta) {
      AdapterLayer.register(id, adapter, Object.assign({ kind: 'geoai' }, meta || {}));
      return this;
    },
    list() { return AdapterLayer.list().filter(x => x.meta.kind === 'geoai'); },
    async infer(task, input, options) {
      return CapabilityCore.execute('geoai.' + task, input, options || {});
    }
  };

  const Platform = {
    name: 'VIETFLEX CORE TECH',
    version: VERSION,
    schema: CORE_SCHEMA,
    architecture: 'ports-and-adapters',
    config,
    configure(next) {
      const n = next || {};
      Object.keys(n).forEach(key => {
        if (key === 'endpoints' || key === 'security' || key === 'runtime') {
          config[key] = Object.assign({}, config[key], n[key] || {});
        } else {
          config[key] = n[key];
        }
      });
      return clone(config);
    },
    getConfig() { return clone(config); },
    manifest() {
      return {
        name: this.name,
        version: VERSION,
        schema: CORE_SCHEMA,
        architecture: this.architecture,
        core: [
          'schema','capability','event','domain-services','data','spatial','temporal',
          'spatial-context','route','watch','knowledge'
        ],
        adapters: AdapterLayer.list(),
        gateways: GatewayCore.list(),
        plugins: PluginCore.list(),
        capabilities: CapabilityCore.list(),
        datasets: DataCore.listDatasets()
      };
    },
    Schema: SchemaCore,
    Capability: CapabilityCore,
    Event: EventCore,
    Domain: DomainServices,
    Data: DataCore,
    Spatial: SpatialCore,
    Temporal: TemporalCore,
    SpatialContext: SpatialContextEngine,
    Route: RouteEngine,
    Watch: WatchEngine,
    Knowledge: KnowledgeCore,
    Adapters: AdapterLayer,
    Gateways: GatewayCore,
    SDK: SDKCore,
    Plugins: PluginCore,

    Storage: StorageCompat,
    TimeEvent: Object.assign({}, TemporalCore, {
      bus: EventCore.bus,
      createEvent: EventCore.create.bind(EventCore)
    }),
    MobilityIoT: MobilityIoTCompat,
    GeoAI: GeoAICompat,
    ServiceSDK: SDKCore
  };

  global.Vietflex = global.Vietflex || {};
  global.Vietflex.Platform = Platform;
  global.Vietflex.CoreTech = Platform;
})(typeof window !== 'undefined' ? window : globalThis);
