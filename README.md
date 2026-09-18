# VIETFLEX CORE TECH

`https://vietflexmap.github.io/openmap/` là **lõi công nghệ nền dùng chung và reference client** của Vietflex, không phải một WebGIS sản phẩm và không phải một backend duy nhất.

**Core Tech 0.5.0** gia cố kiến trúc theo hướng **Schema-first + Capability-first + Event-first + Ports & Adapters**, bổ sung **Spatial Context**, **Route**, **Watch** và **Knowledge** để bản đồ không chỉ render layer mà còn hiểu *cái gì đang xảy ra, ở đâu, lúc nào, có liên quan tới vị trí/tuyến/đối tượng nào và cần phát sinh hành động gì*.

- Vietflex OpenMap renderer layer: `0.2.x`
- Vietflex Map Core facade: `0.1.x`
- **Vietflex Core Tech: `0.5.0`**
- Kiến trúc: **Ports & Adapters / Hexagonal Architecture**
- Tương thích: alias `Vietflex.Platform` của 0.4.x/0.3.x vẫn được giữ.

## Kiến trúc chính thức

```text
                           VIETFLEX CORE TECH
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │                         │                          │
   SCHEMA CORE              CAPABILITY CORE             EVENT CORE
        │                         │                          │
        └─────────────────────────┼──────────────────────────┘
                                  │
                           DOMAIN SERVICES
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
         DATA CORE          SPATIAL CORE         TEMPORAL CORE
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                       SPATIAL CONTEXT ENGINE
                                  │
             nearby / onRoute / intersects / risk
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
        ROUTE ENGINE         WATCH ENGINE        KNOWLEDGE CORE
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                            ADAPTER LAYER
                                  │
 ┌─────────┬─────────┬─────────┬──┴───┬────────┬─────────┬─────────┐
 ↓         ↓         ↓         ↓      ↓        ↓         ↓
PostGIS  PMTiles    COG    Valhalla Photon    MQTT     GeoAI
                                  │
                         PORTS / GATEWAYS
                                  │
           ┌───────────┬──────────┼──────────┬─────────┐
           ↓           ↓          ↓          ↓         ↓
          CDN         API        MCP        SSE       MQTT
                                  │
                              SDK / Plugins
                                  │
       ┌──────────┬──────────┬────┴────┬─────────┬───────────┐
       ↓          ↓          ↓         ↓         ↓
     WebGIS     Mobile    Vehicle    Robot      AI Agent
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
Vietflex.CoreTech.SpatialContext
Vietflex.CoreTech.Route
Vietflex.CoreTech.Watch
Vietflex.CoreTech.Knowledge
Vietflex.CoreTech.Adapters
Vietflex.CoreTech.Gateways
Vietflex.CoreTech.SDK
Vietflex.CoreTech.Plugins
```

## Capability-first

Các capability cục bộ chạy ngay trong browser ở 0.5.0:

```text
spatial.distance
spatial.nearby
spatial.intersects
context.nearby
context.on-route
context.risk
routing.analyze-hazards
watch.create
watch.evaluate
knowledge.query
knowledge.risk-profile
event.publish
```

Backend-specific capability như `routing.route`, `places.search`, PostGIS query hay `geoai.*` được đăng ký qua adapter/gateway; domain core không gọi vendor trực tiếp.

## Event contract

`vf.event` chuẩn hóa:

```text
event_id / type / geometry / severity / status / confidence

time:
  observed_at
  valid_from
  valid_to
  received_at
  expires_at

source / asset_id / refs / properties / media
dataset_version / provenance / quality
```

Ngập, tai nạn, camera AI, IoT, thời tiết, OBD/TPMS, drone/robot có thể dùng cùng event contract.

## Dataset không đồng nghĩa Layer

```text
Dataset
 ├─ schema/version
 ├─ provenance/license/quality
 ├─ update policy
 ├─ endpoint/format
 └─ spatial/temporal extent

Layer
 ├─ dataset reference
 ├─ renderer/style
 ├─ zoom/visibility
 └─ interaction
```

Một dataset có thể phục vụ render, routing, spatial analysis và AI mà không cần là một layer hiển thị.

## Spatial Context Engine

```js
Core.SpatialContext.nearby(...)
Core.SpatialContext.onRoute(...)
Core.SpatialContext.intersects(...)
Core.SpatialContext.risk(...)
Core.SpatialContext.evaluate(...)
```

Đây là lớp trả lời: **“Dữ liệu/sự kiện nào liên quan tới vị trí, tuyến và thời điểm hiện tại?”**

## Route / Watch / Knowledge

