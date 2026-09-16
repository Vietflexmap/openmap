/*
 * Vietflex Map Core SDK
 * Basemap + Places/Search + Road Graph/Routing/Map Matching/ETA/Navigation facade.
 * Backend-neutral by design: configure self-hosted endpoints for production.
 */
(function (global) {
  'use strict';

  const Core = {};

  const defaults = {
    language: 'vi',
    search: {
      engine: 'photon',
      endpoint: null
    },
    routing: {
      engine: 'valhalla',
      endpoint: null,
      costing: 'auto'
    }
  };

  let config = JSON.parse(JSON.stringify(defaults));

  function mergeDeep(target, source) {
    const out = Object.assign({}, target || {});
    Object.keys(source || {}).forEach((key) => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = mergeDeep(out[key] || {}, value);
      } else {
        out[key] = value;
      }
    });
    return out;
  }

  function configure(next) {
    config = mergeDeep(config, next || {});
    return getConfig();
  }

  function getConfig() {
    return JSON.parse(JSON.stringify(config));
  }

  function requireEndpoint(value, name) {
    if (!value) {
      throw new Error('Vietflex Core: chưa cấu hình endpoint cho ' + name + '. Hãy dùng Vietflex.Core.configure(...).');
    }
    return String(value).replace(/\/$/, '');
  }

  function toLatLon(point) {
    if (Array.isArray(point) && point.length >= 2) {
      return { lat: Number(point[0]), lon: Number(point[1]) };
    }
    if (point && typeof point === 'object') {
      return {
        lat: Number(point.lat),
        lon: Number(point.lon !== undefined ? point.lon : point.lng)
      };
    }
    throw new TypeError('Vietflex Core: điểm phải là [lat,lng] hoặc {lat,lng/lon}.');
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options || {});
    if (!response.ok) {
      throw new Error('Vietflex Core HTTP ' + response.status + ': ' + response.statusText);
    }
    return response.json();
  }

  class PlacesClient {
    constructor(options) {
      this.options = mergeDeep(config.search, options || {});
    }

    _endpoint() {
      return requireEndpoint(this.options.endpoint, 'Places/Search');
    }

    async search(query, options) {
      const opts = Object.assign({ limit: 10, lang: config.language || 'vi' }, options || {});
      if (this.options.engine !== 'photon') {
        throw new Error('Vietflex Core: Places engine chưa được hỗ trợ: ' + this.options.engine);
      }

      const url = new URL(this._endpoint() + '/api');
      url.searchParams.set('q', query);
      url.searchParams.set('limit', opts.limit);
      url.searchParams.set('lang', opts.lang);

      if (opts.lat !== undefined && opts.lon !== undefined) {
        url.searchParams.set('lat', opts.lat);
        url.searchParams.set('lon', opts.lon);
      }
      if (opts.zoom !== undefined) url.searchParams.set('zoom', opts.zoom);
      if (Array.isArray(opts.layers)) opts.layers.forEach((x) => url.searchParams.append('layer', x));
      if (Array.isArray(opts.osmTags)) opts.osmTags.forEach((x) => url.searchParams.append('osm_tag', x));

      return fetchJson(url.toString());
    }

    async reverse(point, options) {
      const p = toLatLon(point);
      const opts = Object.assign({ limit: 1, lang: config.language || 'vi' }, options || {});
      const url = new URL(this._endpoint() + '/reverse');
      url.searchParams.set('lat', p.lat);
      url.searchParams.set('lon', p.lon);
      url.searchParams.set('limit', opts.limit);
      url.searchParams.set('lang', opts.lang);
      return fetchJson(url.toString());
    }
  }

  class RoutingClient {
    constructor(options) {
      this.options = mergeDeep(config.routing, options || {});
    }

    _endpoint() {
      return requireEndpoint(this.options.endpoint, 'Road Graph/Routing');
    }

    async _post(path, body) {
      return fetchJson(this._endpoint() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    async route(points, options) {
      const opts = Object.assign({ costing: this.options.costing || 'auto', units: 'kilometers' }, options || {});
      const locations = points.map(toLatLon);
      return this._post('/route', {
        locations,
        costing: opts.costing,
        units: opts.units,
        language: opts.language || config.language || 'vi',
        directions_options: {
          units: opts.units,
          language: opts.language || config.language || 'vi',
          narrative: opts.narrative !== false
        },
        costing_options: opts.costing_options || undefined,
        date_time: opts.date_time || undefined,
        alternates: opts.alternates || 0
      });
    }

    async matrix(sources, targets, options) {
      const opts = Object.assign({ costing: this.options.costing || 'auto', units: 'kilometers', verbose: false }, options || {});
      return this._post('/sources_to_targets', {
        sources: sources.map(toLatLon),
        targets: targets.map(toLatLon),
        costing: opts.costing,
        units: opts.units,
        verbose: opts.verbose,
        date_time: opts.date_time || undefined,
        costing_options: opts.costing_options || undefined
      });
    }

    async mapMatch(trace, options) {
      const opts = Object.assign({
        costing: this.options.costing || 'auto',
        shape_match: 'map_snap',
        gps_accuracy: 10,
        search_radius: 50
      }, options || {});

      const shape = trace.map((point) => {
        const p = toLatLon(point);
        const original = point && typeof point === 'object' && !Array.isArray(point) ? point : {};
        return {
          lat: p.lat,
          lon: p.lon,
          time: original.time,
          accuracy: original.accuracy
        };
      });

      return this._post('/trace_route', {
        shape,
        costing: opts.costing,
        shape_match: opts.shape_match,
        gps_accuracy: opts.gps_accuracy,
        search_radius: opts.search_radius,
        directions_options: {
          units: opts.units || 'kilometers',
          language: opts.language || config.language || 'vi'
        }
      });
    }

    async traceAttributes(trace, options) {
      const opts = Object.assign({
        costing: this.options.costing || 'auto',
        shape_match: 'map_snap',
        gps_accuracy: 10,
        search_radius: 50
      }, options || {});

      return this._post('/trace_attributes', {
        shape: trace.map(toLatLon),
        costing: opts.costing,
        shape_match: opts.shape_match,
        gps_accuracy: opts.gps_accuracy,
        search_radius: opts.search_radius,
        filters: opts.filters || undefined
      });
    }

    async eta(origin, destination, options) {
      const result = await this.matrix([origin], [destination], Object.assign({ verbose: false }, options || {}));
      const block = result && result.sources_to_targets;
      if (block && Array.isArray(block.durations) && block.durations[0]) {
        return {
          seconds: block.durations[0][0],
          distance: block.distances && block.distances[0] ? block.distances[0][0] : null,
          units: result.units || 'kilometers',
          raw: result
        };
      }
      if (Array.isArray(block) && block[0] && block[0][0]) {
        return {
          seconds: block[0][0].time,
          distance: block[0][0].distance,
          units: result.units || 'kilometers',
          raw: result
        };
      }
      return { seconds: null, distance: null, raw: result };
    }
  }

  class NavigationSession {
    constructor(options) {
      this.options = Object.assign({
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
        traceSize: 12,
        matchEvery: 4
      }, options || {});
      this.routing = this.options.routingClient || new RoutingClient();
      this.trace = [];
      this.watchId = null;
      this.listeners = {};
      this.counter = 0;
    }

    on(type, handler) {
      (this.listeners[type] ||= []).push(handler);
      return this;
    }

    _emit(type, payload) {
      (this.listeners[type] || []).forEach((fn) => {
        try { fn(payload); } catch (_) {}
      });
    }

    async _handlePosition(position) {
      const point = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        time: Math.floor(position.timestamp / 1000)
      };

      this.trace.push(point);
      if (this.trace.length > this.options.traceSize) this.trace.shift();
      this._emit('gps', point);

      this.counter += 1;
      if (this.trace.length >= 2 && this.counter % this.options.matchEvery === 0) {
        try {
          const matched = await this.routing.mapMatch(this.trace, {
            gps_accuracy: Math.max(5, Math.round(point.accuracy || 10))
          });
          this._emit('match', matched);
        } catch (error) {
          this._emit('error', error);
        }
      }
    }

    start() {
      if (!navigator.geolocation) {
        throw new Error('Vietflex Core: trình duyệt không hỗ trợ Geolocation API.');
      }
      if (this.watchId !== null) return this;

      this.watchId = navigator.geolocation.watchPosition(
        (position) => this._handlePosition(position),
        (error) => this._emit('error', error),
        {
          enableHighAccuracy: this.options.enableHighAccuracy,
          maximumAge: this.options.maximumAge,
          timeout: this.options.timeout
        }
      );
      return this;
    }

    stop() {
      if (this.watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this.watchId);
      }
      this.watchId = null;
      return this;
    }
  }

  Core.version = '0.1.0';
  Core.configure = configure;
  Core.getConfig = getConfig;
  Core.PlacesClient = PlacesClient;
  Core.RoutingClient = RoutingClient;
  Core.NavigationSession = NavigationSession;
  Core.places = function (options) { return new PlacesClient(options); };
  Core.routing = function (options) { return new RoutingClient(options); };
  Core.navigation = function (options) { return new NavigationSession(options); };

  if (!global.Vietflex) global.Vietflex = {};
  global.Vietflex.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
