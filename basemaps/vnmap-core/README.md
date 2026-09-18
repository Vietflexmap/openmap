# VNMap Core

VNMap Core is the provider-neutral Vietnam basemap contract used by Vietflex OpenMap.

The public menu entry is intentionally usable before Vietflex publishes its own national tile package: while `manifest.json` is in `bootstrap` state, the adapter loads an open vector style. Production mode is enabled only after `status=ready` and `data_ready=true`.

## Four core domains

- `basemap`: water, landuse, administrative boundaries, place labels.
- `transport`: roads, rail, ferry and transport infrastructure.
- `poi`: POI and address-facing features.
- `building`: footprints and future 3D attributes.

The intended pipeline is:

```text
OSM PBF + licensed Vietnam datasets
              ↓
           PostGIS
              ↓
       VNMap schema/QA
              ↓
    MVT / PMTiles build
              ↓
basemap | transport | poi | building
              ↓
  VNMap style + sprite + glyph
              ↓
          MapLibre
```

TEDP/VNPT/Google/Mapbox are optional provider adapters and are not source-of-truth assets of VNMap Core.

## Production gate

Do not set `data_ready=true` until dataset provenance, redistribution rights, four domain tile sources, and style/sprite/glyph assets are published and tested.
