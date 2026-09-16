/* Vietflex OpenMap — Basemap Plugin v0.1.0
 * Basemaps stay outside Core Tech. UI calls this registry, registry applies a renderer adapter.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';

  const REGISTRY = Object.freeze({
    simple: {
      id: 'simple',
      name: 'Vietflex Simple',
      kind: 'vector-style',
      style: 'https://tiles.openfreemap.org/styles/positron',
      provider: 'OpenFreeMap',
      attribution: 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',
      core: false,
      capabilities: ['vector', 'labels', 'lightweight']
    },
    dark: {
      id: 'dark',
      name: 'Vietflex Dark',
      kind: 'vector-style',
      style: 'https://tiles.openfreemap.org/styles/dark',
      provider: 'OpenFreeMap',
      attribution: 'OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors',
      core: false,
      capabilities: ['vector', 'labels', 'dark']
    },
    terrain: {
      id: 'terrain',
      name: 'Vietflex Terrain / Topo',
      kind: 'raster-xyz',
      tiles: [
        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
        'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'
      ],
      tileSize: 256,
      maxzoom: 17,
      provider: 'OpenTopoMap',
      attribution: 'Map data © OpenStreetMap contributors, SRTM · Map style © OpenTopoMap (CC-BY-SA)',
      core: false,
      capabilities: ['raster', 'topographic', 'terrain-reference']
    },
    satellite: {
      id: 'satellite',
      name: 'Vietflex Satellite',
      kind: 'raster-xyz',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      provider: 'Esri World Imagery',
      attribution: 'Sources: Esri and World Imagery data providers',
      core: false,
      capabilities: ['raster', 'satellite', 'imagery']
    }
  });

  const ALIASES = Object.freeze({
    light: 'simple',
    positron: 'simple',
    fiord: 'terrain'
  });

  function resolve(id) {
    const key = String(id || 'simple').toLowerCase();
    return REGISTRY[ALIASES[key] || key] || REGISTRY.simple;
  }

  function rasterStyle(definition) {
    return {
      version: 8,
      name: definition.name,
      sources: {
        'vietflex-basemap-raster': {
          type: 'raster',
          tiles: definition.tiles,
          tileSize: definition.tileSize || 256,
          maxzoom: definition.maxzoom || 19,
          attribution: definition.attribution || ''
        }
      },
      layers: [
        {
          id: 'vietflex-basemap-raster',
          type: 'raster',
          source: 'vietflex-basemap-raster',
          minzoom: 0,
          maxzoom: 24
        }
      ]
    };
  }

  function styleFor(definition) {
    return definition.kind === 'raster-xyz' ? rasterStyle(definition) : definition.style;
  }

  const state = { active: 'simple' };

  function apply(map, id) {
    const definition = resolve(id);
    state.active = definition.id;

    if (!map || typeof map.ready !== 'function') {
      return Promise.reject(new TypeError('VietflexBasemaps.apply cần Vietflex map instance.'));
    }

    return Promise.resolve(map.ready()).then(function (rawMap) {
      rawMap.setStyle(styleFor(definition));
      try {
        rawMap.getContainer().dataset.vietflexBasemap = definition.id;
      } catch (_) {}
      return definition;
    });
  }

  function list() {
    return Object.keys(REGISTRY).map(function (id) {
      return Object.assign({}, REGISTRY[id]);
    });
  }

  function get(id) {
    return Object.assign({}, resolve(id));
  }

  function active() {
    return get(state.active);
  }

  global.VietflexBasemaps = Object.freeze({
    version: VERSION,
    list: list,
    get: get,
    active: active,
    apply: apply
  });
})(typeof window !== 'undefined' ? window : globalThis);
