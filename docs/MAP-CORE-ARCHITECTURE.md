# Vietflex Map Core — Kiến trúc nền dài hạn

Mục tiêu: tách **hiển thị bản đồ**, **tìm kiếm địa điểm** và **đồ thị đường** thành ba lõi độc lập nhưng dùng chung dữ liệu nguồn, để WebGIS, mobile, vehicle và xADAS có thể nâng cấp từng phần mà không phá API ứng dụng.

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

## 1. Source of Truth

Không dùng tile/style của nhà cung cấp bên ngoài làm dữ liệu gốc.

```text
OpenStreetMap PBF
Natural Earth (zoom thấp)
DEM / COG
Dữ liệu hành chính / chuyên ngành có giấy phép rõ ràng
Dữ liệu Vietflex tự thu thập
        │
        ↓
ETL / Normalize / QA
        │
        ├── Basemap schema
        ├── Places schema
        └── Road Graph schema
```

Ba nhánh phải sinh từ cùng snapshot/version dữ liệu để tránh hiện tượng bản đồ hiển thị một con đường nhưng routing graph chưa có đường đó, hoặc search trả POI đã bị xóa khỏi basemap.

Mỗi build cần lưu tối thiểu:

- `dataset_version`
- `osm_replication_sequence` hoặc timestamp nguồn
- `build_time`
- `schema_version`
- `license_manifest`
- checksum artefact

## 2. Basemap Core

```text
OSM PBF + Natural Earth + DEM
             ↓
      Basemap ETL
             ↓
  Shortbread/OpenMapTiles-like schema + vf_*
             ↓
       PMTiles / MVT
             ↓
       Object Storage
             ↓
            CDN
             ↓
         MapLibre
             ↓
 Streets / Light / Dark / Topo / Terrain / 3D
```

Nguyên tắc:

- Dữ liệu và style tách rời.
- Một bộ vector tile có thể phục vụ nhiều style.
- PMTiles ưu tiên cho dữ liệu nền tĩnh và phân phối qua CDN.
- PostGIS giữ dữ liệu động, truy vấn và nghiệp vụ.
- GeoJSON chỉ dành cho feature nhỏ/động, không phải basemap toàn quốc.

## 3. Places Core

```text
OSM place / address / POI
+ dữ liệu địa điểm Vietflex
+ tên tiếng Việt / alias
           ↓
   Places Normalizer
           ↓
  Search Index / OpenSearch
           ↓
          Photon
           ↓
   Forward / Reverse Search
```

Schema Vietflex Places nên giữ:

```text
place_id
osm_type
osm_id
name
name_vi
name_en
aliases[]
category
subcategory
lat
lon
bbox
address
admin_code
postcode
phone
website
opening_hours
source
source_version
updated_at
```

UI/API Vietflex ưu tiên `name_vi → name → name_en`.

Public Photon chỉ dùng development/demo. Production phải self-host hoặc thay backend khác nhưng giữ API `Vietflex.Core.PlacesClient`.

## 4. Road Graph Core

Basemap road geometry không phải routing graph.

```text
OSM highways
   ↓
Road Graph Builder
   ↓
Nodes + Directed Edges
   │
   ├── one-way
   ├── turn restrictions
   ├── speed
   ├── access
   ├── road class
   ├── surface
   ├── bridge/tunnel
   ├── toll
   └── conditional restrictions
   ↓
Valhalla Graph Tiles
   ↓
Routing / Matrix / Matching / Navigation
```

Các lớp cần giữ riêng trong roadmap Vietflex:

- topology graph
- turn restrictions
- speed profile
- vehicle access
- truck restrictions
- temporary closure/incidents
- traffic speed (khi có nguồn hợp pháp)
- lane guidance
- intersection metadata

## 5. Routing Engine

Adapter mặc định: Valhalla.

API facade:

```js
const routing = Vietflex.Core.routing();

await routing.route([A, B]);
await routing.matrix([A], [B, C, D]);
await routing.mapMatch(trace);
await routing.traceAttributes(trace);
await routing.eta(A, B);
```

