# Keep D1

Keep D1 là ứng dụng ghi chú đơn giản chạy trên Cloudflare Pages, sử dụng Pages Functions làm API và Cloudflare D1 làm cơ sở dữ liệu SQLite serverless.

Ứng dụng cho phép người dùng nhập một `code` riêng để mở không gian ghi chú tương ứng. Mỗi ghi chú được lưu theo `code`, có thể xem danh sách, thêm mới, chỉnh sửa và xóa thông qua giao diện web trong `public/index.html`.

## Công nghệ sử dụng

- Cloudflare Pages để phục vụ giao diện tĩnh.
- Cloudflare Pages Functions cho các API trong thư mục `functions/api`.
- Cloudflare D1 để lưu dữ liệu ghi chú.
- Wrangler để chạy local, thao tác D1 và triển khai.

## Cấu trúc dự án

```text
.
├── functions/api/keeps.js       # API lấy danh sách và tạo ghi chú
├── functions/api/keeps/[id].js  # API cập nhật và xóa ghi chú
├── public/index.html            # Giao diện chính của ứng dụng
├── schema.sql                   # Schema cho bảng keeps
├── wrangler.toml                # Cấu hình Cloudflare Pages và D1
├── package.json                 # Thông tin package và dependency Wrangler
└── readme.md
```

## Yêu cầu

- Node.js 18 trở lên.
- npm.
- Tài khoản Cloudflare nếu muốn triển khai lên Cloudflare Pages/D1.

## Cài đặt

Cài dependency của dự án:

```bash
npm install
```

## Khởi tạo database local

Tạo bảng `keeps` cho D1 local bằng file `schema.sql`:

```bash
npx wrangler d1 execute keep_db --local --file=./schema.sql
```

Trong code, API cũng có hàm tự đảm bảo schema khi có request. Tuy vậy, chạy lệnh trên giúp database local sẵn sàng trước khi mở ứng dụng.

## Chạy dự án ở local

Chạy Cloudflare Pages dev server và bind D1 vào biến `DB`:

```bash
npx wrangler pages dev public --d1 DB
```

Sau khi server khởi động, mở địa chỉ local mà Wrangler hiển thị, thường là:

```text
http://localhost:8788
```

Nhập một `code` bất kỳ, ví dụ `ca-nhan`, để tạo không gian ghi chú. Có thể chia sẻ link có query `?code=ca-nhan` để mở lại cùng nhóm ghi chú.

## API

Các API chính:

- `GET /api/keeps?code=<code>`: lấy danh sách ghi chú theo code.
- `POST /api/keeps`: tạo ghi chú mới. Body JSON gồm `title` và `code`.
- `PUT /api/keeps/:id`: cập nhật ghi chú. Body JSON gồm `title`, `completed` và `code`.
- `DELETE /api/keeps/:id?code=<code>`: xóa ghi chú theo id và code.

Ví dụ tạo ghi chú:

```bash
curl -X POST http://localhost:8788/api/keeps \
  -H "Content-Type: application/json" \
  -d '{"title":"Ghi chú đầu tiên","code":"ca-nhan"}'
```

## Triển khai

Trước khi triển khai, kiểm tra lại cấu hình D1 trong `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "keep_db"
database_id = "..."
```

Nếu dùng database Cloudflare D1 khác, cập nhật `database_name` và `database_id` tương ứng.

Sau đó có thể triển khai bằng Wrangler:

```bash
npx wrangler pages deploy public
```
