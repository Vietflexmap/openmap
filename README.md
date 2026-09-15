# Vietflex OpenMap CDN

`Vietflex OpenMap` là lớp API mỏng chạy trên **MapLibre GL JS**, nhằm giúp các ứng dụng Vietflex/WebGIS dùng một CDN chung mà không phụ thuộc Google Maps.

- Engine hiển thị: MapLibre GL JS.
- API tương thích đơn giản kiểu Leaflet/Vietflex: `vietflexMap`, `Marker`, `ZoomControl`, `AttributionControl`.
- Tọa độ API Vietflex: `[lat, lng]`.
- Tọa độ được tự chuyển sang `[lng, lat]` khi gọi MapLibre.
- Có thể thay `style` bằng style JSON/MVT do Vietflex tự vận hành.
- Không chứa Google Maps SDK hoặc Google tile URL.

## Dùng trực tiếp qua jsDelivr

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.css">
<script
  src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.js"></script>
```

> Khi phát hành production, nên pin URL theo release tag hoặc commit SHA thay vì `@main` để tránh thay đổi ngoài ý muốn.

## Ví dụ gần giống API Vietflex hiện tại

```html
<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vietflex map</title>

  <link rel="stylesheet"
    href="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.css">
  <script
    src="https://cdn.jsdelivr.net/gh/Vietflexmap/openmap@main/dist/vietflex.js"></script>

  <style>#map { height: 600px; }</style>
</head>
<body>
  <div id="map"></div>

  <script>
    const map = Vietflex.vietflexMap('map', {
      style: 'https://demotiles.maplibre.org/style.json',
      center: [21.0285, 105.8542],
      zoom: 11,
      zoomControl: false,
      attributionControl: false
    });

    new Vietflex.ZoomControl({ position: 'topleft' }).addTo(map);
    new Vietflex.AttributionControl({ position: 'bottomright' }).addTo(map);

    new Vietflex.Marker([21.0285, 105.8542])
      .bindPopup('Hà Nội')
      .addTo(map);
  </script>
</body>
</html>
```

## Dùng style riêng

```js
const map = Vietflex.vietflexMap('map', {
  style: 'https://maps.example.vn/styles/vietflex/style.json',
  center: [16.0, 106.0],
  zoom: 5
});
```

`demotiles.maplibre.org` chỉ phù hợp cho demo. Kiến trúc production nên trỏ `style` sang hạ tầng dữ liệu Vietflex tự quản, ví dụ vector tiles MVT sinh từ OSM/PostGIS hoặc hệ thống PMTiles có protocol tương ứng.

## API hiện có

```text
Vietflex.vietflexMap(container, options)
Vietflex.Marker([lat, lng], options)
Vietflex.ZoomControl(options)
Vietflex.AttributionControl(options)
Vietflex.ScaleControl(options)
Vietflex.GeolocateControl(options)
```

Map wrapper hỗ trợ thêm:

```text
map.ready()
map.getMapLibre()
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

Nếu cần dùng API MapLibre gốc:

```js
map.ready().then((rawMap) => {
  console.log(rawMap.getCenter());
});
```

## Kiến trúc

```text
Ứng dụng WebGIS
      ↓
Vietflex CDN API
      ↓
MapLibre GL JS
      ↓
Style JSON
      ↓
MVT / raster / GeoJSON / terrain
      ↓
OSM PBF → GPKG/PostGIS → MVT/PMTiles (Vietflex Map Core)
```

## Phiên bản

- Vietflex OpenMap: `0.1.0`
- MapLibre GL JS: `6.9.0`

MapLibre GL JS là dự án mã nguồn mở độc lập. Vietflex OpenMap là lớp tích hợp/API phía trên MapLibre, không phải bản fork của Google Maps.
