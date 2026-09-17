# Vietflex Core Tech 0.5.0 — Migration từ 0.4.x

## Tương thích

Các namespace cũ vẫn giữ:

```js
Vietflex.CoreTech
Vietflex.Platform

CoreTech.Schema
CoreTech.Capability
CoreTech.Event
CoreTech.Domain
CoreTech.Data
CoreTech.Spatial
CoreTech.Temporal
CoreTech.Adapters
CoreTech.Gateways
CoreTech.SDK
CoreTech.Plugins
```

Alias cũ tiếp tục có:

```js
CoreTech.Storage
CoreTech.TimeEvent
CoreTech.MobilityIoT
CoreTech.GeoAI
CoreTech.ServiceSDK
```

## API mới

```js
CoreTech.SpatialContext
CoreTech.Route
CoreTech.Watch
CoreTech.Knowledge
```

## Event contract mới

0.4.x:

```text
time
end_time
position
payload
```

0.5.0 canonical:

```text
geometry
severity
status
confidence
time.observed_at
time.valid_from
time.valid_to
time.received_at
time.expires_at
properties
source
provenance
quality
```

`Event.create()` vẫn nhận `position`, `payload`, `time`, `end_time` và normalize sang contract mới.

## Feature contract

`Schema.createFeature()` chuyển sang nested:

```text
time
source
provenance
quality
metadata
```

Schema file vẫn cho phép legacy `source_id`, `observed_at`, `ingested_at` để đọc dữ liệu cũ.

## Gateway

0.4.x dùng logical port `events`.

0.5.0 công bố cụ thể:

```text
sse
mqtt
```

và vẫn giữ `events` trong runtime `GatewayCore.ports` để tương thích.

## Khuyến nghị migration

Không đổi app ngay lập tức. Thực hiện theo thứ tự:

1. pin Core Tech 0.5.0;
2. chuyển dữ liệu động về `vf.event`;
3. đăng ký dataset với `Data.registerDataset`;
4. dùng `SpatialContext` thay logic nearby/on-route lặp lại trong app;
5. đưa routing backend vào adapter/capability `routing.route`;
6. dùng `Watch` cho condition matching;
7. dùng `Knowledge` cho historical/risk profile;
8. sau cùng expose cùng capability qua API/MCP/SSE/MQTT.
