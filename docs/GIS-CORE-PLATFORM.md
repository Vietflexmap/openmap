# Vietflex GIS Core Platform

Vietflex GIS Core Platform extends **VIETFLEX CORE TECH** without placing thematic data, providers, or UI-specific logic inside the domain core.

## Stable architecture

```text
                     VIETFLEX CORE TECH
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
    Schema Core       Capability Core     Event Core
                           │
                           ↓
                    Layer Contract
                           │
               ┌───────────┴───────────┐
               ↓                       ↓
         Layer Registry            Layer State
               │                       │
               └───────────┬───────────┘
                           ↓
                     Data Catalog
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
 Vector Adapter       Raster Adapter        Live Adapter
       │                   │                   │
 PMTiles/MVT       COG/WMTS/WMS/XYZ    PostGIS/API/MQTT/WS
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ↓
                     Map Renderer
                        MapLibre
                           │
                           ↓
                  UI / API / MCP / AI
```

## Six reinforced foundations

### 1. Layer Contract

Every thematic layer must conform to `schema/vietflex-layer.schema.json` before registration. The contract defines identity, group, layer type, adapter, rendering metadata, capabilities, CRS, licensing, provenance, and quality metadata.

The contract is stable; storage and providers are replaceable.

### 2. Layer Registry

`plugins/layers.js` provides the only runtime registry for thematic layers. UI code must discover layers from the registry instead of hard-coding soil, hydrology, administrative or crop layers.

Canonical calls:

```js
VietflexLayers.register(layerDefinition)
VietflexLayers.list({ group: 'hydrology' })
VietflexLayers.get('vf.hydrology.network')
```

### 3. Adapter boundary

Layer definitions reference an adapter by kind. Adapter implementations stay outside the domain core.

Recommended mapping:

- vector static: `pmtiles`, `mvt`, small `geojson`
- raster static/cloud: `cog`, `wmts`, `wms`, `xyz`
- dynamic/live: `postgis`, `api`, `mqtt`, `websocket`

A layer must never require the UI to know its backend technology.

### 4. Data Catalog

`catalog/datasets.json` is the metadata source of truth for datasets. A production dataset should not be marked ready until source, license, version, update time, CRS, extent, provenance and quality metadata are populated.

Dataset lifecycle:

```text
source → ingest → normalize → QA → version → publish artifact → catalog → layer registry
```

### 5. Layer Capabilities

The extension registers capability IDs through `CapabilityCore`:

```text
layer.render
layer.toggle
layer.identify
layer.filter
layer.legend
layer.opacity
layer.query
layer.time
layer.export
```

UI, API, MCP and AI agents should call these capabilities rather than call PostGIS, PMTiles, COG or MapLibre internals directly.

### 6. Layer State

Runtime layer state is separate from the layer definition and dataset metadata.

Stable state fields:

```text
visible
opacity
filter
time
selected_feature
```

This separation supports shareable map state, time sliders, print/export sessions and future collaboration without mutating the source dataset.

## Initial thematic domains

The registry configuration reserves four first-class domains:

```text
administrative
hydrology
soil
crops
```

Their initial entries are intentionally `enabled: false` and `awaiting-data`. This prevents placeholder datasets from being presented as authoritative production layers.

## Non-negotiable rules

1. Core does not contain thematic datasets.
2. UI does not hard-code thematic layer names or provider URLs.
3. Each dataset carries provenance and license metadata.
4. Provider changes happen behind adapters.
5. Every remote/API capability goes through Capability Core.
6. Live data does not get baked into static PMTiles builds.
7. Layer state never mutates the source dataset.
8. Production layers require explicit QA/version metadata.

## Next implementation gate

Before adding many datasets, implement one production layer end-to-end, preferably administrative boundaries:

```text
source dataset
  ↓
normalize to Vietflex schema
  ↓
QA + provenance + version
  ↓
PMTiles/MVT build
  ↓
Data Catalog = ready
  ↓
Layer Registry = enabled
  ↓
PMTiles adapter
  ↓
layer.render / identify / legend / query
  ↓
MapLibre
```

Once this pipeline passes, hydrology, soil and crop inventory can reuse the same contracts and adapters.
