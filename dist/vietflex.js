/*
 * Vietflex OpenMap CDN
 * Vietnamese-first compatibility layer powered by MapLibre GL JS.
 * No Google Maps dependency.
 *
 * Vietflex API uses [lat, lng]. MapLibre internally uses [lng, lat].
 */
(function (global) {
  'use strict';

  const VERSION = '0.2.0';
  const MAPLIBRE_VERSION = '6.9.0';
  const MAPLIBRE_MODULE_URL =
    'https://cdn.jsdelivr.net/npm/maplibre-gl@' + MAPLIBRE_VERSION + '/dist/maplibre-gl.mjs';

  const BASEMAPS = Object.freeze({
    streets: {
      id: 'streets',
      name: 'Đường phố',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    },
    light: {
      id: 'light',
      name: 'Nền sáng',
      style: 'https://tiles.openfreemap.org/styles/positron',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    },
    bright: {
      id: 'bright',
      name: 'Sáng rõ',
      style: 'https://tiles.openfreemap.org/styles/bright',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    },
    dark: {
      id: 'dark',
      name: 'Nền tối',
      style: 'https://tiles.openfreemap.org/styles/dark',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    },
    fiord: {
      id: 'fiord',
      name: 'Địa hình tối',
      style: 'https://tiles.openfreemap.org/styles/fiord',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    },
    '3d': {
      id: '3d',
      name: 'Bản đồ 3D',
      style: 'https://tiles.openfreemap.org/styles/3d',
      provider: 'OpenFreeMap',
      data: 'OpenStreetMap / OpenMapTiles',
      openSource: true
    }
  });

  const DEFAULT_BASEMAP = 'streets';
  const DEFAULT_STYLE = BASEMAPS[DEFAULT_BASEMAP].style;

  const VI_NAME_EXPRESSION = [
    'coalesce',
    ['get', 'name:vi'],
    ['get', 'name_vi'],
    ['get', 'name'],
    ['get', 'name:latin'],
    ['get', 'name_en'],
    ['get', 'name:en']
  ];

  const NAME_KEYS = new Set([
    'name', 'name:vi', 'name_vi', 'name:latin', 'name:nonlatin',
    'name_en', 'name:en'
  ]);

  const currentScriptSrc =
    typeof document !== 'undefined' && document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : '';

  let assetBaseUrl = '';
  try {
    assetBaseUrl = currentScriptSrc ? new URL('../', currentScriptSrc).href.replace(/\/$/, '') : '';
  } catch (_) {
    assetBaseUrl = '';
  }

  const DEFAULT_VIETNAM_LABELS_URL = assetBaseUrl
    ? assetBaseUrl + '/data/vietnam-reference-labels.geojson'
    : './data/vietnam-reference-labels.geojson';

  let maplibrePromise = null;

  function loadMapLibre() {
    if (!maplibrePromise) {
      maplibrePromise = import(MAPLIBRE_MODULE_URL).catch(function (error) {
        maplibrePromise = null;
        throw new Error('Vietflex: không thể tải MapLibre GL JS. ' + error.message);
      });
    }
    return maplibrePromise;
  }

  function toLngLat(input) {
    if (Array.isArray(input) && input.length >= 2) {
      return [Number(input[1]), Number(input[0])];
    }

    if (input && typeof input === 'object') {
      if ('lat' in input && ('lng' in input || 'lon' in input)) {
        return [Number(input.lng !== undefined ? input.lng : input.lon), Number(input.lat)];
      }
    }

    throw new TypeError('Vietflex: tọa độ phải là [lat, lng] hoặc {lat, lng}.');
  }

  function toMapLibrePosition(position) {
    const positions = {
      topleft: 'top-left',
      topright: 'top-right',
      bottomleft: 'bottom-left',
      bottomright: 'bottom-right',
      'top-left': 'top-left',
      'top-right': 'top-right',
      'bottom-left': 'bottom-left',
      'bottom-right': 'bottom-right'
    };
    return positions[position] || 'top-right';
  }

  function normalizeCenter(center) {
    if (!center) return [106.0, 16.0];
    return toLngLat(center);
  }

  function cloneExpression(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function localizeTextExpression(value) {
    if (Array.isArray(value)) {
      if (value[0] === 'get' && NAME_KEYS.has(value[1])) {
        return cloneExpression(VI_NAME_EXPRESSION);
      }
      return value.map(localizeTextExpression);
    }

    if (typeof value === 'string') {
      const token = value.trim();
      if (/^\{name(?::(?:vi|en|latin|nonlatin))?\}$/.test(token) || token === '{name_vi}' || token === '{name_en}') {
        return cloneExpression(VI_NAME_EXPRESSION);
      }
    }

    return value;
  }

  function resolveBasemap(name) {
    const key = String(name || DEFAULT_BASEMAP).toLowerCase();
    return BASEMAPS[key] || BASEMAPS[DEFAULT_BASEMAP];
  }

  function resolveInitialStyle(options) {
    if (options.style) return options.style;
    if (options.mapStyle) return options.mapStyle;
    if (options.defaultStyle) return options.defaultStyle;
    return resolveBasemap(options.basemap).style;
  }

  class VietflexMap {
    constructor(container, options) {
      this._container = container;
      this._options = Object.assign({
        basemap: DEFAULT_BASEMAP,
        language: 'vi',
        vietnamReferenceLabels: true
      }, options || {});
      this._map = null;
      this._maplibregl = null;
      this._pending = [];
      this._errorHandlers = [];
      this._styleEnhanceScheduled = false;

      this._readyPromise = loadMapLibre()
        .then((maplibregl) => {
          this._maplibregl = maplibregl;

          const opts = Object.assign({}, this._options);
          delete opts.zoomControl;
          delete opts.mapStyle;
          delete opts.defaultStyle;
          delete opts.basemap;
          delete opts.language;
          delete opts.vietnamReferenceLabels;
          delete opts.vietnamLabelsUrl;

          opts.container = container;
          opts.style = resolveInitialStyle(this._options);
          opts.center = normalizeCenter(this._options.center);
          opts.zoom = Number.isFinite(this._options.zoom) ? this._options.zoom : 5;

          if (this._options.attributionControl === false) {
            opts.attributionControl = false;
          }

          delete opts.useLegacyGoogleTiles;
          delete opts.googleMapType;

          this._map = new maplibregl.Map(opts);

          this._map.on('style.load', () => {
            this._enhanceStyle();
          });

          if (this._options.zoomControl !== false) {
            this._map.addControl(
              new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
              'top-left'
            );
          }

          const jobs = this._pending.splice(0);
          jobs.forEach((job) => job(this._map, maplibregl));
          return this._map;
        })
        .catch((error) => {
          this._errorHandlers.forEach((handler) => {
            try { handler(error); } catch (_) {}
          });
          throw error;
        });
    }

    _enhanceStyle() {
      if (!this._map || this._styleEnhanceScheduled) return;
      this._styleEnhanceScheduled = true;

      Promise.resolve().then(() => {
        this._styleEnhanceScheduled = false;
        if (!this._map || !this._map.getStyle()) return;

        if (String(this._options.language).toLowerCase() === 'vi') {
          this._applyVietnameseLabels();
        }

        if (this._options.vietnamReferenceLabels !== false) {
          this._addVietnamReferenceLabels();
        }
      });
    }

    _applyVietnameseLabels() {
      const style = this._map.getStyle();
      const layers = style && Array.isArray(style.layers) ? style.layers : [];

      layers.forEach((layer) => {
        if (layer.type !== 'symbol' || !layer.layout || layer.layout['text-field'] === undefined) return;

        try {
          const localized = localizeTextExpression(layer.layout['text-field']);
          this._map.setLayoutProperty(layer.id, 'text-field', localized);
        } catch (_) {
          // Một số style bên thứ ba có biểu thức riêng. Không làm hỏng bản đồ nếu không thể thay.
        }
      });
    }

    _addVietnamReferenceLabels() {
      const sourceId = 'vietflex-vietnam-reference-labels';
      const seaLayerId = 'vietflex-bien-dong-label';
      const islandLayerId = 'vietflex-hoang-sa-truong-sa-label';

      if (!this._map.getSource(sourceId)) {
        this._map.addSource(sourceId, {
          type: 'geojson',
          data: this._options.vietnamLabelsUrl || DEFAULT_VIETNAM_LABELS_URL,
          attribution: 'Nhãn tham chiếu tiếng Việt: Vietflex OpenMap'
        });
      }

      if (!this._map.getLayer(seaLayerId)) {
        this._map.addLayer({
          id: seaLayerId,
          type: 'symbol',
          source: sourceId,
          minzoom: 3,
          maxzoom: 11,
          filter: ['==', ['get', 'kind'], 'sea'],
          layout: {
            'text-field': ['get', 'display_vi'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 3, 14, 6, 20, 9, 26],
            'text-letter-spacing': 0.08,
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#2c6796',
            'text-halo-color': 'rgba(255,255,255,0.88)',
            'text-halo-width': 1.5
          }
        });
      }

      if (!this._map.getLayer(islandLayerId)) {
        this._map.addLayer({
          id: islandLayerId,
          type: 'symbol',
          source: sourceId,
          minzoom: 4,
          maxzoom: 13,
          filter: ['==', ['get', 'kind'], 'archipelago'],
          layout: {
            'text-field': ['get', 'display_vi'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 7, 16, 11, 20],
            'text-max-width': 16,
            'text-line-height': 1.15,
            'text-allow-overlap': false
          },
          paint: {
            'text-color': '#174a72',
            'text-halo-color': 'rgba(255,255,255,0.94)',
            'text-halo-width': 1.6
          }
        });
      }
    }

    _whenStyleReady(callback) {
      return this._whenReady((map, maplibregl) => {
        if (map.isStyleLoaded()) {
          callback(map, maplibregl);
        } else {
          map.once('style.load', () => callback(map, maplibregl));
        }
      });
    }

    ready(callback) {
      if (typeof callback === 'function') {
        this._readyPromise.then((map) => callback(map));
        return this;
      }
      return this._readyPromise;
    }

    getMapLibre() {
      return this._readyPromise;
    }

    getBasemap() {
      return this._options.basemap || null;
    }

    setBasemap(name) {
      const basemap = resolveBasemap(name);
      this._options.basemap = basemap.id;
      return this._whenReady((map) => map.setStyle(basemap.style));
    }

    setLanguage(language) {
      this._options.language = language || 'vi';
      return this._whenStyleReady(() => this._enhanceStyle());
    }

    _whenReady(callback) {
      if (this._map && this._maplibregl) {
        callback(this._map, this._maplibregl);
      } else {
        this._pending.push(callback);
      }
      return this;
    }

    on(type, listener) {
      if (type === 'error:load' || type === 'vietflex:error') {
        this._errorHandlers.push(listener);
        return this;
      }
      return this._whenReady((map) => map.on(type, listener));
    }

    once(type, listener) {
      return this._whenReady((map) => map.once(type, listener));
    }

    off(type, listener) {
      return this._whenReady((map) => map.off(type, listener));
    }

    addControl(control, position) {
      return this._whenReady((map) => map.addControl(control, toMapLibrePosition(position)));
    }

    addSource(id, source) {
      return this._whenStyleReady((map) => {
        if (!map.getSource(id)) map.addSource(id, source);
      });
    }

    addLayer(layer, beforeId) {
      return this._whenStyleReady((map) => {
        if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId);
      });
    }

    flyTo(options) {
      return this._whenReady((map) => {
        const opts = Object.assign({}, options || {});
        if (opts.center) opts.center = normalizeCenter(opts.center);
        map.flyTo(opts);
      });
    }

    jumpTo(options) {
      return this._whenReady((map) => {
        const opts = Object.assign({}, options || {});
        if (opts.center) opts.center = normalizeCenter(opts.center);
        map.jumpTo(opts);
      });
    }

    setCenter(center) {
      return this._whenReady((map) => map.setCenter(toLngLat(center)));
    }

    setZoom(zoom) {
      return this._whenReady((map) => map.setZoom(zoom));
    }

    fitBounds(bounds, options) {
      return this._whenReady((map) => {
        if (!Array.isArray(bounds) || bounds.length < 2) {
          throw new TypeError('Vietflex: bounds phải là [[lat,lng], [lat,lng]].');
        }
        map.fitBounds([toLngLat(bounds[0]), toLngLat(bounds[1])], options || {});
      });
    }

    resize() {
      return this._whenReady((map) => map.resize());
    }

    remove() {
      return this._whenReady((map) => map.remove());
    }
  }

  class Marker {
    constructor(latlng, options) {
      this._latlng = latlng;
      this._options = Object.assign({}, options || {});
      this._popupHTML = null;
      this._popupOptions = {};
      this._marker = null;
    }

    bindPopup(html, options) {
      this._popupHTML = String(html);
      this._popupOptions = Object.assign({}, options || {});
      return this;
    }

    addTo(map) {
      if (!(map instanceof VietflexMap)) {
        throw new TypeError('Vietflex.Marker.addTo cần một Vietflex map instance.');
      }

      map._whenReady((rawMap, maplibregl) => {
        const marker = new maplibregl.Marker(Object.assign({}, this._options))
          .setLngLat(toLngLat(this._latlng));

        if (this._popupHTML !== null) {
          marker.setPopup(new maplibregl.Popup(this._popupOptions).setHTML(this._popupHTML));
        }

        marker.addTo(rawMap);
        this._marker = marker;
      });

      return this;
    }

    setLatLng(latlng) {
      this._latlng = latlng;
      if (this._marker) this._marker.setLngLat(toLngLat(latlng));
      return this;
    }

    remove() {
      if (this._marker) this._marker.remove();
      return this;
    }
  }

  class ZoomControl {
    constructor(options) {
      this.options = Object.assign({ position: 'topleft' }, options || {});
      this._control = null;
    }

    addTo(map) {
      map._whenReady((rawMap, maplibregl) => {
        this._control = new maplibregl.NavigationControl({
          showZoom: this.options.showZoom !== false,
          showCompass: this.options.showCompass === true,
          visualizePitch: this.options.visualizePitch === true
        });
        rawMap.addControl(this._control, toMapLibrePosition(this.options.position));
      });
      return this;
    }
  }

  class AttributionControl {
    constructor(options) {
      this.options = Object.assign({ position: 'bottomright' }, options || {});
      this._control = null;
    }

    addTo(map) {
      map._whenReady((rawMap, maplibregl) => {
        this._control = new maplibregl.AttributionControl({
          compact: this.options.compact !== false,
          customAttribution: this.options.customAttribution || this.options.prefix || 'Vietflex OpenMap'
        });
        rawMap.addControl(this._control, toMapLibrePosition(this.options.position));
      });
      return this;
    }
  }

  class ScaleControl {
    constructor(options) {
      this.options = Object.assign({ position: 'bottomleft' }, options || {});
      this._control = null;
    }

    addTo(map) {
      map._whenReady((rawMap, maplibregl) => {
        this._control = new maplibregl.ScaleControl({
          maxWidth: this.options.maxWidth || 100,
          unit: this.options.unit || 'metric'
        });
        rawMap.addControl(this._control, toMapLibrePosition(this.options.position));
      });
      return this;
    }
  }

  class GeolocateControl {
    constructor(options) {
      this.options = Object.assign({ position: 'topright' }, options || {});
      this._control = null;
    }

    addTo(map) {
      map._whenReady((rawMap, maplibregl) => {
        const opts = Object.assign({}, this.options);
        const position = opts.position;
        delete opts.position;
        this._control = new maplibregl.GeolocateControl(opts);
        rawMap.addControl(this._control, toMapLibrePosition(position));
      });
      return this;
    }
  }

  class BasemapControl {
    constructor(options) {
      this.options = Object.assign({
        position: 'topright',
        basemaps: ['streets', 'light', 'bright', 'dark', 'fiord', '3d']
      }, options || {});
      this._control = null;
    }

    addTo(map) {
      const wrapper = map;
      map._whenReady((rawMap) => {
        const ids = this.options.basemaps.filter((id) => BASEMAPS[id]);

        this._control = {
          onAdd: function () {
            const container = document.createElement('div');
            container.className = 'maplibregl-ctrl vietflex-basemap-control';

            const select = document.createElement('select');
            select.className = 'vietflex-basemap-select';
            select.setAttribute('aria-label', 'Chọn lớp nền bản đồ');
            select.title = 'Chọn lớp nền bản đồ';

            ids.forEach((id) => {
              const option = document.createElement('option');
              option.value = id;
              option.textContent = BASEMAPS[id].name;
              option.selected = id === wrapper.getBasemap();
              select.appendChild(option);
            });

            select.addEventListener('change', () => wrapper.setBasemap(select.value));
            container.appendChild(select);
            return container;
          },
          onRemove: function () {}
        };

        rawMap.addControl(this._control, toMapLibrePosition(this.options.position));
      });
      return this;
    }
  }

  const Vietflex = {
    version: VERSION,
    mapLibreVersion: MAPLIBRE_VERSION,
    defaultBasemap: DEFAULT_BASEMAP,
    defaultStyle: DEFAULT_STYLE,
    basemaps: BASEMAPS,
    vietnameseNameExpression: cloneExpression(VI_NAME_EXPRESSION),
    vietnamLabelsUrl: DEFAULT_VIETNAM_LABELS_URL,
    vietflexMap: function (container, options) {
      return new VietflexMap(container, options);
    },
    getBasemaps: function () {
      return Object.keys(BASEMAPS).map((key) => Object.assign({}, BASEMAPS[key]));
    },
    Map: VietflexMap,
    Marker: Marker,
    ZoomControl: ZoomControl,
    AttributionControl: AttributionControl,
    ScaleControl: ScaleControl,
    GeolocateControl: GeolocateControl,
    BasemapControl: BasemapControl,
    toLngLat: toLngLat,
    loadMapLibre: loadMapLibre
  };

  global.Vietflex = Vietflex;
})(typeof window !== 'undefined' ? window : globalThis);
