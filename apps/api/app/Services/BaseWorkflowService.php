<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * BaseWorkflowService - Lớp nền tảng cho mọi State Machine Service quản lý vòng đời trạng thái:
 * 1. Chống Race Condition bằng Optimistic Locking (so khớp expected_updated_at).
 * 2. Xác thực bước chuyển hợp lệ thông qua ma trận ALLOWED_TRANSITIONS.
 * 3. Đảm bảo toàn vẹn dữ liệu qua DB::transaction().
 * 4. Tự động ghi chép Audit Log lịch sử thay đổi.
 * 5. Cung cấp hooks mở rộng: beforeTransition, afterTransition, handleSideEffects.
 */
abstract class BaseWorkflowService
{
    /**
     * Ma trận định nghĩa các bước chuyển trạng thái hợp lệ.
     * Cấu trúc: [ CURRENT_STATUS => [ ALLOWED_NEXT_STATUS_1, ALLOWED_NEXT_STATUS_2, ... ] ]
     */
    public const ALLOWED_TRANSITIONS = [];

    /**
     * Tên class Model Audit Log tương ứng (VD: \App\Models\OrderStatusLog::class).
     * Nếu null, service sẽ bỏ qua bước ghi log này.
     */
    protected ?string $logModel = null;

    /**
     * Tên cột khóa ngoại tham chiếu trong bảng Audit Log (VD: 'order_id', 'contact_id').
     */
    protected string $foreignKeyName = 'model_id';

    /**
     * Thực hiện chuyển trạng thái một cách an toàn và ghi nhận log.
     *
     * @param Model $model Đối tượng Eloquent cần chuyển đổi trạng thái
     * @param string $newStatus Trạng thái mới đích đến
     * @param array $options Các tùy chọn:
     *        - expected_updated_at: Timestamp lúc client mở form để kiểm tra Optimistic Locking
     *        - reason: Lý do chuyển trạng thái
     *        - note: Ghi chú nội bộ
     *        - admin_id: ID người thực hiện
     *        - admin_name: Tên người thực hiện
     *        - ip: Địa chỉ IP
     *        - user_agent: Thông tin trình duyệt
     * @return Model
     * @throws ConflictHttpException Khi có xung đột cập nhật đồng thời
     * @throws \DomainException Khi bước chuyển trạng thái không hợp lệ theo quy tắc nghiệp vụ
     */
    public function transition(Model $model, string $newStatus, array $options = []): Model
    {
        $currentStatus = (string) $model->status;

        // Nếu trạng thái đích trùng với trạng thái hiện tại -> Không cần làm gì
        if ($currentStatus === $newStatus) {
            return $model;
        }

        // 1. Kiểm tra Optimistic Locking (chống 2 người cùng sửa một bản ghi)
        $this->checkOptimisticLock($model, $options['expected_updated_at'] ?? null);

        // 2. Kiểm tra tính hợp lệ của bước chuyển theo ma trận
        $this->validateTransition($currentStatus, $newStatus);

        // 3. Thực thi nghiệp vụ chuyển đổi bên trong DB Transaction
        return DB::transaction(function () use ($model, $currentStatus, $newStatus, $options) {
            // Hook tiền xử lý
            $this->beforeTransition($model, $currentStatus, $newStatus, $options);

            // Cập nhật trạng thái mới
            $model->status = $newStatus;
            $model->save();

            // Ghi nhận Audit Log
            $this->recordAuditLog($model, $currentStatus, $newStatus, $options);

            // Hook hậu xử lý (side effects, dispatch jobs, notifications)
            $this->afterTransition($model, $currentStatus, $newStatus, $options);
            $this->handleSideEffects($model, $currentStatus, $newStatus, $options);

            return $model->fresh();
        });
    }

    /**
     * So khớp timestamp của client gửi lên với timestamp thực tế trong CSDL.
     */
    protected function checkOptimisticLock(Model $model, ?string $expectedUpdatedAt): void
    {
        if (empty($expectedUpdatedAt) || !$model->updated_at) {
            return;
        }

        $expectedTimestamp = Carbon::parse($expectedUpdatedAt)->timestamp;
        $actualTimestamp = $model->updated_at->timestamp;

        if ($expectedTimestamp !== $actualTimestamp) {
            throw new ConflictHttpException(
                'Dữ liệu vừa được cập nhật bởi một người dùng khác. Vui lòng tải lại trang để xem thông tin mới nhất.'
            );
        }
    }

    /**
     * Xác thực xem bước chuyển trạng thái có nằm trong ALLOWED_TRANSITIONS hay không.
     */
    public function validateTransition(string $fromStatus, string $toStatus): void
    {
        $matrix = static::ALLOWED_TRANSITIONS;

        // Nếu không định nghĩa ma trận, mặc định cho phép chuyển tự do
        if (empty($matrix)) {
            return;
        }

        $allowedNextStatuses = $matrix[$fromStatus] ?? [];

        if (!in_array($toStatus, $allowedNextStatuses, true)) {
            throw new \DomainException(
                "Không được phép chuyển trạng thái từ [{$fromStatus}] sang [{$toStatus}]."
            );
        }
    }

    /**
     * Lấy danh sách các trạng thái tiếp theo được phép chuyển từ trạng thái hiện tại.
     */
    public function getNextAllowedStatuses(string $currentStatus): array
    {
        return static::ALLOWED_TRANSITIONS[$currentStatus] ?? [];
    }

    /**
     * Ghi nhận lịch sử chuyển trạng thái vào bảng Audit Log.
     */
    protected function recordAuditLog(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        if (!$this->logModel || !class_exists($this->logModel)) {
            return;
        }

        $adminId = $options['admin_id'] ?? (auth()->check() ? auth()->id() : null);
        $adminName = $options['admin_name'] ?? (auth()->check() ? (auth()->user()?->name ?? 'User #' . $adminId) : 'Hệ thống');

        $logData = [
            $this->foreignKeyName => $model->getKey(),
            'old_status'          => $oldStatus,
            'new_status'          => $newStatus,
            'changed_by'          => $adminId,
            'admin_name'          => $adminName,
            'reason'              => $options['reason'] ?? null,
            'note'                => $options['note'] ?? null,
            'ip_address'          => $options['ip'] ?? request()->ip(),
            'user_agent'          => $options['user_agent'] ?? request()->userAgent(),
        ];

        ($this->logModel)::create($logData);
    }

    /**
     * Hook gọi trước khi lưu trạng thái mới vào CSDL.
     */
    protected function beforeTransition(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        // Ghi đè tại Service con nếu cần validate thêm
    }

    /**
     * Hook gọi ngay sau khi cập nhật thành công trạng thái vào CSDL.
     */
    protected function afterTransition(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        // Ghi đè tại Service con nếu cần cập nhật các trường liên quan (VD: paid_at, completed_at)
    }

    /**
     * Kích hoạt các tác vụ nền (Queue Jobs, Gửi thông báo, Tạo chứng từ).
     */
    protected function handleSideEffects(Model $model, string $oldStatus, string $newStatus, array $options): void
    {
        // Ghi đè tại Service con
    }
}
