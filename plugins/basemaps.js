/* Vietflex OpenMap — Basemap Plugin v0.2.0
 * Basemaps stay outside Core Tech. UI calls this registry, registry applies renderer adapters.
 * Terrain uses a Vietflex-managed raster-dem namespace and never depends on OpenTopoMap.
 */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';
  const currentScriptSrc =
    typeof document !== 'undefined' && document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : '';

  let assetRoot = '';
  try {
    assetRoot = currentScriptSrc ? new URL('../', currentScriptSrc).href.replace(/\/$/, '') : '';
  } catch (_) {
    assetRoot = '';
  }

  const ROOT = assetRoot || '.';
  const TERRAIN_MANIFEST_URL = ROOT + '/terrain/manifest.json';

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
      kind: 'terrain-dem',
      baseStyle: 'https://tiles.openfreemap.org/styles/positron',
      manifest: TERRAIN_MANIFEST_URL,
      provider: 'Vietflex DEM',
      attribution: 'Vietflex DEM · nền tham chiếu © OpenStreetMap contributors / OpenMapTiles',
      core: false,
      capabilities: ['raster-dem', 'hillshade', 'terrain-3d', 'topographic', 'self-hosted'],
      fallback: 'simple'
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

  async function loadTerrainManifest(definition) {
    try {
      const response = await fetch(definition.manifest, { cache: 'no-store' });
      if (!response.ok) return null;
      const manifest = await response.json();
      if (!manifest || manifest.status !== 'ready' || manifest.data_ready !== true) return null;
      return manifest;
    } catch (_) {
      return null;
    }
  }

  function waitForStyle(rawMap) {
    if (rawMap.isStyleLoaded()) return Promise.resolve();
    return new Promise(function (resolveReady) {
      rawMap.once('style.load', resolveReady);
    });
  }

  function normalizeTileUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, ROOT + '/').href;
    } catch (_) {
      return url;
    }
  }

  async function applyTerrain(rawMap, definition) {
    rawMap.setStyle(definition.baseStyle || REGISTRY.simple.style);
    await waitForStyle(rawMap);

    const manifest = await loadTerrainManifest(definition);
    if (!manifest) {
      try {
        rawMap.getContainer().dataset.vietflexTerrain = 'awaiting-data';
      } catch (_) {}
      return Object.assign({}, definition, {
        status: 'awaiting-data',
        message: 'Vietflex DEM chưa được publish; đang hiển thị nền Simple an toàn.'
      });
    }

    const demTiles = (manifest.tiles || []).map(normalizeTileUrl).filter(Boolean);
    if (!demTiles.length && manifest.tile_template) {
      demTiles.push(normalizeTileUrl(manifest.tile_template));
    }
    if (!demTiles.length) {
      return Object.assign({}, definition, { status: 'invalid-manifest' });
    }

    const sourceId = 'vietflex-dem';
    const hillshadeId = 'vietflex-dem-hillshade';

    if (rawMap.getTerrain()) {
      try { rawMap.setTerrain(null); } catch (_) {}
    }
    if (rawMap.getLayer(hillshadeId)) rawMap.removeLayer(hillshadeId);
    if (rawMap.getSource(sourceId)) rawMap.removeSource(sourceId);

    rawMap.addSource(sourceId, {
      type: 'raster-dem',
      tiles: demTiles,
      tileSize: Number(manifest.tile_size) || 256,
      minzoom: Number.isFinite(manifest.minzoom) ? manifest.minzoom : 0,
      maxzoom: Number.isFinite(manifest.maxzoom) ? manifest.maxzoom : 14,
      encoding: manifest.encoding || 'mapbox',
      attribution: manifest.attribution || definition.attribution
    });

    rawMap.addLayer({
      id: hillshadeId,
      type: 'hillshade',
      source: sourceId,
      paint: {
        'hillshade-exaggeration': Number(manifest.hillshade_exaggeration) || 0.42,
        'hillshade-shadow-color': '#473b2f',
        'hillshade-highlight-color': '#fffdf7',
        'hillshade-accent-color': '#786b5c'
      }
    });

    rawMap.setTerrain({
      source: sourceId,
      exaggeration: Number(manifest.terrain_exaggeration) || 1.15
    });

    if (manifest.contours && manifest.contours.ready && manifest.contours.tiles) {
      const contourSource = 'vietflex-contours';
      const contourLayer = 'vietflex-contours-line';
      if (!rawMap.getSource(contourSource)) {
        rawMap.addSource(contourSource, {
          type: 'vector',
          tiles: manifest.contours.tiles.map(normalizeTileUrl),
          minzoom: manifest.contours.minzoom || 6,
          maxzoom: manifest.contours.maxzoom || 14
        });
      }
      if (!rawMap.getLayer(contourLayer)) {
        rawMap.addLayer({
          id: contourLayer,
          type: 'line',
          source: contourSource,
          'source-layer': manifest.contours.source_layer || 'contours',
          minzoom: manifest.contours.minzoom || 7,
          paint: {
            'line-color': '#8b7355',
            'line-opacity': 0.46,
            'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.35, 13, 0.9]
          }
        });
      }
    }

    try {
      rawMap.getContainer().dataset.vietflexTerrain = 'ready';
    } catch (_) {}

    return Object.assign({}, definition, {
      status: 'ready',
      datasetVersion: manifest.dataset_version || null,
      demSource: manifest.dem_source || null
    });
  }

  const state = { active: 'simple', lastResult: null };

  function apply(map, id) {
    const definition = resolve(id);
    state.active = definition.id;

    if (!map || typeof map.ready !== 'function') {
      return Promise.reject(new TypeError('VietflexBasemaps.apply cần Vietflex map instance.'));
    }

    return Promise.resolve(map.ready()).then(async function (rawMap) {
      let result;
      if (definition.kind === 'terrain-dem') {
        result = await applyTerrain(rawMap, definition);
      } else {
        try {
          if (rawMap.getTerrain && rawMap.getTerrain()) rawMap.setTerrain(null);
        } catch (_) {}
        rawMap.setStyle(styleFor(definition));
        result = Object.assign({}, definition, { status: 'ready' });
      }

      state.lastResult = result;
      try {
        rawMap.getContainer().dataset.vietflexBasemap = definition.id;
      } catch (_) {}

      try {
        rawMap.fire('vietflex:basemapchange', { basemap: result });
      } catch (_) {}

      return result;
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

  function status() {
    return state.lastResult ? Object.assign({}, state.lastResult) : null;
  }

  global.VietflexBasemaps = Object.freeze({
    version: VERSION,
    list: list,
    get: get,
    active: active,
    status: status,
    apply: apply,
    terrainManifestUrl: TERRAIN_MANIFEST_URL
  });
})(typeof window !== 'undefined' ? window : globalThis);
