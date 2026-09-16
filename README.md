# VIETFLEX CORE TECH

`https://vietflexmap.github.io/openmap/` được chốt là **lõi công nghệ nền dùng chung** của Vietflex, không phải một WebGIS sản phẩm và không phải một backend duy nhất.

Mục tiêu: giữ ổn định **Schema + Capability + Event + Domain Contract**, còn renderer, storage, routing, search, MQTT, AI, API hay MCP đều đi qua adapter/gateway để có thể thay thế hoặc mở rộng mà không phá ứng dụng phía trên.

- Vietflex OpenMap renderer layer: `0.2.x`
- Vietflex Map Core facade: `0.1.x`
- **Vietflex Core Tech: `0.4.0`**
- Kiến trúc: **Ports & Adapters / Hexagonal Architecture**

## Kiến trúc chính thức

```text
                           VIETFLEX CORE TECH
                                  │
                ┌─────────────────┼─────────────────┐
                ↓                 ↓                 ↓
            Schema Core      Capability Core    Event Core
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  ↓
                            Domain Services
                                  │
              ┌───────────────────┼────────────────────┐
              ↓                   ↓                    ↓
          Data Core          Spatial Core          Temporal Core
              │                   │                    │
              └───────────────────┼────────────────────┘
                                  ↓
                             Adapter Layer
                                  │
 ┌────────┬─────────┬────────┬────┼────┬────────┬─────────┐
 ↓        ↓         ↓        ↓         ↓        ↓         ↓
PostGIS PMTiles    COG    Valhalla   Photon   MQTT     GeoAI
                                  │
                                  ↓
                             PORT / GATEWAYS
                                  │
              ┌──────────┬────────┼─────────┐
              ↓          ↓        ↓         ↓
             CDN        API      MCP      Events
              │          │        │         │
              └──────────┴────────┼─────────┘
                                  ↓
                            SDK / Plugins
                                  ↓
       WebGIS / Mobile / Vehicle / Robot / xADAS / AI Agent
```

## Public Core API

```js
Vietflex.CoreTech.Schema
Vietflex.CoreTech.Capability
Vietflex.CoreTech.Event
Vietflex.CoreTech.Domain
Vietflex.CoreTech.Data
Vietflex.CoreTech.Spatial
Vietflex.CoreTech.Temporal
Vietflex.CoreTech.Adapters
Vietflex.CoreTech.Gateways
Vietflex.CoreTech.SDK
Vietflex.CoreTech.Plugins
```

`Vietflex.Platform` vẫn là alias tương thích cho code v0.3.x.

## Capability-first

SDK, API, MCP, CLI và Agent không tự viết logic GIS riêng. Tất cả gọi cùng capability registry.

```js
Vietflex.CoreTech.Capability.register({
  id: 'spatial.buffer',
  version: '1.0.0',
  category: 'spatial',
  permission: 'analyze',
  provider: 'postgis'
}, {
  async execute(payload) {
    // Adapter implementation lives outside the stable domain contract.
  }
});
```

Sau đó:

```js
await Vietflex.CoreTech.Spatial.run('buffer', payload);
```

API hay MCP chỉ expose lại `spatial.buffer`; chúng không được query PostGIS trực tiếp.

## Schema Core

Namespace chuẩn:

```text
vf.feature
vf.place
vf.road
vf.track
vf.sensor
vf.device
vf.event
vf.media
vf.raster
vf.terrain
vf.ai_result
vf.route
```

Schema machine-readable:

- `schema/vietflex-feature.schema.json`
- `schema/vietflex-capability.schema.json`
- `schema/vietflex-plugin.schema.json`

## Adapter Layer

Công nghệ cụ thể nằm ngoài domain core:

```text
PostGIS / GPKG
PMTiles / COG / Object Storage
MapLibre
Valhalla
Photon
MQTT / Device Drivers
GeoAI models/services
```

Có thể thay adapter mà không đổi API ứng dụng.

## Gateways

Bốn port chính:

```text
CDN     -> static SDK/schema/style/plugin/manifest
API     -> HTTP service gateway
MCP     -> AI/Agent gateway
Events  -> WebSocket/MQTT/SSE realtime gateway
```

Hiện tại GitHub Pages đang là **CDN/reference port**. API, MCP và Events được thiết kế để triển khai thành service riêng về sau.

System manifest:

```text
https://vietflexmap.github.io/openmap/manifest.json
```

## Plugin Contract

Layer/chức năng chuyên đề không sửa core. Tạo plugin riêng:

```text
plugins/flood
plugins/planning
plugins/traffic
plugins/aquaculture
plugins/adas
```

Plugin khai báo:

```text
schemas
layers
capabilities
adapters
gateways
requires
version
```

Ví dụ runtime:

```js
Vietflex.CoreTech.Plugins.install(manifest, plugin);
```

## CDN

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.css">
<script src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex-core.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex-platform.js"></script>
```

Production nên pin release tag hoặc commit SHA thay vì `@main`.

## Vai trò GitHub Pages

`https://vietflexmap.github.io/openmap/` là:

- reference implementation;
- static distribution/CDN;
- schema/manifest/docs endpoint;
- MapLibre demo renderer;
- nơi công bố stable core contract.

Nó không phải production PostGIS, routing, search, MQTT, MCP hay AI server.

## Nguyên tắc bắt buộc

1. Core không phụ thuộc vendor cụ thể.
2. App không gọi adapter/backend trực tiếp nếu capability đã tồn tại.
3. Plugin không sửa internal state của core.
4. API/MCP/Events là gateway, không chứa business logic lõi.
5. Dữ liệu phải có schema/version/provenance/quality rõ ràng.
6. `core_api_version`, `schema_version`, `dataset_version`, `plugin_version`, `adapter_version`, `model_version` phải tách độc lập.
7. Business logic của xADAS, quy hoạch, cứu hộ, thủy sản, du lịch... nằm ngoài core.

## Tài liệu

- `docs/CORE-TECH-ARCHITECTURE.md` — kiến trúc chính thức.
- `docs/MAP-CORE-ARCHITECTURE.md` — Basemap / Places / Road Graph.
- `docs/VIETNAMESE_BASEMAP_ARCHITECTURE.md` — nền bản đồ ưu tiên tiếng Việt.
- `docs/VIETFLEX-PLATFORM-CORE.md` — lịch sử thiết kế platform core.

**Giá trị lõi cần giữ ổn định lâu dài: Vietflex Schema + Capability Contract + Event Contract + Plugin Contract + Ports/Adapters.**
