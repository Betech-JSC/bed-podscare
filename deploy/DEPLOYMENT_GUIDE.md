# HƯỚNG DẪN CẤU HÌNH TÊN MIỀN `fixo.com.vn` & WEBSOCKET REALTIME (LARAVEL REVERB)

Tài liệu này tổng hợp toàn bộ các bước cấu hình kết nối tên miền và hệ thống thời gian thực cho **PodsCare Repair OS**:
- **Frontend (Next.js 14/15 App Router)**: Triển khai trên **Vercel** (`https://fixo.com.vn` & `https://www.fixo.com.vn`).
- **Backend API (Laravel 11)** & **WebSocket (Laravel Reverb)**: Triển khai trên **VPS Long Vân** (`https://api.fixo.com.vn` & `wss://api.fixo.com.vn`).
- **Địa chỉ IP VPS**: `103.48.84.51`.

---

## 1. TẠI SAO PHẢI TÁCH SUBDOMAIN `api.fixo.com.vn`?
Hiện tại trên trang quản trị DNS Long Vân:
- `@` (A record) đang trỏ về `103.48.84.51`
- `www` (A record) đang trỏ về `103.48.84.51`

**Vấn đề:** Vercel và VPS là 2 hạ tầng máy chủ hoàn toàn độc lập:
1. Frontend Next.js nằm trên hạ tầng đám mây toàn cầu của Vercel (IP Anycast: `76.76.21.21`).
2. Backend Laravel và tiến trình WebSocket (Port 8080) nằm trên máy chủ VPS của bạn (`103.48.84.51`).

Nếu để cả `@` và `www` trỏ về VPS, người dùng khi vào `fixo.com.vn` sẽ chỉ gửi request đến VPS (báo lỗi Nginx 404/502), còn Vercel không bao giờ nhận được lượng truy cập!

**Giải pháp chuẩn doanh nghiệp:**
- `fixo.com.vn` và `www.fixo.com.vn` -> Trỏ về **Vercel**.
- `api.fixo.com.vn` -> Trỏ về **VPS** (`103.48.84.51`).

---

## 2. BƯỚC 1: CẤU HÌNH BẢN GHI DNS TRÊN LONG VÂN

Đăng nhập vào trang quản lý DNS của Long Vân và cập nhật bảng ghi chính xác như sau:

| Tên (Host / Name) | Loại bản ghi (Type) | Giá trị / Nội dung (Content / Points to) | TTL | Mục đích |
| :--- | :---: | :--- | :---: | :--- |
| `@` | **A** | `76.76.21.21` | 300 (hoặc mặc định) | Trỏ trang chính `fixo.com.vn` về Vercel |
| `www` | **CNAME** | `cname.vercel-dns.com` | 300 | Trỏ `www.fixo.com.vn` về Vercel (hoặc dùng Type A `76.76.21.21`) |
| `api` | **A** | `103.48.84.51` | 300 | Trỏ Backend API & WebSocket Reverb về VPS |

> **Lưu ý**: Sau khi lưu, DNS mất từ 1 đến 5 phút để phân giải trên toàn cầu.

---

## 3. BƯỚC 2: THÊM DOMAIN TRÊN VERCEL DASHBOARD

