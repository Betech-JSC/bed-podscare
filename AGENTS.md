# AGENTS.md (Project Rules & Multi-Agent Reflex)

> File quy tắc dự án cho Antigravity. Áp dụng mức ưu tiên cao nhất (Priority 1) cho workspace này.

---

## 🛑 1. NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI (STRICT SAFE GUARD)

Mọi agent (kể cả Main Agent lẫn Subagents) BẮT BUỘC tuân thủ nghiêm ngặt 3 điều cấm sau:
1. **CẤM TỰ Ý XÓA FILE**: Tuyệt đối không được xóa bất kỳ file hoặc thư mục nào (`rm`, file deletion tools) khi chưa lập Implementation Plan và được người dùng bấm phê duyệt rõ ràng.
2. **CẤM TỰ Ý THAY ĐỔI / CHỈNH SỬA DATABASE**:
   - Nghiêm cấm chạy các lệnh làm mất/thay đổi dữ liệu (drop table, truncate, alter column phá hủy dữ liệu, `migrate:fresh`, `db:seed` ghi đè data thật) khi chưa có sự chấp thuận rõ ràng của người dùng.
   - Thao tác trực tiếp vào DB production/staging bắt buộc phải yêu cầu phê duyệt riêng từng câu lệnh.
3. **CẤM TỰ Ý THAY ĐỔI CẤU TRÚC KIẾN TRÚC**:
   - Không tự ý tái cấu trúc (refactor lớn), di chuyển thư mục, hoặc thay đổi quy chuẩn kiến trúc hiện tại của dự án nếu chưa thống nhất trong kế hoạch.

---

## 🔍 2. NGUYÊN TẮC BẰNG CHỨNG 100% (EVIDENCE-BASED & ZERO-HALLUCINATION)

1. **BÁO CÁO 100% PHẢI CÓ BẰNG CHỨNG THẬT**:
   - Mọi kết luận "PASS", "Build thành công", "Đã sửa xong" BẮT BUỘC phải đính kèm:
     - Output thật từ terminal test runner (`php artisan test`, `npm test`, `pytest`, `go test`...).
     - Log build thật (`npm run build`, `composer check`...).
     - Ảnh chụp màn hình (screenshot) hoặc log thao tác từ trình duyệt thật qua Playwright MCP.
2. **CẤM SUY LUẬN MÙ / PHỎNG ĐOÁN**:
   - Tuyệt đối không dùng các từ ngữ cảm tính, mơ hồ: *"chắc là đã đúng"*, *"có lẽ đã chạy được"*, *"về mặt lý thuyết là hoàn thành"*. Chưa thực thi lệnh thật thì KHÔNG ĐƯỢC kết luận.
3. **NGUYÊN TẮC XÁC THỰC (ZERO-ASSUMPTION)**:
   - Khi gặp trường hợp thiếu API schema, contract không rõ ràng, workflow chưa tường minh hoặc thiếu thông tin cấu hình: **BẮT BUỘC DỪNG LẠI HỎI NGƯỜI DÙNG**.
   - Tuyệt đối không tự bịa đặt dữ liệu (mock lung tung), không tự đoán mò response của bên thứ ba nếu chưa đối chiếu code hoặc hỏi người dùng.
4. **BÁO CÁO TRUNG THỰC**:
   - Nếu không thể kiểm tra (do thiếu credentials, môi trường chưa bật, thiếu quyền), phải báo cáo rõ: *"Không thể verify bước X vì thiếu lý do Y"*, cấm tự động đánh dấu là PASS.

---

## 🤖 3. CƠ CHẾ TỰ ĐỘNG SPAWN SUBAGENTS (BẮT BUỘC)

### ⚠️ QUY TẮC PHẢN XẠ BẮT BUỘC (MANDATORY REFLEX RULE)
Khi nhận bất kỳ yêu cầu nào có từ 2 bước trở lên, hoặc yêu cầu test, code, kiểm tra tính năng:
1. **Main Agent TUYỆT ĐỐI CẤM tự chạy lệnh test (`run_command`), cấm tự sửa code trên luồng chính.**
2. **HÀNH ĐỘNG BẮT BUỘC ĐẦU TIÊN**: Main Agent **PHẢI GỌI NGAY TOOL `invoke_subagent`** để đẩy việc sang Subagent:
   - Sử dụng `TypeName: "self"`
   - Đặt `Role` tương ứng: `"Backend Worker"`, `"Frontend Worker"`, `"Independent Tester"`, hoặc `"QA Verifier"`.
   - Viết `Prompt` rõ ràng cho Subagent thực hiện.
3. **Hiển thị trực quan**: Người dùng cần theo dõi tiến trình trực quan trên thanh `Subagents` của giao diện Antigravity. Việc tự làm trên luồng chính mà không gọi `invoke_subagent` là **VI PHẠM QUY TRÌNH NGHIÊM TRỌNG**.

### Quy trình phân chia Subagents tự động:
- **Bước 1 (Lập plan nếu cần)**: Main Agent lập Implementation Plan nếu task rủi ro (đụng DB/xóa file/đổi cấu trúc).
- **Bước 2 (Code)**: Gọi `invoke_subagent` (Role: "Backend Worker" hoặc "Frontend Worker").
- **Bước 3 (Test độc lập)**: Với task rủi ro cao hoặc có yêu cầu test kỹ, gọi `invoke_subagent` (Role: "Independent Tester") để tự viết test case và chạy test độc lập.
- **Bước 4 (QA Browser)**: Gọi `invoke_subagent` (Role: "QA Verifier") dùng Playwright MCP mở Chrome thật kiểm tra UI và DB.
- **Bước 5 (Tổng hợp)**: Main Agent nhận kết quả từ các Subagents và tổng hợp báo cáo cho người dùng.
