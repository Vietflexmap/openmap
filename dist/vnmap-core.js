/* VNMap Core SDK facade v0.1.0
 * Provider-neutral Vietnam basemap/data-core profile for Vietflex OpenMap.
 * Rendering is delegated to the existing Vietflex/MapLibre adapter layer.
 */
(function (global) {
  'use strict';

  const VERSION = '0.1.0';
  const DOMAINS = Object.freeze(['basemap', 'transport', 'poi', 'building']);
  const currentScriptSrc =
    typeof document !== 'undefined' && document.currentScript && document.currentScript.src
      ? document.currentScript.src
      : '';

  let root = '.';
  try {
    root = currentScriptSrc ? new URL('../', currentScriptSrc).href.replace(/\/$/, '') : '.';
  } catch (_) {}

  const MANIFEST_URL = root + '/basemaps/vnmap-core/manifest.json';

  async function manifest() {
    const response = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('VNMap Core manifest HTTP ' + response.status);
    return response.json();
  }

  async function contract() {
    const m = await manifest();
    return Object.freeze({
      id: m.id || 'vnmap',
      name: m.name || 'VNMap Core',
      version: m.version || VERSION,
      status: m.status || 'unknown',
      dataReady: m.data_ready === true,
      renderer: m.renderer || 'MapLibre GL JS',
      architecture: m.architecture || 'provider-neutral',
      domains: DOMAINS.slice(),
      datasetVersion: m.dataset_version || null,
      storagePreference: Array.isArray(m.storage_preference) ? m.storage_preference.slice() : []
    });
  }

  function activate(map) {
    if (!global.VietflexBasemaps || typeof global.VietflexBasemaps.apply !== 'function') {
      return Promise.reject(new Error('VNMap Core requires plugins/basemaps.js'));
    }
    return global.VietflexBasemaps.apply(map, 'vnmap');
  }

  function status() {
    if (!global.VietflexBasemaps || typeof global.VietflexBasemaps.status !== 'function') return null;
    const s = global.VietflexBasemaps.status();
    return s && s.id === 'vnmap' ? s : null;
  }

  async function isProductionReady() {
    try {
      const m = await manifest();
      return m.status === 'ready' && m.data_ready === true;
    } catch (_) {
      return false;
    }
  }

  global.VNMapCore = Object.freeze({
    version: VERSION,
    id: 'vnmap',
    name: 'VNMap Core',
    domains: DOMAINS,
    manifestUrl: MANIFEST_URL,
    manifest,
    contract,
    activate,
    status,
    isProductionReady
  });
})(typeof window !== 'undefined' ? window : globalThis);