1. Đăng nhập vào [Vercel Dashboard](https://vercel.com/) -> Chọn Project PodsCare (`bed-podscare`).
2. Vào tab **Settings** -> **Domains**.
3. Thêm domain: `fixo.com.vn` -> Nhấn **Add**.
4. Vercel sẽ gợi ý thêm cả `www.fixo.com.vn` (Recommended: Redirect `www.fixo.com.vn` to `fixo.com.vn`) -> Chọn đồng ý.
5. Chờ vài phút để Vercel tự động kiểm tra bản ghi DNS và cấp phát chứng chỉ SSL miễn phí. Khi trạng thái hiện dấu tích xanh **Valid Configuration** là thành công.

---

## 4. BƯỚC 3: CẤU HÌNH NGINX & SSL CERTBOT TRÊN VPS (`103.48.84.51`)

SSH vào VPS của bạn:
```bash
ssh root@103.48.84.51
```

### 3.1. Cài đặt Certbot (nếu chưa có)
```bash
apt update
apt install -y nginx certbot python3-certbot-nginx supervisor
```

### 3.2. Cấp chứng chỉ SSL Let's Encrypt cho `api.fixo.com.vn`
Chỉ cần chạy 1 dòng lệnh duy nhất:
```bash
certbot certonly --nginx -d api.fixo.com.vn --non-interactive --agree-tos -m admin@fixo.com.vn
```
*(Thay `admin@fixo.com.vn` bằng email của bạn để nhận thông báo gia hạn SSL tự động).*

### 3.3. Áp dụng file cấu hình Nginx
Copy nội dung từ file `deploy/nginx/api.fixo.com.vn.conf` vào `/etc/nginx/sites-available/api.fixo.com.vn`:
```bash
nano /etc/nginx/sites-available/api.fixo.com.vn
```
Kích hoạt site và kiểm tra cú pháp Nginx:
```bash
ln -sf /etc/nginx/sites-available/api.fixo.com.vn /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 5. BƯỚC 4: CẤU HÌNH & KHỞI CHẠY LARAVEL REVERB TRÊN VPS

Trong thư mục chứa source code backend trên VPS (`/var/www/bed-podscare/apps/api`):

### 4.1. Cài đặt thư viện Reverb
```bash
cd /var/www/bed-podscare/apps/api
composer require laravel/reverb
```

### 4.2. Cấu hình file `.env` trên VPS
Mở file `.env`:
```bash
nano .env
```
Đảm bảo các giá trị sau đã được cập nhật:
```env
APP_URL=https://api.fixo.com.vn

BROADCAST_CONNECTION=reverb

REVERB_APP_ID=podscare_app
REVERB_APP_KEY=podscare_reverb_key
REVERB_APP_SECRET=podscare_reverb_secret
REVERB_HOST="api.fixo.com.vn"
REVERB_PORT=443
REVERB_SCHEME=https

REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080

CORS_ALLOWED_ORIGINS=https://fixo.com.vn,https://www.fixo.com.vn,https://app.fixo.com.vn,https://bed-podscare.vercel.app,http://localhost:3000,http://127.0.0.1:3000
```

Xóa cache cấu hình Laravel:
```bash
php artisan config:clear
php artisan cache:clear
```

### 4.3. Cấu hình Supervisor để Reverb luôn chạy nền
Tạo file `/etc/supervisor/conf.d/reverb.conf` (copy từ `deploy/supervisor/reverb.conf`):
```bash
cat << 'EOF' > /etc/supervisor/conf.d/reverb.conf
[program:reverb]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/bed-podscare/apps/api/artisan reverb:start --host=0.0.0.0 --port=8080
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=1
redirect_stderr=true
stdout_logfile=/var/log/reverb.log
stopwaitsecs=3600

[program:laravel-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/bed-podscare/apps/api/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/log/worker.log
stopwaitsecs=3600
EOF
```

Khởi động Supervisor:
```bash
supervisorctl reread
supervisorctl update
supervisorctl start all
supervisorctl status
```
*Kết quả sẽ hiển thị `reverb_00 RUNNING` và `laravel-worker_00 RUNNING`.*

---

## 6. BƯỚC 5: CẬP NHẬT BIẾN MÔI TRƯỜNG TRÊN VERCEL

Vào **Vercel Dashboard** -> Chọn project -> **Settings** -> **Environment Variables**, thêm/cập nhật các biến:

1. `NEXT_PUBLIC_API_URL` = `https://api.fixo.com.vn`
2. `NEXT_PUBLIC_REVERB_APP_KEY` = `podscare_reverb_key`
3. `NEXT_PUBLIC_REVERB_HOST` = `api.fixo.com.vn`
4. `NEXT_PUBLIC_REVERB_PORT` = `443`
5. `NEXT_PUBLIC_REVERB_SCHEME` = `https`

Sau đó vào tab **Deployments** -> Bấm vào lần deploy gần nhất -> Chọn **Redeploy** (hoặc push commit mới lên Git) để Vercel build lại với các biến môi trường mới.

---

## 7. BƯỚC 6: KIỂM TRA KẾT NỐI REALTIME (VERIFICATION)

1. Mở trình duyệt truy cập: `https://fixo.com.vn`.
2. Bấm phím `F12` mở DevTools -> Chuyển sang tab **Network** -> Lọc theo **WS** (WebSocket).
3. Bạn sẽ thấy 1 kết nối WebSocket thành công:
   - URL: `wss://api.fixo.com.vn/app/podscare_reverb_key?...`
   - Status: `101 Switching Protocols`.
   - Frames: Thấy các gói tin `{"event":"pusher:connection_established",...}` và định kỳ `{"event":"pusher:ping"}` -> `{"event":"pusher:pong"}`.
4. Thử tạo đơn hàng mới hoặc chuyển trạng thái đơn hàng trên một tab khác -> Ngay lập tức chuông "ting ting" vang lên và quả chuông góc phải sáng đèn thông báo!
