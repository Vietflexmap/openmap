# Vietflex OpenMap / Map Core / Platform Core

`Vietflex OpenMap` là lớp API bản đồ chạy trên **MapLibre GL JS**, ưu tiên giao diện và nhãn **tiếng Việt**, không phụ thuộc Google Maps. Dự án đang được mở rộng thành **Vietflex Platform Core** để dùng chung cho WebGIS, mobile, vehicle, xADAS, IoT và GeoAI.

- Vietflex OpenMap: **0.2.0**
- Vietflex Map Core facade: **0.1.0**
- Vietflex Platform Core: **0.3.0**

## Kiến trúc tổng thể

```text
OSM / DEM / Satellite / GPS / Camera / IoT / TPMS / OBD
                         │
                         ↓
                    Data Core
                         │
                         ↓
                  Vietflex Schema
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       PostGIS          COG          PMTiles
          │              │              │
          └──────────────┼──────────────┘
                         ↓
                    Spatial Core
                         │
                  Time/Event Core
                         │
           Mobility/IoT + GeoAI Core
                         │
                         ↓
                   Service + SDK
                         │
       WebGIS / Mobile / Vehicle / xADAS / AI Agent
```

Map Core vẫn giữ ba nhánh nền:

```text
                         Vietflex Map Core
                                │
             ┌──────────────────┼──────────────────┐
             ↓                  ↓                  ↓
          Basemap            Places           Road Graph
          PMTiles              POI                 │
             │                  │                  ↓
          MapLibre           Search          Routing Engine
                                                   │
                                      ┌────────────┼────────────┐
                                      ↓            ↓            ↓
                                 Map Matching     ETA       Navigation
                                      ↑
                                  GPS traces
                                      ↑
                           Phone / Vehicle / xADAS
```

Ba nhánh phải được build từ cùng snapshot dữ liệu/version để basemap, search và routing không lệch nhau.

## CDN

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.css">
<script
  src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.js"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex-core.js"></script>
<script
  src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex-platform.js"></script>
```

> Production nên pin URL theo release tag hoặc commit SHA thay vì `@main`.

## Platform Core API

```js
Vietflex.Platform.Data
Vietflex.Platform.Schema
Vietflex.Platform.Storage
Vietflex.Platform.Spatial
Vietflex.Platform.TimeEvent
Vietflex.Platform.MobilityIoT
Vietflex.Platform.GeoAI
Vietflex.Platform.ServiceSDK
```

Ví dụ tạo feature theo Vietflex Schema:

```js
const feature = Vietflex.Platform.Schema.createFeature({
  vf_type: 'vf_sensor',
  source: 'tpms',
  name_vi: 'Áp suất lốp trước trái',
  observed_at: new Date().toISOString(),
  properties: { pressure_kpa: 230 }
});
```

Ví dụ normalize telemetry:

```js
const telemetry = Vietflex.Platform.MobilityIoT.normalizeTelemetry({
  device_id: 'vehicle-01',
  lat: 10.7769,
  lon: 106.7009,
  speed_kmh: 42,
  rpm: 1800
});
```

## Data Core

Nguồn dữ liệu chuẩn gồm:

- OSM
- DEM / terrain
- ảnh vệ tinh
- GPS traces
- camera / dashcam
- IoT telemetry
- TPMS
- OBD/CAN

Mỗi nguồn phải giữ provenance, timestamp, license, checksum và dataset version.

## Vietflex Schema

Namespace đề xuất:

```text
vf_base
vf_place
vf_road
vf_sensor
vf_event
vf_media
vf_ai
```

Quy tắc tên tiếng Việt:

```text
name:vi -> name_vi -> name -> name:latin -> name_en
```

Schema machine-readable: `schema/vietflex-feature.schema.json`.

## Storage Core

```text
PostGIS       -> query động, transaction, spatial SQL
GPKG          -> portable/offline GIS package
COG           -> raster cloud-native, DEM, ảnh vệ tinh
PMTiles       -> basemap/vector/raster distribution
Object Store  -> tile, COG, media, model, build artefact
```

## Spatial Core

Operation chuẩn:

```text
buffer
intersect
within
nearest
spatial-query
routing
geocoding
reverse-geocoding
map-matching
terrain
```

Engine phía dưới được bọc bằng adapter để có thể thay PostGIS, GDAL, Valhalla, Photon hoặc service riêng mà không đổi API app.

## Time/Event Core

Đồng bộ theo timestamp:

```text
GPS -------┐
Video -----┼--> Time/Event alignment --> event timeline
TPMS ------┤
OBD -------┤
IMU -------┘
```

Khuyến nghị dùng ISO-8601 UTC cho timestamp chuẩn và giữ timezone/original timestamp trong metadata khi cần audit.

## Mobility/IoT Core

Protocol/adapter mục tiêu:

```text
BLE
USB
CAN
OBD-II
TPMS
Serial
Wi-Fi
MQTT
HTTP
```

UI/app không phụ thuộc trực tiếp từng model thiết bị; mỗi vendor/device phải normalize về telemetry Vietflex.

## GeoAI Core

Task interface chuẩn:

```text
image-understanding
video-event-detection
geo-query-generation
feature-extraction
QA
anomaly-detection
sensor-fusion
```

AI output phải giữ provenance, confidence và QA status; không nên ghi trực tiếp vào source-of-truth khi chưa qua rule/QA phù hợp.

## Service + SDK Core

Mọi app gọi façade Vietflex; backend được phép thay đổi độc lập.

```js
Vietflex.Platform.configure({
  language: 'vi',
  datasetVersion: '2026-09-16-01'
});
```

## Basemap Core

| ID | Tên hiển thị | Style bootstrap |
|---|---|---|
| `streets` | Đường phố | OpenFreeMap Liberty |
| `light` | Nền sáng | OpenFreeMap Positron |
| `bright` | Sáng rõ | OpenFreeMap Bright |
| `dark` | Nền tối | OpenFreeMap Dark |
| `fiord` | Địa hình tối | OpenFreeMap Fiord |
| `3d` | Bản đồ 3D | OpenFreeMap 3D |

Các style OpenFreeMap chỉ là **bootstrap source** để chạy ngay. Production mục tiêu là:

```text
OSM PBF + Natural Earth + DEM
        ↓
Basemap ETL
        ↓
PMTiles / MVT / COG
        ↓
Object Storage + CDN Vietflex
        ↓
MapLibre
```

## Places + Road Graph Core

Places dùng façade `Vietflex.Core.places()`; Road Graph dùng `Vietflex.Core.routing()`. Search/routing endpoint không hard-code để production có thể self-host.

**Basemap road geometry không phải routing graph.** Road Graph phải giữ topology, direction, one-way, turn restriction, speed, access và conditional restriction.

## Release Manifest

Template: `config/core-manifest.example.json`.

Mỗi build nên quản lý độc lập:

```text
sdk_version
schema_version
dataset_version
basemap_version
places_version
roadgraph_version
terrain_version
model_version
build_time
source_timestamp
license_manifest
checksums
```

## Tài liệu

- `docs/MAP-CORE-ARCHITECTURE.md`
- `docs/VIETNAMESE_BASEMAP_ARCHITECTURE.md`
- `docs/VIETFLEX-PLATFORM-CORE.md`

Nguyên tắc dài hạn: **dữ liệu nguồn, schema, storage, service, SDK và UI phải tách lớp**. Không để ứng dụng phụ thuộc trực tiếp endpoint, vendor thiết bị, engine routing hay model AI cụ thể.
