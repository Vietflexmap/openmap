/* Vietflex Platform Core v0.3.0
 * Durable facade for Data, Schema, Storage, Spatial, Time/Event,
 * Mobility/IoT, GeoAI and Service/SDK capabilities.
 */
(function (global) {
  'use strict';

  const VERSION = '0.3.0';
  const PLATFORM_SCHEMA = 'vietflex-platform/0.3';

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowISO() { return new Date().toISOString(); }

  class Registry {
    constructor(name) { this.name = name; this.items = new Map(); }
    register(id, adapter, meta) {
      if (!id || !adapter) throw new Error(this.name + ': id và adapter là bắt buộc');
      this.items.set(id, { id, adapter, meta: Object.assign({}, meta || {}) });
      return this;
    }
    get(id) { return this.items.get(id) || null; }
    list() { return Array.from(this.items.values()).map(x => ({ id: x.id, meta: clone(x.meta) })); }
  }

  const config = {
    language: 'vi',
    datasetVersion: null,
    schemaVersion: '0.3.0',
    endpoints: {},
    storage: {},
    ai: {},
    device: {}
  };

  const DataCore = {
    sources: new Registry('DataCore.sources'),
    registerSource(id, adapter, meta) { this.sources.register(id, adapter, meta); return this; },
    listSources() { return this.sources.list(); },
    describe() {
      return {
        categories: ['osm','dem','satellite','gps','camera','iot','tpms','obd'],
        principles: ['source-of-truth','license-metadata','timestamped-ingest','qa','versioned-builds']
      };
    }
  };

  const SchemaCore = {
    version: '0.3.0',
    namespaces: ['vf_base','vf_place','vf_road','vf_sensor','vf_event','vf_media','vf_ai'],
    namePolicy: ['name:vi','name_vi','name','name:latin','name_en'],
    createFeature(input) {
      const x = input || {};
      return {
        vf_id: x.vf_id || (global.crypto && crypto.randomUUID ? crypto.randomUUID() : 'vf-' + Date.now()),
        vf_type: x.vf_type || 'feature',
        schema_version: this.version,
        dataset_version: x.dataset_version || config.datasetVersion,
        source: x.source || null,
        source_id: x.source_id || null,
        name_vi: x.name_vi || x.name || null,
        name: x.name || x.name_vi || null,
        observed_at: x.observed_at || null,
        ingested_at: x.ingested_at || nowISO(),
        geometry: x.geometry || null,
        properties: Object.assign({}, x.properties || {}),
        metadata: Object.assign({ language: config.language }, x.metadata || {})
      };
    },
    validateFeature(feature) {
      const errors = [];
      if (!feature || typeof feature !== 'object') errors.push('feature phải là object');
      if (feature && !feature.vf_id) errors.push('thiếu vf_id');
      if (feature && !feature.vf_type) errors.push('thiếu vf_type');
      if (feature && !feature.schema_version) errors.push('thiếu schema_version');
      return { valid: errors.length === 0, errors };
    }
  };

  const StorageCore = {
    adapters: new Registry('StorageCore.adapters'),
    register(id, adapter, meta) { this.adapters.register(id, adapter, meta); return this; },
    list() { return this.adapters.list(); },
    formats: {
      postgis: { role: 'query-dynamic-transactional' },
      gpkg: { role: 'portable-vector-raster-package' },
      cog: { role: 'cloud-optimized-raster' },
      pmtiles: { role: 'static-vector-raster-distribution' },
      objectStorage: { role: 'immutable-artifacts-media-tiles' }
    }
  };

  const SpatialCore = {
    adapters: new Registry('SpatialCore.adapters'),
    register(id, adapter, meta) { this.adapters.register(id, adapter, meta); return this; },
    async run(operation, payload, options) {
      const id = (options && options.adapter) || operation;
      const entry = this.adapters.get(id);
      if (!entry || typeof entry.adapter.run !== 'function') {
        throw new Error('SpatialCore: chưa cấu hình adapter cho ' + operation);
      }
      return entry.adapter.run(operation, payload, options || {});
    },
    operations: ['buffer','intersect','within','nearest','spatial-query','routing','geocoding','reverse-geocoding','map-matching','terrain']
  };

  class EventBus {
    constructor() { this.handlers = new Map(); }
    on(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(fn); return () => this.off(type, fn);
    }
    off(type, fn) { const s = this.handlers.get(type); if (s) s.delete(fn); }
    emit(type, payload) { const s = this.handlers.get(type); if (s) s.forEach(fn => { try { fn(payload); } catch (_) {} }); }
  }

  const TimeEventCore = {
    bus: new EventBus(),
    normalizeTimestamp(value) {
      if (value === undefined || value === null) return nowISO();
      if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
      return new Date(value).toISOString();
    },
    createEvent(input) {
      const x = input || {};
      return {
        event_id: x.event_id || (global.crypto && crypto.randomUUID ? crypto.randomUUID() : 'evt-' + Date.now()),
        type: x.type || 'event',
        time: this.normalizeTimestamp(x.time),
        end_time: x.end_time ? this.normalizeTimestamp(x.end_time) : null,
        position: x.position || null,
        asset_id: x.asset_id || null,
        media_ref: x.media_ref || null,
        sensor_ref: x.sensor_ref || null,
        payload: Object.assign({}, x.payload || {}),
        dataset_version: x.dataset_version || config.datasetVersion
      };
    },
    align(streams, toleranceMs) {
      const tolerance = Number.isFinite(toleranceMs) ? toleranceMs : 500;
      const rows = [];
      Object.keys(streams || {}).forEach(streamName => {
        (streams[streamName] || []).forEach(item => rows.push({ stream: streamName, t: new Date(item.time || item.timestamp).getTime(), item }));
      });
      rows.sort((a,b) => a.t - b.t);
      return rows.map((row, i) => ({ index: i, time: new Date(row.t).toISOString(), stream: row.stream, item: row.item, tolerance_ms: tolerance }));
    }
  };

  const MobilityIoTCore = {
    adapters: new Registry('MobilityIoTCore.adapters'),
    protocols: ['ble','usb','can','obd','tpms','wifi','serial','mqtt','http'],
    register(id, adapter, meta) { this.adapters.register(id, adapter, meta); return this; },
    list() { return this.adapters.list(); },
    async connect(id, options) {
      const entry = this.adapters.get(id);
      if (!entry || typeof entry.adapter.connect !== 'function') throw new Error('MobilityIoTCore: adapter không hỗ trợ connect: ' + id);
      return entry.adapter.connect(options || {});
    },
    normalizeTelemetry(input) {
      const x = input || {};
      return {
        time: TimeEventCore.normalizeTimestamp(x.time || x.timestamp),
        device_id: x.device_id || null,
        asset_id: x.asset_id || null,
        lat: x.lat ?? null,
        lon: x.lon ?? x.lng ?? null,
        speed_kmh: x.speed_kmh ?? null,
        heading_deg: x.heading_deg ?? null,
        tire_pressure_kpa: x.tire_pressure_kpa || null,
        tire_temperature_c: x.tire_temperature_c || null,
        rpm: x.rpm ?? null,
        obd_speed_kmh: x.obd_speed_kmh ?? null,
        payload: Object.assign({}, x.payload || {})
      };
    }
  };

  const GeoAICore = {
    adapters: new Registry('GeoAICore.adapters'),
    register(id, adapter, meta) { this.adapters.register(id, adapter, meta); return this; },
    list() { return this.adapters.list(); },
    async infer(task, input, options) {
      const id = options && options.adapter;
      const entry = id ? this.adapters.get(id) : this.adapters.items.values().next().value;
      if (!entry || typeof entry.adapter.infer !== 'function') throw new Error('GeoAICore: chưa cấu hình AI adapter');
      return entry.adapter.infer(task, input, options || {});
    },
    tasks: ['image-understanding','video-event-detection','geo-query-generation','feature-extraction','qa','anomaly-detection','sensor-fusion']
  };

  const ServiceSDKCore = {
    services: new Registry('ServiceSDKCore.services'),
    register(id, service, meta) { this.services.register(id, service, meta); return this; },
    get(id) { const x = this.services.get(id); return x ? x.adapter : null; },
    list() { return this.services.list(); },
    contract: {
      version: VERSION,
      coordinateOrder: 'Vietflex API: [lat,lng]; storage/API payload nên ghi rõ CRS/order',
      defaultCRS: 'EPSG:4326',
      time: 'ISO-8601 UTC khuyến nghị',
      language: 'vi'
    }
  };

  const Platform = {
    version: VERSION,
    schema: PLATFORM_SCHEMA,
    config,
    configure(next) {
      Object.assign(config, next || {});
      if (next && next.endpoints) config.endpoints = Object.assign({}, config.endpoints, next.endpoints);
      if (next && next.storage) config.storage = Object.assign({}, config.storage, next.storage);
      if (next && next.ai) config.ai = Object.assign({}, config.ai, next.ai);
      if (next && next.device) config.device = Object.assign({}, config.device, next.device);
      return clone(config);
    },
    getConfig() { return clone(config); },
    Data: DataCore,
    Schema: SchemaCore,
    Storage: StorageCore,
    Spatial: SpatialCore,
    TimeEvent: TimeEventCore,
    MobilityIoT: MobilityIoTCore,
    GeoAI: GeoAICore,
    ServiceSDK: ServiceSDKCore
  };

  global.Vietflex = global.Vietflex || {};
  global.Vietflex.Platform = Platform;
})(typeof window !== 'undefined' ? window : globalThis);
