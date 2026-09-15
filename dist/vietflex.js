/*
 * Vietflex OpenMap CDN
 * Lightweight compatibility layer powered by MapLibre GL JS.
 * No Google Maps dependency.
 *
 * API goal: keep simple Leaflet-like calls used by existing Vietflex apps:
 *   Vietflex.vietflexMap(), Vietflex.Marker(), Vietflex.ZoomControl(),
 *   Vietflex.AttributionControl().
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';
  const MAPLIBRE_VERSION = '6.9.0';
  const MAPLIBRE_MODULE_URL =
    'https://cdn.jsdelivr.net/npm/maplibre-gl@' + MAPLIBRE_VERSION + '/dist/maplibre-gl.mjs';
  const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json';

  let maplibrePromise = null;

  function loadMapLibre() {
    if (!maplibrePromise) {
      maplibrePromise = import(MAPLIBRE_MODULE_URL).catch(function (error) {
        maplibrePromise = null;
        throw new Error('Vietflex: cannot load MapLibre GL JS. ' + error.message);
      });
    }
    return maplibrePromise;
  }

  function toLngLat(input) {
    if (Array.isArray(input) && input.length >= 2) {
      // Vietflex/Leaflet-compatible input: [lat, lng]
      return [Number(input[1]), Number(input[0])];
    }

    if (input && typeof input === 'object') {
      if ('lat' in input && ('lng' in input || 'lon' in input)) {
        return [Number(input.lng !== undefined ? input.lng : input.lon), Number(input.lat)];
      }
    }

    throw new TypeError('Vietflex: coordinate must be [lat, lng] or {lat, lng}.');
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

  class VietflexMap {
    constructor(container, options) {
      this._container = container;
      this._options = Object.assign({}, options || {});
      this._map = null;
      this._maplibregl = null;
      this._pending = [];
      this._errorHandlers = [];

      this._readyPromise = loadMapLibre()
        .then((maplibregl) => {
          this._maplibregl = maplibregl;

          const opts = Object.assign({}, this._options);
          delete opts.zoomControl;
          delete opts.mapStyle;
          delete opts.defaultStyle;

          // Leaflet/Vietflex input uses [lat, lng]; MapLibre uses [lng, lat].
          opts.container = container;
          opts.style = this._options.style || this._options.mapStyle || this._options.defaultStyle || DEFAULT_STYLE;
          opts.center = normalizeCenter(this._options.center);
          opts.zoom = Number.isFinite(this._options.zoom) ? this._options.zoom : 5;

          if (this._options.attributionControl === false) {
            opts.attributionControl = false;
          }

          // Legacy Google-related flags are intentionally ignored.
          delete opts.useLegacyGoogleTiles;
          delete opts.googleMapType;

          this._map = new maplibregl.Map(opts);

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
      return this._whenReady((map) => {
        if (!map.getSource(id)) map.addSource(id, source);
      });
    }

    addLayer(layer, beforeId) {
      return this._whenReady((map) => {
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
          throw new TypeError('Vietflex: bounds must be [[lat,lng], [lat,lng]].');
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
      if (this._marker && this._marker._map) {
        const PopupClass = this._marker._map.constructor && this._marker._map.constructor.Popup;
        if (PopupClass) this._marker.setPopup(new PopupClass(this._popupOptions).setHTML(this._popupHTML));
      }
      return this;
    }

    addTo(map) {
      if (!(map instanceof VietflexMap)) {
        throw new TypeError('Vietflex.Marker.addTo expects a Vietflex map instance.');
      }

      map._whenReady((rawMap, maplibregl) => {
        const markerOptions = Object.assign({}, this._options);
        const marker = new maplibregl.Marker(markerOptions).setLngLat(toLngLat(this._latlng));

        if (this._popupHTML !== null) {
          marker.setPopup(
            new maplibregl.Popup(this._popupOptions).setHTML(this._popupHTML)
          );
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
          customAttribution: this.options.customAttribution || this.options.prefix
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

  const Vietflex = {
    version: VERSION,
    mapLibreVersion: MAPLIBRE_VERSION,
    defaultStyle: DEFAULT_STYLE,
    vietflexMap: function (container, options) {
      return new VietflexMap(container, options);
    },
    Map: VietflexMap,
    Marker: Marker,
    ZoomControl: ZoomControl,
    AttributionControl: AttributionControl,
    ScaleControl: ScaleControl,
    GeolocateControl: GeolocateControl,
    toLngLat: toLngLat,
    loadMapLibre: loadMapLibre
  };

  global.Vietflex = Vietflex;
})(typeof window !== 'undefined' ? window : globalThis);
