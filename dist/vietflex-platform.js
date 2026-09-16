/* Vietflex Core Tech v0.4.0
 * Stable domain core + capability registry + ports/adapters facade.
 * Gateways (CDN/API/MCP/Events) and products stay outside the domain core.
 */
(function (global) {
  'use strict';

  const VERSION = '0.4.0';
  const CORE_SCHEMA = 'vietflex-core-tech/0.4';

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function nowISO() { return new Date().toISOString(); }
  function uuid(prefix) {
    if (global.crypto && global.crypto.randomUUID) return prefix + ':' + global.crypto.randomUUID();
    return prefix + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 9);
  }

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
    list() { return Array.from(this.items.values()).map(x => ({ id: x.id, meta: clone(x.meta) })); }
  }

  const config = {
    language: 'vi',
    defaultCRS: 'EPSG:4326',
    datasetVersion: null,
    schemaVersion: '0.4.0',
    endpoints: {},
    security: { defaultPermission: 'read' },
    runtime: {}
  };

  /* ------------------------- DOMAIN CORE ------------------------- */

  const SchemaCore = {
    version: '0.4.0',
    registry: new Registry('SchemaCore.registry'),
    namespaces: [
      'vf.feature','vf.place','vf.road','vf.track','vf.sensor','vf.device',
      'vf.event','vf.media','vf.raster','vf.terrain','vf.ai_result','vf.route'
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
        time: Object.assign({
          observed_at: x.observed_at || null,
          valid_from: null,
          valid_to: null,
          ingested_at: nowISO()
        }, x.time || {}),
        source: Object.assign({ provider: x.source || null, source_id: x.source_id || null }, x.source_meta || {}),
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
        inputSchema: definition.inputSchema || null,
        outputSchema: definition.outputSchema || null,
        provider: definition.provider || null,
        description_vi: definition.description_vi || null
      });
      return this;
    },
    unregister(id) { this.registry.unregister(id); return this; },
    list() { return this.registry.list(); },
    describe(id) { const x = this.registry.get(id); return x ? { id: x.id, meta: clone(x.meta) } : null; },
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
      this.handlers.get(type).add(fn); return () => this.off(type, fn);
    }
    off(type, fn) { const set = this.handlers.get(type); if (set) set.delete(fn); }
    emit(type, payload) {
      const set = this.handlers.get(type);
      if (set) set.forEach(fn => { try { fn(payload); } catch (_) {} });
    }
  }

  const EventCore = {
    bus: new EventBus(),
    create(input) {
      const x = input || {};
      return {
        event_id: x.event_id || uuid('evt'),
        type: x.type || 'vf.event',
        time: TemporalCore.normalizeTimestamp(x.time),
        end_time: x.end_time ? TemporalCore.normalizeTimestamp(x.end_time) : null,
        position: x.position || null,
        asset_id: x.asset_id || null,
        refs: Object.assign({}, x.refs || {}),
        payload: Object.assign({}, x.payload || {}),
        dataset_version: x.dataset_version || config.datasetVersion,
        provenance: Object.assign({}, x.provenance || {})
      };
    },
    publish(type, payload) { this.bus.emit(type, payload); return payload; },
    subscribe(type, fn) { return this.bus.on(type, fn); }
  };

  const DataCore = {
    sources: new Registry('DataCore.sources'),
    registerSource(id, adapter, meta) { this.sources.register(id, adapter, meta); return this; },
    unregisterSource(id) { this.sources.unregister(id); return this; },
    listSources() { return this.sources.list(); },
    categories: ['osm','dem','satellite','gps','camera','iot','tpms','obd','imu','lidar'],
    principles: ['source-of-truth','provenance','license-metadata','timestamped-ingest','qa','versioned-builds']
  };

  const SpatialCore = {
    operations: ['buffer','intersect','within','nearest','spatial-query','routing','geocoding','reverse-geocoding','map-matching','terrain'],
    async run(operation, payload, options) {
      const capabilityId = (options && options.capability) || 'spatial.' + operation;
      return CapabilityCore.execute(capabilityId, payload, options || {});
    }
  };

  const TemporalCore = {
    normalizeTimestamp(value) {
      if (value === undefined || value === null) return nowISO();
      if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value).toISOString();
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error('TemporalCore: timestamp không hợp lệ');
      return d.toISOString();
    },
    align(streams, toleranceMs) {
      const tolerance = Number.isFinite(toleranceMs) ? toleranceMs : 500;
      const rows = [];
      Object.keys(streams || {}).forEach(streamName => {
        (streams[streamName] || []).forEach(item => {
          const raw = item.time || item.timestamp || item.observed_at;
          rows.push({ stream: streamName, t: new Date(this.normalizeTimestamp(raw)).getTime(), item });
        });
      });
      rows.sort((a,b) => a.t - b.t);
      return rows.map((row, index) => ({
        index,
        time: new Date(row.t).toISOString(),
        stream: row.stream,
        item: row.item,
        tolerance_ms: tolerance
      }));
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

  /* ------------------------- ADAPTER LAYER ------------------------- */

  const AdapterLayer = {
    registry: new Registry('AdapterLayer.registry'),
    supportedKinds: ['postgis','gpkg','pmtiles','cog','object-storage','maplibre','valhalla','photon','mqtt','geoai','device'],
    register(id, adapter, meta) { this.registry.register(id, adapter, meta); return this; },
    unregister(id) { this.registry.unregister(id); return this; },
    get(id) { const x = this.registry.get(id); return x ? x.value : null; },
    list() { return this.registry.list(); }
  };

  /* ------------------------- PORT / GATEWAYS ------------------------- */

  const GatewayCore = {
    registry: new Registry('GatewayCore.registry'),
    ports: ['cdn','api','mcp','events'],
    register(id, gateway, meta) { this.registry.register(id, gateway, meta); return this; },
    unregister(id) { this.registry.unregister(id); return this; },
    get(id) { const x = this.registry.get(id); return x ? x.value : null; },
    list() { return this.registry.list(); }
  };

  /* ------------------------- SDK / PLUGINS ------------------------- */

  const PluginCore = {
    registry: new Registry('PluginCore.registry'),
    install(manifest, plugin) {
      if (!manifest || !manifest.id) throw new Error('PluginCore: manifest thiếu id');
      this.registry.register(manifest.id, plugin || {}, {
        version: manifest.version || '0.0.0',
        requires: manifest.requires || {},
        layers: manifest.layers || [],
        capabilities: manifest.capabilities || [],
        schemas: manifest.schemas || []
      });
      (manifest.capabilities || []).forEach(cap => {
        if (typeof cap === 'object' && cap.id && plugin && plugin.capabilities && plugin.capabilities[cap.id]) {
          CapabilityCore.register(cap, plugin.capabilities[cap.id]);
        }
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
      coordinateOrder: 'Vietflex JS convenience API có thể nhận [lat,lng]; persisted schema/API phải khai báo CRS/order rõ ràng',
      time: 'ISO-8601 UTC',
      language: 'vi'
    },
    capabilities() { return CapabilityCore.list(); },
    adapters() { return AdapterLayer.list(); },
    gateways() { return GatewayCore.list(); },
    plugins() { return PluginCore.list(); }
  };

  /* ------------------------- COMPATIBILITY FACADES ------------------------- */

  const StorageCompat = {
    register(id, adapter, meta) { AdapterLayer.register(id, adapter, Object.assign({ kind: id }, meta || {})); return this; },
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
    register(id, adapter, meta) { AdapterLayer.register(id, adapter, Object.assign({ domain: 'mobility-iot' }, meta || {})); return this; },
    list() { return AdapterLayer.list().filter(x => x.meta.domain === 'mobility-iot' || x.meta.kind === 'mqtt' || x.meta.kind === 'device'); },
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
    tasks: ['image-understanding','video-event-detection','geo-query-generation','feature-extraction','qa','anomaly-detection','sensor-fusion'],
    register(id, adapter, meta) { AdapterLayer.register(id, adapter, Object.assign({ kind: 'geoai' }, meta || {})); return this; },
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
        core: ['schema','capability','event','data','spatial','temporal','domain-services'],
        adapters: AdapterLayer.list(),
        gateways: GatewayCore.list(),
        plugins: PluginCore.list(),
        capabilities: CapabilityCore.list()
      };
    },
    Schema: SchemaCore,
    Capability: CapabilityCore,
    Event: EventCore,
    Domain: DomainServices,
    Data: DataCore,
    Spatial: SpatialCore,
    Temporal: TemporalCore,
    Adapters: AdapterLayer,
    Gateways: GatewayCore,
    SDK: SDKCore,
    Plugins: PluginCore,

    // Backward-compatible aliases from v0.3.x
    Storage: StorageCompat,
    TimeEvent: Object.assign({}, TemporalCore, { bus: EventCore.bus, createEvent: EventCore.create.bind(EventCore) }),
    MobilityIoT: MobilityIoTCompat,
    GeoAI: GeoAICompat,
    ServiceSDK: SDKCore
  };

  global.Vietflex = global.Vietflex || {};
  global.Vietflex.Platform = Platform;
  global.Vietflex.CoreTech = Platform;
})(typeof window !== 'undefined' ? window : globalThis);
