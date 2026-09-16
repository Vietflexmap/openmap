# Vietflex Terrain / Topo — self-managed DEM

Mục tiêu: dữ liệu DEM được Vietflex tự quản lý, còn Core Tech chỉ tiêu thụ capability `terrain` qua adapter. Không hard-code OpenTopoMap hoặc một provider terrain cụ thể vào Core.

## Runtime contract

OpenMap đọc `terrain/manifest.json`.

Khi `status=ready` và `data_ready=true`, plugin `plugins/basemaps.js` sẽ:

1. tải base vector style;
2. đăng ký source `raster-dem` tên `vietflex-dem`;
3. thêm hillshade;
4. bật MapLibre 3D terrain;
5. nếu contour MVT đã sẵn sàng, thêm lớp contour.

Nếu DEM chưa sẵn sàng, OpenMap giữ nền Simple và không gọi OpenTopoMap.

## Data layout

```text
terrain/
├── manifest.json
├── terrain-rgb/
│   └── {z}/{x}/{y}.png
└── contours/
    └── {z}/{x}/{y}.pbf
```

Với production, khuyến nghị không lưu toàn bộ tile DEM quốc gia trong Git repo. Hãy đặt tile trên object storage/CDN do Vietflex quản lý và cập nhật `tile_template` trong manifest thành URL CDN. Hợp đồng adapter không thay đổi.

## Recommended source-of-truth pipeline

```text
DEM GeoTIFF/COG
   ↓ validate CRS / nodata / vertical units
COG master
   ↓ derive web terrain products
Terrain-RGB tiles + contour MVT
   ↓
Object Storage / CDN
   ↓
terrain/manifest.json
   ↓
Vietflex Terrain Adapter
   ↓
MapLibre hillshade + 3D terrain
```

## Production checks

- Ghi rõ nguồn DEM, giấy phép, phiên bản và ngày build trong manifest.
- Chuẩn hóa đơn vị cao độ là mét.
- Kiểm tra void/nodata và seam ở biên tile.
- Kiểm thử zoom 0–14 trước khi nâng maxzoom.
- Không bật `data_ready=true` cho đến khi tile endpoint thực sự hoạt động.
- Contour là sản phẩm dẫn xuất riêng; có thể phát hành sau Terrain-RGB mà không sửa Core.

## Core boundary

Core Tech không sở hữu DEM, URL tile hay provider. Các thành phần này thuộc adapter/config. Vì vậy có thể thay nguồn DEM hoặc CDN mà không thay Schema Core, Capability Core hay Event Core.
