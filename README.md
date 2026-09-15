# Vietflex OpenMap CDN

`Vietflex OpenMap` là lớp API bản đồ chạy trên **MapLibre GL JS**, ưu tiên giao diện và nhãn **tiếng Việt**, không phụ thuộc Google Maps.

Phiên bản hiện tại: **0.2.0**.

## Mục tiêu

- MapLibre GL JS làm engine hiển thị mã nguồn mở.
- API đơn giản theo kiểu Vietflex/Leaflet: `vietflexMap`, `Marker`, `ZoomControl`, `AttributionControl`.
- Tọa độ Vietflex dùng `[lat, lng]`; thư viện tự chuyển sang `[lng, lat]` cho MapLibre.
- Có registry lớp nền mở và bộ chọn lớp nền tiếng Việt.
- Ưu tiên `name:vi` / `name_vi` khi dữ liệu nguồn có sẵn.
- Có lớp nhãn tham chiếu tiếng Việt cho `Biển Đông`, `Quần đảo Hoàng Sa`, `Quần đảo Trường Sa`.
- Không chứa Google Maps SDK hoặc Google tile URL.
- Thiết kế để sau này thay public tiles bằng PMTiles/MVT do Vietflex tự vận hành mà không phải đổi API ứng dụng.

## CDN

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.css">
<script
  src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.js"></script>
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

## Các lớp nền hiện có

| ID | Tên hiển thị | Style bootstrap |
|---|---|---|
| `streets` | Đường phố | OpenFreeMap Liberty |
| `light` | Nền sáng | OpenFreeMap Positron |
| `bright` | Sáng rõ | OpenFreeMap Bright |
| `dark` | Nền tối | OpenFreeMap Dark |
| `fiord` | Địa hình tối | OpenFreeMap Fiord |
| `3d` | Bản đồ 3D | OpenFreeMap 3D |

Các style OpenFreeMap hiện tại là **bootstrap source** để Vietflex chạy ngay. Kiến trúc lâu dài không nên phụ thuộc một public endpoint duy nhất; mục tiêu là self-host dữ liệu/tile và giữ nguyên API `basemap`.

Đổi lớp nền khi đang chạy:

```js
map.setBasemap('dark');
map.setBasemap('light');
map.setBasemap('3d');
```

Liệt kê registry:

```js
console.table(Vietflex.getBasemaps());
```

## Chính sách nhãn tiếng Việt

Khi `language: 'vi'`, Vietflex ưu tiên theo thứ tự:

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

Để bảo đảm 100% tiếng Việt, tile do Vietflex tự sinh phải giữ trường `name:vi` hoặc `name_vi`. Public vector tiles có thể không chứa đầy đủ trường này cho mọi đối tượng.

Lớp `data/vietnam-reference-labels.geojson` hiện cung cấp các neo nhãn cartographic:

```text
Biển Đông
Quần đảo Hoàng Sa · Việt Nam
Quần đảo Trường Sa · Việt Nam
```

Các điểm này là **neo nhãn hiển thị**, không phải polygon hay đường biên pháp lý. Metadata của dữ liệu giữ thuộc tính `disputed` cho các khu vực có tranh chấp để tách rõ dữ liệu địa lý và chính sách trình bày.

Có thể tắt lớp tham chiếu:

```js
const map = Vietflex.vietflexMap('map', {
  basemap: 'streets',
  vietnamReferenceLabels: false
});
```

Hoặc thay bằng GeoJSON do hệ thống của bạn quản lý:

```js
const map = Vietflex.vietflexMap('map', {
  basemap: 'streets',
  vietnamLabelsUrl: '/data/labels-vi.geojson'
});
```

## API

```text
Vietflex.vietflexMap(container, options)
Vietflex.Marker([lat, lng], options)
Vietflex.ZoomControl(options)
Vietflex.AttributionControl(options)
Vietflex.ScaleControl(options)
Vietflex.GeolocateControl(options)
Vietflex.BasemapControl(options)
```

Map wrapper:

```text
map.ready()
map.getMapLibre()
map.getBasemap()
map.setBasemap()
map.setLanguage()
map.on()
map.once()
map.off()
map.addSource()
map.addLayer()
map.flyTo()
map.jumpTo()
map.setCenter()
map.setZoom()
map.fitBounds()
map.resize()
map.remove()
```

## Kiến trúc production đề xuất

```text
OpenStreetMap PBF
Natural Earth
DEM / dữ liệu mở khác
        ↓
ETL + chuẩn hóa tên tiếng Việt
        ↓
GPKG / PostGIS
        ↓
Shortbread hoặc schema Vietflex mở rộng
        ↓
MVT / PMTiles / COG
        ↓
Object Storage + CDN Vietflex
        ↓
style.json: streets / light / dark / topo / 3D
        ↓
MapLibre GL JS
        ↓
Vietflex OpenMap API
        ↓
WebGIS / IoT / AI / ứng dụng di động
```

Nguyên tắc: **dữ liệu lõi tách khỏi style và tách khỏi SDK**. Một bộ vector tiles có thể dùng cho nhiều style khác nhau.

Xem thêm: `docs/VIETNAMESE_BASEMAP_ARCHITECTURE.md`.

## Nguồn và giấy phép

Vietflex OpenMap là lớp tích hợp/API. Khi triển khai production cần giữ attribution và tuân thủ giấy phép/điều khoản của từng nguồn dữ liệu, tile, font và style đang sử dụng. MapLibre, OpenStreetMap, OpenFreeMap/OpenMapTiles và các nguồn dữ liệu mở có giấy phép/điều khoản riêng; không được hiểu chữ “mở” là miễn mọi nghĩa vụ attribution hoặc vận hành.