`Route` tách routing provider khỏi hazard analysis. `Watch` match event theo `point / route / polygon / asset`. `Knowledge` giữ historical event/fact/evidence/risk profile ở contract level; storage bền vững đi qua adapter.

## Schema machine-readable

```text
schema/vietflex-feature.schema.json
schema/vietflex-event.schema.json
schema/vietflex-dataset.schema.json
schema/vietflex-context.schema.json
schema/vietflex-route.schema.json
schema/vietflex-watch.schema.json
schema/vietflex-knowledge.schema.json
schema/vietflex-capability.schema.json
schema/vietflex-plugin.schema.json
schema/vietflex-layer.schema.json
```

## Adapter Layer

```text
PostGIS / GPKG
PMTiles / COG / Object Storage
MapLibre
Valhalla
Photon
MQTT / Device Drivers
SSE / HTTP services
GeoAI models/services
```

## Ports / Gateways

```text
CDN   -> active trên GitHub Pages
API   -> planned HTTP capability gateway
MCP   -> planned AI/Agent capability gateway
SSE   -> planned server-to-client realtime gateway
MQTT  -> planned IoT/device realtime gateway
```

Gateway chỉ expose capability/event contract; không chứa business logic lõi.

## Plugin Contract

Chức năng chuyên đề không sửa core:

```text
plugins/flood
plugins/planning
plugins/traffic
plugins/aquaculture
plugins/adas
```

Plugin có thể khai báo `schemas / layers / capabilities / adapters / gateways / requires / version`.

## VNMap Core

`VNMap Core 0.1.0` là profile **map/basemap data-core** của Vietflex, tách biệt với `Vietflex Core Tech` tổng quát. Trong reference client, mục **VNMap Core** nằm ngay dưới **Vietflex TEDP**.

Public facade:

```js
VNMapCore.version
VNMapCore.domains
VNMapCore.manifest()
VNMapCore.contract()
VNMapCore.activate(map)
VNMapCore.status()
VNMapCore.isProductionReady()
```

Bốn miền dữ liệu lõi:

```text
basemap   -> water / landuse / admin / place
transport -> road / rail / ferry / transport infrastructure
poi       -> POI / address-facing features
building  -> footprint / future 3D attributes
```

Pipeline mục tiêu:

```text
OSM PBF + dữ liệu Việt Nam có quyền tái phân phối
                    ↓
                 PostGIS
                    ↓
             VNMap schema + QA
                    ↓
               MVT / PMTiles
                    ↓
       basemap / transport / poi / building
                    ↓
           style + sprite + glyph
                    ↓
                 MapLibre
```

Hiện trạng `bootstrap`: menu và API hoạt động bằng vector style mở để không làm trắng bản đồ. Chỉ chuyển `basemaps/vnmap-core/manifest.json` sang `status=ready` và `data_ready=true` sau khi tile, style, provenance và quyền phân phối của bộ dữ liệu tự quản đã sẵn sàng. TEDP/VNPT/Google/Mapbox vẫn là provider adapter, không trở thành source of truth của VNMap Core.

## Vai trò GitHub Pages

`https://vietflexmap.github.io/openmap/` là:

- reference implementation;
- static SDK/CDN/schema/manifest/docs endpoint;
- MapLibre/OpenMap renderer demo;
- nơi công bố stable Core contract.

Nó **không phải** production PostGIS, Valhalla, Photon, API, MCP, SSE, MQTT hay GeoAI server.

## Nguyên tắc bắt buộc

1. Core không phụ thuộc vendor.
2. App/SDK/API/MCP/Agent dùng chung capability contract.
3. Event có temporal validity, source, provenance và quality khi nguồn hỗ trợ.
4. Dataset không đồng nghĩa Layer.
5. Plugin không sửa internal state của core.
6. Dynamic gateway triển khai tách khỏi GitHub Pages.
7. `core_api_version`, `schema_version`, `dataset_version`, `plugin_version`, `adapter_version`, `model_version` tách độc lập.
8. Business logic của cứu hộ, xADAS, quy hoạch, thủy sản, du lịch... nằm trong plugin/product domain, không nhét vào stable core.

## Tài liệu

- `docs/CORE-TECH-ARCHITECTURE.md`
- `docs/CORE-TECH-0.5-MIGRATION.md`
- `docs/MAP-CORE-ARCHITECTURE.md`
- `docs/VIETNAMESE_BASEMAP_ARCHITECTURE.md`
- `docs/VIETFLEX-PLATFORM-CORE.md`

**Mục tiêu 0.5.0: Data → Event → Spatial Context → Capability → Action, nhưng vẫn thay được backend/vendor mà không phá ứng dụng phía trên.**