Backend có thể đổi sang OSRM/GraphHopper/engine riêng mà ứng dụng không cần đổi nếu adapter tuân theo interface Vietflex.

## 6. Map Matching

```text
Raw GPS
   ↓
accuracy / timestamp / heading / speed
   ↓
candidate road edges
   ↓
map matching
   ↓
matched road + matched position
   ↓
current road attributes
```

Nguồn GPS:

- điện thoại
- GPS xe
- OBD/Android head unit
- dashcam
- xADAS
- robot

Không gửi từng điểm GPS thành request độc lập. Client nên giữ cửa sổ trace ngắn rồi batch map-match để giảm nhiễu và request rate.

## 7. ETA

Giai đoạn 1:

```text
Road graph + static/default speed
              ↓
             ETA
```

Giai đoạn 2:

```text
Road graph
+ historical speed profile
+ time of day / weekday
              ↓
             ETA
```

Giai đoạn 3:

```text
Historical profile
+ live probe speeds
+ incidents / closure
+ weather/context
              ↓
         Dynamic ETA
```

Không để AI thay topology/routing rules. AI có thể học speed/ETA hoặc phát hiện bất thường; graph rules vẫn deterministic.

## 8. Navigation

```text
Destination
    ↓
Route
    ↓
GPS stream
    ↓
Map Matching
    ↓
Route progress
    ↓
Upcoming maneuver
    ↓
ETA update
    ↓
Off-route detection
    ↓
Re-route
    ↓
Voice / HUD / xADAS
```

`Vietflex.Core.NavigationSession` hiện là lớp nền thu GPS + trace buffer + map matching. Turn-by-turn state machine, rerouting và voice guidance sẽ là module tiếp theo.

## 9. xADAS integration

```text
Camera frame ──→ AI perception ───────────┐
                                         │
Phone GPS ────→ Map Matching ──→ road ───┼──→ Fusion
                                         │
Road Graph ───→ speed / curve / junction ┘
                                         ↓
                              HUD / Warning / Context
```

Map không thay camera perception; camera cũng không thay map. Hai nguồn bổ sung nhau:

- camera: lane/vehicle/object hiện thời
- map: road topology, upcoming curve/intersection, speed/access context
- GPS + map matching: xác định xe đang ở edge nào

## 10. Deployment mục tiêu

```text
                    VIETFLEX DATA PIPELINE
                             │
                  OSM PBF + own data
                             │
        ┌────────────────────┼────────────────────┐
        ↓                    ↓                    ↓
   Basemap build        Places build         Graph build
        ↓                    ↓                    ↓
    PMTiles              Photon index       Valhalla tiles
        ↓                    ↓                    ↓
 CDN/Object Store       Search Service      Routing Service
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ↓
                      Vietflex Core API
                             ↓
             Web / Mobile / Vehicle / xADAS
```

## 11. API stability rule

Ứng dụng chỉ gọi Vietflex API:

```text
Vietflex.vietflexMap()
Vietflex.Core.places()
Vietflex.Core.routing()
Vietflex.Core.navigation()
```

Không để ứng dụng gọi trực tiếp Photon/Valhalla URL. Endpoint và engine nằm trong cấu hình Core. Đây là lớp chống lock-in quan trọng nhất.

## 12. Roadmap

### Core 0.2
- MapLibre basemap
- Vietnamese-first labels
- basemap registry

### Core 0.3
- Places/Search facade
- Routing facade
- Matrix/ETA
- Map matching
- GPS NavigationSession

### Core 0.4
- PMTiles protocol tích hợp trực tiếp
- self-hosted Vietnamese search index
- Valhalla Vietnam graph pipeline
- route rendering layer trên MapLibre

### Core 0.5
- route progress
- off-route detection
- rerouting
- maneuver model
- Vietnamese TTS hooks

### Core 1.0
- versioned nationwide data pipeline
- automated QA
- synchronized basemap/places/graph snapshot
- stable API + release tags
- observability + health/status endpoints
