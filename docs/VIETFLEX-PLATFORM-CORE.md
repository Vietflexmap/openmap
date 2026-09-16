# Vietflex Platform Core v0.3

Mục tiêu: xây lõi dài hạn để nhiều ứng dụng WebGIS, mobile, vehicle, xADAS, IoT và GeoAI dùng chung một kiến trúc dữ liệu/API.

```text
                         Vietflex Platform Core
                                  │
 ┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
 ↓            ↓            ↓            ↓            ↓            ↓            ↓
Data Core  Schema Core  Storage Core Spatial Core Time/Event  Mobility/IoT  GeoAI Core
                                                                         │
                                                                         ↓
                                                                  Service + SDK Core
```

## 1. Data Core

Nguồn dữ liệu được coi là đầu vào, không phải API ứng dụng:

- OSM PBF / replication
- DEM / DSM / terrain
- ảnh vệ tinh / COG / STAC
- GPS traces
- camera / dashcam / video
- IoT telemetry
- TPMS
- OBD/CAN

Mỗi nguồn phải giữ: `source`, `source_id`, license, observed time, ingest time, checksum, dataset version.

## 2. Vietflex Schema

Namespace đề xuất:

- `vf_base`: đối tượng bản đồ nền
- `vf_place`: địa điểm / POI / address
- `vf_road`: road graph / restrictions / speed / access
- `vf_sensor`: telemetry
- `vf_event`: sự kiện thời gian-thực
- `vf_media`: ảnh / video / clip
- `vf_ai`: kết quả AI / confidence / QA

Quy tắc tên tiếng Việt:

```text
name:vi -> name_vi -> name -> name:latin -> name_en
```

Trường tối thiểu cho feature dùng chung:

```text
vf_id
vf_type
schema_version
dataset_version
source
source_id
name_vi
name
observed_at
ingested_at
geometry
properties
metadata
```

## 3. Storage Core

Phân vai, không dùng một định dạng cho tất cả:

```text
PostGIS       -> dữ liệu động, query, transaction, spatial SQL
GPKG          -> trao đổi/portable/offline GIS package
COG           -> raster cloud-native, DEM, ảnh vệ tinh
PMTiles       -> basemap/vector/raster tile phân phối tĩnh
Object Store  -> PMTiles, COG, media, model, build artefact
```

## 4. Spatial Core

Các operation chuẩn ở façade:

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

Engine có thể thay đổi theo adapter: PostGIS, GDAL/OGR, Valhalla, Photon, Martin, custom service.

## 5. Time/Event Core

Mọi stream phải có timestamp chuẩn và asset/device id khi có.

```text
GPS -------┐
Video -----┼--> Time/Event alignment --> event timeline
TPMS ------┤
OBD -------┤
IMU -------┘
```

Khuyến nghị chuẩn lưu: ISO-8601 UTC; giữ timezone/original timestamp trong metadata khi cần audit.

## 6. Mobility/IoT Core

Adapter protocol:

- BLE
- USB
- CAN
- OBD-II
- TPMS
- Serial
- Wi-Fi
- MQTT
- HTTP

Không để UI/app phụ thuộc trực tiếp model thiết bị. Mỗi vendor/device được bọc qua adapter và normalize về telemetry Vietflex.

## 7. GeoAI Core

Task interface chuẩn:

- image-understanding
- video-event-detection
- geo-query-generation
- feature-extraction
- QA
- anomaly-detection
- sensor-fusion

AI không ghi trực tiếp vào source-of-truth. Output AI phải có provenance, confidence và trạng thái QA/human approval khi dùng cho dữ liệu quan trọng.

## 8. Service + SDK Core

Ứng dụng chỉ gọi façade Vietflex:

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

Backend phía dưới có thể thay mà không làm vỡ app.

## 9. Luồng dữ liệu dài hạn

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

## 10. Versioning

Không chỉ version code. Mỗi release nên tách:

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

Các app production nên pin theo release/tag hoặc manifest thay vì `@main`.
