# VIETFLEX CORE TECH 0.5 — Kiến trúc lõi chính thức

## 1. Mục tiêu

`openmap` là **Core Technology Layer + reference client**. Stable core định nghĩa contract; công nghệ triển khai cụ thể được thay qua adapter/gateway.

Nguyên tắc trung tâm:

```text
Data → Event → Spatial/Temporal Context → Capability → Action
```

Core không giả định một PostGIS, một routing provider, một AI model hay một message broker duy nhất.

## 2. Kiến trúc

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

## 3. Core contracts

### Schema Core

Schema Core quản lý namespace và contract machine-readable.

Namespace 0.5:

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
vf.watch
vf.knowledge
vf.context
vf.dataset
```

### Capability Core

Capability là đơn vị hành vi ổn định. Gateway không được viết lại logic đã có trong capability.

Ví dụ:

```text
spatial.nearby
context.on-route
routing.analyze-hazards
watch.evaluate
knowledge.risk-profile
```

`routing.route`, `places.search`, `geoai.*` có thể do adapter/backend thực hiện.

### Event Core

Event Core là hợp đồng chung của trạng thái động. Event phải phân biệt:

```text
observed_at   = thời điểm hiện tượng được quan sát
valid_from    = bắt đầu có hiệu lực
valid_to      = hết hiệu lực nghiệp vụ
received_at   = Core nhận dữ liệu lúc nào
expires_at    = sau thời điểm này không được coi là current
```

Không dùng một `timestamp` duy nhất cho mọi ý nghĩa thời gian.

### Data Core

Data Core có hai registry độc lập:

```text
Source Registry
Dataset Registry
```

Dataset phải có khả năng mang metadata về version, license, provenance, quality, update policy, format và endpoint.

## 4. Spatial Context Engine

Spatial Context nằm giữa raw GIS operation và product business logic.

Nhiệm vụ:

```text
nearby
onRoute
intersects
risk
evaluate
```

Input điển hình:

```js
{
  position,
  route,
  events,
  datasets,
  knowledge,
  options
}
```

Output là context đã đánh giá, không phải chỉ một danh sách layer.

## 5. Route Engine

Route Engine có hai trách nhiệm tách biệt:

1. route provider facade (`Valhalla`, `OSRM`, provider khác);
2. context/hazard analysis độc lập provider.

```text
Route Provider
     ↓
Route Geometry
     ↓
Spatial Context
     ↓
Hazard Analysis
```

Điều này cho phép đổi routing backend mà không mất hazard logic.

## 6. Watch Engine

Watch target chuẩn:

```text
point
route
polygon
asset
```

Conditions chuẩn có thể gồm:

```text
event_types
status
min_severity
min_confidence
```

Watch Engine chỉ match. Delivery thực tế đi qua Push/SSE/MQTT/Webhook/Email adapter.

## 7. Knowledge Core

Knowledge Core không phải vector database và không khóa vào một database.

Nó định nghĩa contract cho:

- historical event memory;
- derived facts;
- evidence;
- confidence;
- risk profile;
- patterns.

Storage bền vững phải đi qua adapter.

## 8. Adapter Layer

Adapters triển khai technology-specific behavior:

```text
PostGIS / GPKG
PMTiles / COG / Object Storage
MapLibre
Valhalla / Photon
MQTT / SSE
GeoAI
Device Drivers
```

Adapter có thể bị thay mà không thay stable public contract.

## 9. Ports / Gateways

### CDN

Active. GitHub Pages/jsDelivr phân phối static artifacts.

### API

HTTP capability gateway. Planned; phải map request vào Capability Core.

### MCP

AI/Agent gateway. Planned; MCP tool/resource không query backend trực tiếp nếu capability tương ứng tồn tại.

### SSE

Server → client realtime event stream. Planned.

### MQTT

IoT/device event transport. Planned.

`Events` của 0.4.x được giữ làm compatibility alias trong runtime gateway port list.

## 10. Local runtime capabilities

0.5.0 có các capability chạy browser-side không cần backend:

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

Đây là reference implementation; production có thể thay bằng backend capability nhưng giữ id/contract.

## 11. Security boundary

GitHub Pages không được giữ:

- database credential;
- API secret;
- VAPID private key;
- MQTT password;
- private routing/geocoding key;
- model secret.

Secrets nằm ở dynamic gateway/backend.

## 12. Versioning

Tách độc lập:

```text
core_api_version
schema_version
dataset_version
adapter_version
gateway_version
plugin_version
model_version
```

Core 0.5.0 không đồng nghĩa mọi dataset/plugin phải mang version 0.5.0.

## 13. Production flow đề xuất

```text
OSM / Sensor / VNMHA / Camera / User
                  ↓
              Adapters
                  ↓
           Dataset / Event
                  ↓
       Spatial + Temporal Core
                  ↓
        Spatial Context Engine
                  ↓
     Route / Watch / Knowledge
                  ↓
           Capability Core
                  ↓
       API / MCP / SSE / MQTT
                  ↓
WebGIS / Mobile / Vehicle / Robot / Agent
```

## 14. Điều không đưa vào stable core

Không đưa business logic riêng của:

```text
flood app
planning app
rescue app
aquaculture app
ADAS product
tourism app
```

Các logic này nằm ở plugin/product domain layer và sử dụng Core contract.

## 15. Definition of Done cho capability mới

Một capability chỉ được coi là vào Core khi:

1. có ID/version/category/permission;
2. input/output contract rõ;
3. không khóa vendor trong public interface;
4. có failure semantics;
5. có provenance/time semantics nếu xử lý dữ liệu;
6. có test hoặc reference implementation;
7. API/MCP nếu expose phải gọi lại capability, không viết logic song song.
