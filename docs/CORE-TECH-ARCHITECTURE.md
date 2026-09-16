# VIETFLEX CORE TECH — Kiến trúc lõi chính thức

`openmap` được chốt là **Core Technology Layer dùng chung**, không phải một WebGIS sản phẩm, không phải backend duy nhất và không phải MCP server. Kiến trúc áp dụng nguyên tắc **Ports & Adapters (Hexagonal Architecture)** để có thể thay engine, storage, AI hoặc gateway mà không phá ứng dụng phía trên.

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

## Core không phụ thuộc vendor

Domain Core không được gọi trực tiếp PostGIS, MapLibre, Valhalla, Photon, MQTT hoặc model AI. Domain Core chỉ biết **schema**, **capability**, **event** và hợp đồng adapter.

Ví dụ capability ổn định:

```text
spatial.buffer
spatial.intersect
places.search
routing.route
routing.map-match
terrain.elevation
event.query
geoai.detect
```

Backend thực hiện capability có thể thay đổi độc lập.

## Schema Core

Schema Core là hợp đồng dữ liệu lâu dài. Namespace chính:

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

Mọi object nên giữ version, source, provenance, quality và thời gian.

## Capability Core

Capability là đơn vị chức năng dùng chung cho SDK, API, MCP, CLI và Agent. Mỗi capability có:

- `id`
- `version`
- `category`
- `permission`: `read | analyze | write | control`
- input schema
- output schema
- provider metadata

Một capability chỉ được implement một lần ở domain/adapter layer; các gateway chỉ expose lại capability đó.

## Event Core

Event Core cung cấp event contract và event bus nội bộ. Dữ liệu GPS, camera, OBD, TPMS, IoT, AI detection có thể quy về timeline/event chung.

## Domain Services

Domain Services là nơi phối hợp các capability thành workflow nghiệp vụ tổng quát nhưng không chứa business logic của sản phẩm cụ thể như xADAS, cứu hộ, quy hoạch hay thủy sản.

## Data Core

Quản lý source registry và provenance cho:

- OSM
- DEM
- satellite/EO
- GPS
- camera/video
- IoT
- TPMS
- OBD/CAN
- IMU
- LiDAR

## Spatial Core

Spatial Core gọi capability thay vì gọi backend trực tiếp. Ví dụ:

```js
Vietflex.CoreTech.Spatial.run('buffer', payload)
```

sẽ resolve capability `spatial.buffer`.

## Temporal Core

Chuẩn hóa ISO-8601 UTC, timeline và alignment giữa nhiều stream. Timestamp gốc/timezone có thể được giữ trong metadata để audit.

## Adapter Layer

Adapter là nơi tích hợp công nghệ cụ thể:

- PostGIS / GPKG
- PMTiles / COG / Object Storage
- MapLibre
- Valhalla
- Photon
- MQTT / device drivers
- GeoAI models/services

Adapter có thể thay mà không thay public domain contract.

## PORT / GATEWAYS

Gateway là lớp expose Core ra ngoài:

- **CDN**: JS/CSS/schema/style/plugin/manifest tĩnh.
- **API**: HTTP/REST/JSON service gateway.
- **MCP**: AI/Agent gateway; mapping tools/resources/prompts sang capability/resource trong core.
- **Events**: WebSocket/MQTT/SSE gateway cho stream thời gian thực.

MCP không được tự query PostGIS hoặc routing backend. Luồng đúng:

```text
AI -> MCP Gateway -> Capability Core -> Adapter -> Backend
```

API cũng áp dụng cùng nguyên tắc.

## SDK / Plugins

SDK và plugin là lớp mở rộng phía trên core. Plugin chuyên đề không sửa file lõi.

Ví dụ:

```text
plugins/flood
plugins/planning
plugins/traffic
plugins/aquaculture
plugins/adas
```

Plugin manifest khai báo schema, layers, capabilities và adapter cần thiết. Khi plugin được cài, capability registry có thể expose tự động qua SDK/API/MCP.

## Versioning

Tách version độc lập:

```text
core_api_version
schema_version
dataset_version
adapter_version
plugin_version
model_version
```

Không dùng một version chung cho mọi thứ.

## Vai trò của GitHub Pages

`https://vietflexmap.github.io/openmap/` là:

- reference implementation;
- static CDN/source distribution;
- schema/manifest/docs endpoint;
- demo renderer;
- nơi công bố Core contract.

Nó **không phải** production PostGIS/API/MCP/routing/AI backend. Các gateway động phải được triển khai tách rời và kết nối qua contract của Vietflex Core Tech.
