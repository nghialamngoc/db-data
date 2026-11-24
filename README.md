# Mongo Lead Viewer

Công cụ cục bộ để xem document trong MongoDB: dán connection string → chọn tab collection → nhập id → xem full document dạng cây (giống Mongo Compass).

Kết nối Mongo chạy **phía server**, nên phải chạy tool trên **máy đã được allowlist IP vào Atlas** (ví dụ máy ảo). Browser không nối thẳng Mongo được.

## Chạy

```bash
cd mongo-lead-viewer
npm install
npm start           # mở http://127.0.0.1:4500
```

Đổi cổng/host nếu cần: `PORT=5000 HOST=0.0.0.0 npm start`.

## Dùng

1. Dán **connection string** (gồm tên db ở cuối, ví dụ `...mongodb.net/d2c-uat`).
2. Tab **Lead** → nhập **leadId** → **Search**.
3. Tool tìm trong collection `leads` theo `_id` (thử ObjectId trước, fallback string) và hiện full document.

## Ghi chú

- Connection string chứa credential: chỉ nhập trên máy của bạn. Checkbox "Nhớ URL" lưu vào `sessionStorage` (mất khi đóng tab); mặc định tắt.
- Server bind `127.0.0.1` (chỉ localhost). Chỉ mở ra ngoài (`HOST=0.0.0.0`) khi bạn hiểu rủi ro.
- Các tab khác (Email Logs / Policy / Payment) đang để placeholder — thêm sau bằng cách gọi `/api/query` với `collection`/`field` tương ứng.
