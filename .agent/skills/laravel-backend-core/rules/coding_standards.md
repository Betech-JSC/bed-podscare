# Quy chuẩn Coding Standards (PHP 8.1+ & Laravel)

Tài liệu quy định chi tiết phong cách lập trình, quy ước đặt tên và các nguyên tắc Clean Code áp dụng bắt buộc cho tầng Backend.

---

## 💎 1. Phiên bản & Chuẩn Cú pháp (PHP 8.1+)

1. **Tuân thủ chuẩn PSR-12**: Thụt lề 4 spaces, dấu ngoặc nhọn mở trên dòng mới cho class/function, camelCase cho methods, snake_case cho biến nội bộ/cột DB.
2. **Khai báo `declare(strict_types=1);`**: Khuyến khích ở đầu các file Service, Helper, DTO để đảm bảo kiểm soát chặt chẽ kiểu dữ liệu.
3. **Typed Properties & Return Types**:
   - Tất cả các thuộc tính class và tham số hàm bắt buộc có type hint rõ ràng.
   - Hàm luôn có return type (kể cả `: void`).
4. **Constructor Promotion**:
   - Sử dụng Constructor Promotion cho việc inject dependencies trong Service và Controller thay vì khai báo thuộc tính và gán thủ công.
   ```php
   // ✅ ĐÚNG: Gọn gàng và an toàn
   class OrderService
   {
       public function __construct(
           private readonly OrderRepository $orders,
           private readonly NotificationService $notifier,
       ) {}
   }

   // ❌ KHÔNG NÊN: Cũ kỹ và dài dòng
   class OrderService
   {
       private $orders;
       private $notifier;

       public function __construct(OrderRepository $orders, NotificationService $notifier)
       {
           $this->orders = $orders;
           $this->notifier = $notifier;
       }
   }
   ```
5. **Readonly Properties / Classes**: Sử dụng `readonly` cho DTOs, Value Objects và injected services để ngăn chặn biến dị trạng thái không mong muốn.

---

## 🏷️ 2. Quy ước Đặt tên (Naming Conventions)

| Thành phần | Quy tắc đặt tên | Ví dụ chuẩn | Lưu ý |
| :--- | :--- | :--- | :--- |
| **Model** | PascalCase (Số ít) | `Order`, `ProductCategory`, `ContactStatusLog` | Không thêm tiền tố `Tbl` hay `M` |
| **Database Table** | snake_case (Số nhiều) | `orders`, `product_categories`, `contact_status_logs` | Luôn là số nhiều tiếng Anh |
| **Service** | PascalCase + `Service` | `OrderWorkflowService`, `SepayService` | Phản ánh đúng nghiệp vụ |
| **Controller** | PascalCase + `Controller` | `OrderController`, `PaymentWebhookController` | Phân tầng rõ ràng Admin/API |
| **FormRequest** | Action + Model + `Request` | `StoreOrderRequest`, `UpdateProductCategoryRequest` | Tách biệt Store và Update |
| **API Resource** | Model + `Resource` | `OrderResource`, `UserDetailResource` | Trả payload JSON có chọn lọc |
| **Route URI** | kebab-case (Số nhiều) | `/orders`, `/product-categories`, `/order-items` | Thân thiện URL, chữ thường |
| **Route Name** | snake_case/kebab-case phân cấp | `orders.index`, `orders.store`, `api.v1.orders.show` | Nhất quán qua dấu chấm |
| **Migration** | `YYYY_MM_DD_HHMMSS_action_table` | `2026_01_01_000000_create_orders_table.php` | Đúng thứ tự thời gian |
| **Job / Event** | PascalCase (Động từ quá khứ / Hành động) | `SendOrderConfirmationMailJob`, `OrderPaidEvent` | Mô tả rõ sự kiện đã/sẽ xảy ra |

---

## 🧹 3. Nguyên tắc Clean Code & Early Return

1. **Early Return (Về sớm để tránh lồng ghép if/else)**:
   - Thay vì lồng nhiều cấp if, kiểm tra các điều kiện thất bại trước và `return` hoặc `throw Exception` ngay lập tức.
   ```php
   // ✅ ĐÚNG: Dễ đọc, giảm cognitive load
   public function cancelOrder(Order $order, User $user): void
   {
       if ($order->isFinished()) {
           throw new DomainException('Đơn hàng đã hoàn tất, không thể hủy.');
       }

       if (!$user->can('cancel', $order)) {
           throw new AuthorizationException('Bạn không có quyền hủy đơn hàng này.');
       }

       $order->update(['status' => Order::STATUS_CANCELLED]);
   }

   // ❌ KHÔNG NÊN: Lồng ghép phức tạp
   public function cancelOrder(Order $order, User $user): void
   {
       if (!$order->isFinished()) {
           if ($user->can('cancel', $order)) {
               $order->update(['status' => Order::STATUS_CANCELLED]);
           } else {
               throw new AuthorizationException();
           }
       } else {
           throw new DomainException();
       }
   }
   ```

2. **Controller Mỏng (Thin Controller Principle)**:
   - Controller chỉ xử lý:
     1. Inject FormRequest đã xác thực.
     2. Gọi hàm nghiệp vụ tương ứng từ Service.
     3. Trả về kết quả qua Resource hoặc `ApiResponse` trait.
   - **CẤM**: Viết query Eloquent phức tạp, tính toán công thức tiền tệ, gọi API bên thứ ba, hay xử lý file upload trực tiếp trong Controller action.

3. **Dependency Injection thay vì Facade lạm dụng**:
   - Khuyến khích truyền dependencies qua constructor để tăng tính kiểm thử (Testability).
   - Với các facades phổ biến của Laravel (`DB`, `Log`, `Cache`), sử dụng đúng mục đích và dễ mock trong Feature Test.
