/* Vietflex GIS Layer Adapter Contracts v1.0.0
 * Browser-safe adapter boundary. Concrete providers can replace these implementations.
 */
(function (global) {
  'use strict';

  function requireLayers() {
    if (!global.VietflexLayers) throw new Error('VietflexLayers chưa được nạp');
    return global.VietflexLayers;
  }

  function requireRawMap(context) {
    if (context && context.rawMap) return context.rawMap;
    if (context && context.map && typeof context.map.getStyle === 'function') return context.map;
    throw new Error('Layer adapter cần context.rawMap (MapLibre map instance)');
  }

  function sourceId(layer) { return 'vf-source-' + layer.id.replace(/[^a-zA-Z0-9_-]/g, '-'); }
  function renderLayerId(layer) { return 'vf-layer-' + layer.id.replace(/[^a-zA-Z0-9_-]/g, '-'); }

  const geojson = {
    render: async function (layer, payload, context) {
      const map = requireRawMap(context);
      const sid = sourceId(layer);
      const lid = renderLayerId(layer);
      if (!map.getSource(sid)) {
        const data = payload.data || layer.source.uri;
        if (!data) throw new Error(layer.id + ': GeoJSON source chưa có data/uri');
        map.addSource(sid, { type: 'geojson', data: data });
      }
      if (!map.getLayer(lid)) {
        const spec = Object.assign({ id: lid, source: sid, type: 'line', paint: { 'line-width': 1.5 } }, layer.render && layer.render.layer ? layer.render.layer : {});
        spec.id = lid;
        spec.source = sid;
        map.addLayer(spec);
      }
      return { source_id: sid, layer_id: lid };
    },
    identify: async function (layer, payload, context) {
      const map = requireRawMap(context);
      const lid = renderLayerId(layer);
      const point = payload.point || payload.screen_point;
      if (!point) throw new Error('identify cần point/screen_point');
      return map.queryRenderedFeatures(point, { layers: [lid] });
    },
    query: async function () { throw new Error('GeoJSON query nâng cao nên đi qua Spatial/Query capability'); },
    legend: async function (layer) { return layer.legend || null; },
    export: async function (layer) { return { layer_id: layer.id, source: layer.source.uri || null }; }
  };

  const xyz = {
    render: async function (layer, payload, context) {
      const map = requireRawMap(context);
      const sid = sourceId(layer);
      const lid = renderLayerId(layer);
      const tiles = payload.tiles || layer.source.tiles || (layer.source.uri ? [layer.source.uri] : null);
      if (!tiles) throw new Error(layer.id + ': XYZ source chưa có tiles');
      if (!map.getSource(sid)) map.addSource(sid, { type: 'raster', tiles: tiles, tileSize: layer.source.tileSize || 256, attribution: layer.metadata && layer.metadata.attribution || '' });
      if (!map.getLayer(lid)) map.addLayer({ id: lid, type: 'raster', source: sid, paint: { 'raster-opacity': 1 } });
      return { source_id: sid, layer_id: lid };
    },
    legend: async function (layer) { return layer.legend || null; },
    identify: async function () { return []; },
    export: async function (layer) { return { layer_id: layer.id, source: layer.source.uri || null }; }
  };

  function remoteQueryAdapter(kind) {
    return {
      query: async function (layer, payload) {
        const endpoint = layer.source.endpoint || layer.source.uri;
        if (!endpoint) throw new Error(layer.id + ': ' + kind + ' adapter cần endpoint');
        const response = await fetch(endpoint, {
          method: payload.method || 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, payload.headers || {}),
          body: (payload.method || 'POST').toUpperCase() === 'GET' ? undefined : JSON.stringify(payload.body || payload.query || {})
        });
        if (!response.ok) throw new Error(kind + ' query HTTP ' + response.status);
        return response.json();
      },
      identify: async function (layer, payload) { return this.query(layer, payload); },
      export: async function (layer, payload) { return this.query(layer, Object.assign({}, payload, { body: Object.assign({}, payload.body || {}, { operation: 'export' }) })); },
      legend: async function (layer) { return layer.legend || null; }
    };
  }

  const pmtilesContract = {
    render: async function () { throw new Error('PMTiles adapter contract đã đăng ký; cần renderer implementation/protocol của host.'); },
    identify: async function () { throw new Error('PMTiles identify cần MapLibre renderer adapter.'); },
    query: async function () { throw new Error('PMTiles query nâng cao nên dùng API/PostGIS capability.'); },
    legend: async function (layer) { return layer.legend || null; },
    export: async function (layer) { return { layer_id: layer.id, source: layer.source.uri || null }; }
  };

  const cogContract = {
    render: async function () { throw new Error('COG adapter contract đã đăng ký; cần tile/COG renderer service của host.'); },
    identify: async function () { throw new Error('COG identify cần raster sampling service.'); },
    query: async function () { throw new Error('COG query cần raster analytics capability.'); },
    legend: async function (layer) { return layer.legend || null; },
    export: async function (layer) { return { layer_id: layer.id, source: layer.source.uri || null }; }
  };

  function install() {
    const layers = requireLayers();
    layers.registerAdapter('geojson', geojson, { class: 'vector', status: 'active', runtime: 'browser' });
    layers.registerAdapter('xyz', xyz, { class: 'raster', status: 'active', runtime: 'browser' });
    layers.registerAdapter('api', remoteQueryAdapter('api'), { class: 'live', status: 'active', runtime: 'browser-gateway' });
    layers.registerAdapter('postgis', remoteQueryAdapter('postgis'), { class: 'live', status: 'gateway-only', direct_browser_access: false });
    layers.registerAdapter('pmtiles', pmtilesContract, { class: 'vector', status: 'contract-ready', requires: 'pmtiles-renderer-adapter' });
    layers.registerAdapter('mvt', pmtilesContract, { class: 'vector', status: 'contract-ready', requires: 'vector-tile-renderer-adapter' });
    layers.registerAdapter('cog', cogContract, { class: 'raster', status: 'contract-ready', requires: 'cog-renderer-adapter' });
    layers.registerAdapter('wms', xyz, { class: 'raster', status: 'contract-ready' });
    layers.registerAdapter('wmts', xyz, { class: 'raster', status: 'contract-ready' });
    return layers.Adapters.list();
  }

  global.VietflexLayerAdapters = Object.freeze({ version: '1.0.0', install: install });
  if (global.VietflexLayers) install();
})(typeof window !== 'undefined' ? window : globalThis);
