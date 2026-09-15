# Kiến trúc bản đồ nền tiếng Việt dùng lâu dài

Tài liệu này mô tả hướng phát triển `Vietflex OpenMap` theo nguyên tắc **Vietnamese-first, open-source-first, provider-independent**.

## 1. Nguyên tắc lõi

Không gắn ứng dụng vào một nhà cung cấp tile duy nhất.

```text
Application API
    ↓
Vietflex OpenMap
    ↓
MapLibre
    ↓
Style JSON
    ↓
Vector / raster / terrain sources
```

Mỗi tầng phải thay được độc lập.

## 2. Source of Truth

Nguồn dữ liệu lõi đề xuất:

- OpenStreetMap PBF cho giao thông, địa danh, POI, thủy hệ, công trình.
- Natural Earth cho zoom thấp/toàn cầu.
- DEM mở cho hillshade, contour, terrain.
- Các nguồn dữ liệu Việt Nam được cấp phép hợp lệ cho lớp hành chính/chuyên đề.
- Dữ liệu Vietflex tự biên tập cho các trường tên tiếng Việt, alias và QA.

Không coi public raster tile endpoint là Source of Truth.

## 3. Chuẩn tên tiếng Việt

Schema Vietflex nên giữ tối thiểu:

```text
name
name:vi
name_vi
name_en
name_local
name_alt
name_official
```

Quy tắc render:

```text
name:vi → name_vi → name → name:latin → name_en
```

Với dữ liệu quan trọng của Việt Nam, ETL phải kiểm tra `name:vi` trước khi phát hành tile.

## 4. Namespace mở rộng Vietflex

Nếu dùng Shortbread/OpenMapTiles làm schema nền, không sửa tùy tiện field chuẩn. Bổ sung field hoặc layer riêng:

```text
vf_name_vi
vf_name_short_vi
vf_name_official_vi
vf_source
vf_source_date
vf_quality
vf_reviewed
vf_disputed
```

Lớp chuyên biệt có thể dùng namespace:

```text
vf_admin
vf_landuse
vf_planning
vf_transport
vf_hydro
vf_environment
vf_reference_labels
```

## 5. Biên giới và khu vực tranh chấp

Tách ba khái niệm:

```text
geometry
status metadata
presentation label
```

Dữ liệu hình học không nên bị chỉnh chỉ để phục vụ một style.

Nếu schema nguồn có thuộc tính `disputed`, phải giữ nó qua toàn bộ pipeline:

```text
OSM/source
   ↓
PostGIS/GPKG
   ↓
MVT/PMTiles
   ↓
disputed=true
   ↓
Style quyết định nét đứt/nét liền/nhãn
```

`data/vietnam-reference-labels.geojson` chỉ là lớp nhãn tham chiếu và không đại diện cho ranh giới pháp lý.

## 6. Các nhóm layer nền chuẩn

```text
00_background
01_land
02_landcover
03_water
04_waterway
05_boundary
06_transportation
07_building
08_poi
09_place
10_label
11_hillshade
12_contour
13_terrain
14_imagery
90_vf_reference
```

Nên duy trì thứ tự layer ổn định để các style khác nhau tái sử dụng được.

## 7. Các style nên duy trì

```text
streets.json
light.json
bright.json
dark.json
topo.json
terrain.json
navigation.json
planning.json
```

Một data core, nhiều style:

```text
vietnam.pmtiles
      ├─ streets.json
      ├─ light.json
      ├─ dark.json
      ├─ topo.json
      └─ planning.json
```

## 8. Zoom strategy

Đề xuất:

```text
z0–z4   Natural Earth / dữ liệu tổng quát
z5–z9   OSM tổng quát hóa
z10–z14 OSM chi tiết vừa
z15+    đường, công trình, địa chỉ, POI chi tiết
```

Không nên dùng geometry quá chi tiết ở zoom thấp.

## 9. Pipeline production

```text
vietnam-latest.osm.pbf
        +
Natural Earth
        +
DEM
        +
Vietnam authoritative/open datasets
        ↓
ETL
        ↓
normalize geometry
normalize Vietnamese names
QA topology
QA encoding UTF-8
QA disputed metadata
        ↓
PostGIS + GPKG archive
        ↓
MVT / PMTiles / COG
        ↓
Object Storage
        ↓
CDN
        ↓
MapLibre styles
        ↓
Vietflex OpenMap
```

## 10. PMTiles cho phân phối tĩnh

PMTiles phù hợp khi muốn:

- một file archive thay vì hàng triệu tile files;
- phục vụ qua HTTP Range Request;
- dùng object storage/CDN;
- giảm nhu cầu tile server 24/7;
- dễ version hóa theo ngày phát hành.

Tên file nên có version:

```text
vietnam-2026-09.pmtiles
vietnam-2026-10.pmtiles
```

Alias production:

```text
vietnam-latest.pmtiles
```

## 11. PostGIS cho dữ liệu động

Không đưa mọi thứ vào PMTiles.

PostGIS phù hợp cho:

- dữ liệu cập nhật thường xuyên;
- query theo thuộc tính;
- routing;
- geocoding;
- dữ liệu IoT;
- dữ liệu người dùng;
- lớp quy hoạch cần truy vấn;
- phân tích không gian.

Mô hình kết hợp:

```text
PMTiles = nền tĩnh/tần suất cập nhật thấp
PostGIS = dữ liệu động/query
GeoJSON = feature nhỏ/tạm thời
COG = raster lớn
```

## 12. QA tiếng Việt

Trước mỗi release nên chạy kiểm tra tự động:

```text
UTF-8 hợp lệ
không mojibake
không mất dấu
name:vi không rỗng cho feature bắt buộc
không trùng nhãn bất thường
không ký tự replacement �
không chuỗi Latin hóa nếu đã có name:vi
```

Danh sách QA bắt buộc nên gồm ít nhất:

```text
Việt Nam
Hà Nội
Thành phố Hồ Chí Minh
Đà Nẵng
Hải Phòng
Cần Thơ
Biển Đông
Quần đảo Hoàng Sa
Quần đảo Trường Sa
```

## 13. Versioning

Khuyến nghị semantic versioning cho SDK:

```text
Vietflex OpenMap 0.x → thử nghiệm
1.x → API ổn định
```

Dữ liệu dùng version riêng:

```text
schema: 1.0
basemap-data: 2026.09
styles: 1.0
sdk: 0.2.0
```

Không buộc version dữ liệu phải trùng version SDK.

## 14. Mục tiêu cuối

```text
OSM + dữ liệu mở/cấp phép
        ↓
Vietflex Vietnamese Data Core
        ↓
PostGIS/GPKG
        ↓
Shortbread/Vietflex Schema
        ↓
PMTiles/MVT/COG
        ↓
Vietflex CDN
        ↓
MapLibre
        ↓
Vietflex OpenMap SDK
        ↓
Nhiều WebGIS dùng chung
```

Đây là kiến trúc giúp thay engine, style, storage hoặc nguồn dữ liệu mà không phải xây lại toàn bộ hệ thống.
