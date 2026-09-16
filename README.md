# Vietflex OpenMap / Map Core

`Vietflex OpenMap` là lớp API bản đồ chạy trên **MapLibre GL JS**, ưu tiên giao diện và nhãn **tiếng Việt**, không phụ thuộc Google Maps. Dự án đang được mở rộng thành **Vietflex Map Core** với ba lõi độc lập: **Basemap**, **Places** và **Road Graph**.

- Vietflex OpenMap: **0.2.0**
- Vietflex Map Core facade: **0.1.0**

## Kiến trúc mục tiêu

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
```

> Production nên pin URL theo release tag hoặc commit SHA thay vì `@main`.

## Khởi tạo bản đồ tiếng Việt

```html
<div id="map" style="height:600px"></div>
<script>
  const map = Vietflex.vietflexMap('map', {
    basemap: 'streets',
    language: 'vi',
    vietnamReferenceLabels: true,
    center: [13.8, 110.2],
    zoom: 4.6,
    zoomControl: false,
    attributionControl: false
  });

  new Vietflex.ZoomControl({ position: 'topleft' }).addTo(map);
  new Vietflex.BasemapControl({ position: 'topright' }).addTo(map);
  new Vietflex.ScaleControl({ position: 'bottomleft' }).addTo(map);
  new Vietflex.AttributionControl({ position: 'bottomright' }).addTo(map);
</script>
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

Đổi lớp nền:

```js
map.setBasemap('dark');
map.setBasemap('light');
map.setBasemap('3d');
```

## Places Core

Adapter mặc định hiện là **Photon** nhưng endpoint không được hard-code. Production nên self-host.

Cấu hình:

```js
Vietflex.Core.configure({
  language: 'vi',
  search: {
    engine: 'photon',
    endpoint: 'https://search.maps.example.vn'
  }
});
```

Tìm địa điểm:

```js
const places = Vietflex.Core.places();

const result = await places.search('Bến Tre', {
  limit: 10,
  lang: 'vi'
});
```

Reverse geocode:

```js
const result = await places.reverse([10.243, 106.375]);
```

Schema Places dài hạn nên giữ `place_id`, `name_vi`, `aliases`, category, địa chỉ, `admin_code`, tọa độ, nguồn và version.

## Road Graph Core

**Basemap road geometry không phải routing graph.** Road Graph phải giữ topology và luật giao thông riêng:

```text
OSM highways
    ↓
Nodes + Directed Edges
    │
    ├── one-way
    ├── turn restrictions
    ├── speed
    ├── access
    ├── road class
    ├── bridge/tunnel
    └── conditional restrictions
    ↓
Routing graph tiles
```

Adapter mặc định hiện là **Valhalla**.

```js
Vietflex.Core.configure({
  routing: {
    engine: 'valhalla',
    endpoint: 'https://routing.maps.example.vn',
    costing: 'auto'
  }
});
```

## Routing

```js
const routing = Vietflex.Core.routing();

const route = await routing.route([
  [10.7769, 106.7009],
  [10.2430, 106.3750]
]);
```

Matrix:

```js
const matrix = await routing.matrix(
  [[10.7769, 106.7009]],
  [[10.2430, 106.3750], [10.0452, 105.7469]]
);
```

## Map Matching

GPS thô từ điện thoại/xe/xADAS có thể được ghép vào road graph:

```js
const matched = await routing.mapMatch([
  { lat: 10.7769, lon: 106.7009, accuracy: 8, time: 1700000000 },
  { lat: 10.7771, lon: 106.7014, accuracy: 7, time: 1700000001 }
]);
```

Luồng chuẩn:

```text
Phone / Vehicle / xADAS
        ↓
      GPS
        ↓
 trace buffer
        ↓
   Map Matching
        ↓
 current road edge
        ↓
 road attributes / navigation context
```

## ETA

```js
const eta = await routing.eta(
  [10.7769, 106.7009],
  [10.2430, 106.3750]
);

console.log(eta.seconds, eta.distance);
```

Roadmap ETA:

```text
static graph speed
      ↓
historical speed profile
      ↓
live probe speed + incidents
      ↓
dynamic ETA
```

AI có thể dự đoán tốc độ/ETA nhưng topology, access và turn restrictions vẫn nên là deterministic rules.

## Navigation / GPS session

`NavigationSession` hiện tạo nền cho pipeline GPS → trace → map matching:

```js
const nav = Vietflex.Core.navigation();

nav.on('gps', point => {
  console.log('GPS', point);
});

nav.on('match', result => {
  console.log('Matched road', result);
});

nav.on('error', console.error);
nav.start();

// nav.stop();
```

Module tiếp theo sẽ bổ sung route progress, off-route detection, rerouting, maneuver state và Vietnamese TTS hooks.

## xADAS integration

```text
Camera ──→ AI perception ──────────────┐
                                       │
GPS ─────→ Map Matching ─→ road edge ──┼──→ Fusion
                                       │
Road Graph → curve/speed/junction ─────┘
                                       ↓
                              HUD / Warning / Context
```

Camera nhận biết tình trạng tức thời; map cung cấp topology và ngữ cảnh phía trước; GPS + map matching nối chiếc xe với road graph.

## Chính sách nhãn tiếng Việt

Khi `language: 'vi'`, Vietflex ưu tiên:

```text
name:vi
  ↓
name_vi
  ↓
name
  ↓
name:latin
  ↓
name_en / name:en
```

Lớp `data/vietnam-reference-labels.geojson` có neo nhãn cartographic tiếng Việt cho `Biển Đông`, `Quần đảo Hoàng Sa`, `Quần đảo Trường Sa`. Đây là neo nhãn hiển thị, không phải polygon hay đường biên pháp lý; metadata giữ trạng thái tranh chấp tách khỏi chính sách trình bày.

## Nguyên tắc chống lock-in

Ứng dụng chỉ gọi:

```text
Vietflex.vietflexMap()
Vietflex.Core.places()
Vietflex.Core.routing()
Vietflex.Core.navigation()
```

Ứng dụng **không gọi trực tiếp URL Photon/Valhalla**. Engine và endpoint được đặt trong cấu hình Core. Vì vậy có thể thay Photon, Valhalla hoặc storage/CDN mà không phải viết lại app.

## Cấu trúc production mục tiêu

```text
                    VIETFLEX DATA PIPELINE
                             │
                  OSM PBF + own data
                             │
        ┌────────────────────┼────────────────────┐
        ↓                    ↓                    ↓
   Basemap build        Places build         Graph build
        ↓                    ↓                    ↓
    PMTiles              Search index        Routing graph
        ↓                    ↓                    ↓
 CDN/Object Store       Search Service      Routing Service
        │                    │                    │
        └────────────────────┼────────────────────┘
                             ↓
                      Vietflex Core API
                             ↓
             Web / Mobile / Vehicle / xADAS
```

Xem chi tiết:

- `docs/VIETNAMESE_BASEMAP_ARCHITECTURE.md`
- `docs/MAP-CORE-ARCHITECTURE.md`
- `config/core.example.js`

## Nguồn và giấy phép

Vietflex OpenMap/Map Core là lớp tích hợp/API. Khi triển khai production cần giữ attribution và tuân thủ giấy phép/điều khoản của từng nguồn dữ liệu, tile, font, style và engine. Public demo services không được coi là hạ tầng production mặc định.
