/* Vietflex GIS Layer Platform v1.1.0
 * Extension for VIETFLEX CORE TECH. Keeps thematic layers outside the domain core.
 * Contract -> Registry + State + Catalog -> Adapter boundary -> Capability bridge.
 */
(function (global) {
  'use strict';

  const VERSION = '1.1.0';
  const CONTRACT = 'vietflex-layer/1.0';
  const CONTRACT_URL = './schema/vietflex-layer.schema.json';
  const DEFAULT_LAYER_CONFIG = './config/layers.json';
  const DEFAULT_CATALOG = './catalog/datasets.json';
  const VALID_TYPES = new Set(['vector', 'raster', 'live']);
  const VALID_CAPABILITIES = new Set(['render','toggle','identify','filter','legend','opacity','query','time','export']);
  const DEFAULT_STATE = Object.freeze({ visible: false, opacity: 1, filter: null, time: null, selected_feature: null });

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function assertLayer(def) {
    const errors = [];
    if (!def || typeof def !== 'object') return { valid: false, errors: ['layer phải là object'] };
    if (!/^vf\.[a-z0-9._-]+$/.test(String(def.id || ''))) errors.push('id phải bắt đầu bằng vf. và dùng ký tự an toàn');
    if (!def.name) errors.push('thiếu name');
    if (!def.group) errors.push('thiếu group');
    if (!VALID_TYPES.has(def.type)) errors.push('type phải là vector, raster hoặc live');
    if (!def.source || !def.source.adapter) errors.push('thiếu source.adapter');
    if (!Array.isArray(def.capabilities)) errors.push('capabilities phải là array');
    else def.capabilities.forEach(function (c) { if (!VALID_CAPABILITIES.has(c)) errors.push('capability không hỗ trợ: ' + c); });
    return { valid: errors.length === 0, errors: errors };
  }

  class LayerRegistry {
    constructor() { this.items = new Map(); }
    register(definition) {
      const checked = assertLayer(definition);
      if (!checked.valid) throw new Error('Layer Contract không hợp lệ: ' + checked.errors.join('; '));
      const normalized = Object.assign({ schema_version: '1.0.0', enabled: true }, clone(definition));
      this.items.set(normalized.id, normalized);
      if (!state.has(normalized.id)) state.init(normalized.id, normalized.state || {});
      emit('layer.registered', { layer: clone(normalized) });
      return clone(normalized);
    }
    unregister(id) {
      this.items.delete(id);
      state.remove(id);
      emit('layer.unregistered', { layer_id: id });
    }
    get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
    has(id) { return this.items.has(id); }
    list(filter) {
      const f = filter || {};
      return Array.from(this.items.values()).filter(function (item) {
        if (f.group && item.group !== f.group) return false;
        if (f.type && item.type !== f.type) return false;
        if (f.enabled !== undefined && Boolean(item.enabled) !== Boolean(f.enabled)) return false;
        return true;
      }).map(clone);
    }
    validate(definition) { return assertLayer(definition); }
  }

  class LayerState {
    constructor() { this.items = new Map(); }
    init(id, initial) { this.items.set(id, Object.assign({}, DEFAULT_STATE, clone(initial || {}))); return this.get(id); }
    has(id) { return this.items.has(id); }
    get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
    set(id, patch) {
      if (!this.items.has(id)) this.init(id, {});
      const next = Object.assign({}, this.items.get(id), clone(patch || {}));
      const opacity = Number(next.opacity);
      next.opacity = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
      this.items.set(id, next);
      emit('layer.state.changed', { layer_id: id, state: clone(next) });
      return clone(next);
    }
    remove(id) { this.items.delete(id); }
    snapshot() {
      const out = {};
      this.items.forEach(function (v, k) { out[k] = clone(v); });
      return out;
    }
    restore(snapshot) {
      const self = this;
      Object.keys(snapshot || {}).forEach(function (id) { self.set(id, snapshot[id]); });
      return this.snapshot();
    }
  }

  class AdapterRegistry {
    constructor() { this.items = new Map(); }
    register(kind, adapter, meta) {
      if (!kind || !adapter) throw new Error('Adapter cần kind và implementation');
      this.items.set(kind, { adapter: adapter, meta: Object.assign({}, meta || {}) });
      emit('layer.adapter.registered', { kind: kind, meta: clone(meta || {}) });
      return this;
    }
    unregister(kind) { this.items.delete(kind); return this; }
    get(kind) { return this.items.get(kind) || null; }
    list() { return Array.from(this.items.entries()).map(function (x) { return { kind: x[0], meta: clone(x[1].meta) }; }); }
    async execute(kind, operation, layer, payload, context) {
      const entry = this.get(kind);
      if (!entry) throw new Error('Chưa đăng ký Layer Adapter: ' + kind);
      const fn = entry.adapter && entry.adapter[operation];
      if (typeof fn !== 'function') throw new Error('Adapter ' + kind + ' không hỗ trợ ' + operation);
      return fn(layer, payload || {}, context || {});
    }
  }

  class DataCatalog {
    constructor() { this.items = new Map(); }
    register(dataset) {
      if (!dataset || !dataset.id) throw new Error('Dataset catalog thiếu id');
      const normalized = Object.assign({ crs: 'EPSG:4326', version: null, updated_at: null, license: null, provenance: {}, quality: {} }, clone(dataset));
      this.items.set(normalized.id, normalized);
      emit('dataset.registered', { dataset: clone(normalized) });
      return clone(normalized);
    }
    get(id) { return this.items.has(id) ? clone(this.items.get(id)) : null; }
    list() { return Array.from(this.items.values()).map(clone); }
  }

  const registry = new LayerRegistry();
  const state = new LayerState();
  const adapters = new AdapterRegistry();
  const catalog = new DataCatalog();
  const runtime = { bootstrapped: false, groups: [], errors: [] };

  function core() { return global.Vietflex && global.Vietflex.CoreTech ? global.Vietflex.CoreTech : null; }
  function emit(type, payload) {
    const c = core();
    if (c && c.Event && typeof c.Event.publish === 'function') c.Event.publish(type, payload);
  }

  function requireLayer(id) {
    const layer = registry.get(id);
    if (!layer) throw new Error('Không tìm thấy layer: ' + id);
    return layer;
  }

  function assertCapability(layer, operation) {
    if (layer.capabilities.indexOf(operation) === -1) throw new Error('Layer ' + layer.id + ' không khai báo capability ' + operation);
  }

  async function dispatch(operation, payload, context) {
    const p = payload || {};
    const layer = requireLayer(p.layer_id || p.id);
    assertCapability(layer, operation);

    if (operation === 'toggle') {
      const current = state.get(layer.id) || state.init(layer.id, {});
      return state.set(layer.id, { visible: p.visible !== undefined ? Boolean(p.visible) : !current.visible });
    }
    if (operation === 'opacity') return state.set(layer.id, { opacity: p.opacity });
    if (operation === 'filter') return state.set(layer.id, { filter: p.filter === undefined ? null : p.filter });
    if (operation === 'time') return state.set(layer.id, { time: p.time === undefined ? null : p.time });

    const result = await adapters.execute(layer.source.adapter, operation, layer, p, context || {});
    emit('layer.' + operation + '.completed', { layer_id: layer.id });
    return result;
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Không thể tải ' + url + ': HTTP ' + response.status);
    return response.json();
  }

  async function bootstrap(options) {
    const opts = options || {};
    const configUrl = opts.layers || DEFAULT_LAYER_CONFIG;
    const catalogUrl = opts.catalog || DEFAULT_CATALOG;
    runtime.errors = [];
    try {
      const results = await Promise.all([fetchJSON(configUrl), fetchJSON(catalogUrl)]);
      const layerConfig = results[0] || {};
      const dataCatalog = results[1] || {};
      runtime.groups = clone(layerConfig.groups || []);
      (dataCatalog.datasets || []).forEach(function (d) { catalog.register(d); });
      (layerConfig.layers || []).forEach(function (l) { registry.register(l); });
      runtime.bootstrapped = true;
      emit('layer.platform.ready', { version: VERSION, layers: registry.list().length, datasets: catalog.list().length });
      return API.manifest();
    } catch (error) {
      runtime.errors.push(String(error && error.message ? error.message : error));
      emit('layer.platform.error', { error: runtime.errors[0] });
      throw error;
    }
  }

  const API = {
    version: VERSION,
    contract: CONTRACT,
    contractUrl: CONTRACT_URL,
    validate: assertLayer,
    Registry: registry,
    State: state,
    Adapters: adapters,
    Catalog: catalog,
    runtime: runtime,
    register: function (layer) { return registry.register(layer); },
    unregister: function (id) { return registry.unregister(id); },
    get: function (id) { return registry.get(id); },
    list: function (filter) { return registry.list(filter); },
    groups: function () { return clone(runtime.groups); },
    registerAdapter: function (kind, adapter, meta) { adapters.register(kind, adapter, meta); return API; },
    registerDataset: function (dataset) { return catalog.register(dataset); },
    execute: dispatch,
    bootstrap: bootstrap,
    manifest: function () {
      return {
        name: 'Vietflex GIS Layer Platform', version: VERSION, contract: CONTRACT,
        bootstrapped: runtime.bootstrapped, groups: clone(runtime.groups), errors: clone(runtime.errors),
        layers: registry.list(), adapters: adapters.list(), datasets: catalog.list(), state: state.snapshot()
      };
    }
  };

  function installIntoCore() {
    const c = core();
    if (!c) return false;
    if (!c.Layers) c.Layers = API;

    if (c.Schema && typeof c.Schema.register === 'function' && !c.Schema.registry.has('vf.layer.contract')) {
      c.Schema.register('vf.layer.contract', { $ref: CONTRACT_URL, id: CONTRACT, version: '1.0.0' }, {
        kind: 'layer-contract', stable: true, extension: 'vf.gis.layers'
      });
    }

    const capabilityDefs = [
      ['render','read'], ['toggle','read'], ['identify','read'], ['filter','read'], ['legend','read'],
      ['opacity','read'], ['query','read'], ['time','read'], ['export','read']
    ];
    capabilityDefs.forEach(function (item) {
      const id = 'layer.' + item[0];
      if (c.Capability && !c.Capability.describe(id)) {
        c.Capability.register({ id: id, version: '1.0.0', category: 'layer', permission: item[1], description_vi: 'Vietflex Layer capability: ' + item[0] },
          function (payload, context) { return dispatch(item[0], payload, context); });
      }
    });

    if (c.Plugins && typeof c.Plugins.install === 'function') {
      const exists = c.Plugins.list().some(function (x) { return x.id === 'vf.gis.layers'; });
      if (!exists) c.Plugins.install({
        id: 'vf.gis.layers', version: VERSION,
        requires: { core: '>=0.4.0' },
        schemas: [CONTRACT],
        capabilities: capabilityDefs.map(function (x) { return 'layer.' + x[0]; }),
        layers: []
      }, API);
    }
    return true;
  }

  API.installIntoCore = installIntoCore;
  global.VietflexLayers = API;
  installIntoCore();

  if (typeof document !== 'undefined') {
    Promise.resolve().then(function () { return bootstrap(); }).catch(function () {});
  }
})(typeof window !== 'undefined' ? window : globalThis);
