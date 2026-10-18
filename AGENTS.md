# AGENTS.md - Multi-Agent Orchestration & Project Rules

## 🛑 1. NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI (STRICT SAFE GUARD)
1. CẤM TỰ Ý XÓA FILE khi chưa được người dùng phê duyệt rõ ràng.
2. CẤM PHÁ HỦY DATABASE (migrate:fresh, drop, truncate dữ liệu thật).

## 🤖 2. CƠ CHẾ PHẢN XẠ BẮT BUỘC SPAWN SUBAGENTS (MANDATORY REFLEX)
Khi nhận bất kỳ yêu cầu nào có từ 2 bước trở lên, hoặc yêu cầu test, code, sửa lỗi:
1. Main Agent TUYỆT ĐỐI CẤM tự chạy lệnh test, CẤM tự sửa code trên luồng chính.
2. HÀNH ĐỘNG BẮT BUỘC: Main Agent PHẢI GỌI NGAY `invoke_subagent`:
   - Role: "Backend Worker" -> Sửa logic server, API, DB.
   - Role: "Frontend Worker" -> Sửa UI, layout, components.
   - Role: "Independent Tester" -> Tự viết test case và chạy test runner.
   - Role: "QA Verifier" -> Mở trình duyệt thật qua Playwright MCP test thực tế.

## 🧠 3. ĐIỀU HƯỚNG BẰNG GRAPHIFY (TIẾT KIỆM TOKEN)
- Trước khi tìm file, BẮT BUỘC tra cứu AST tại `graphify-out/graph.json`.
- CẤM chạy các lệnh grep quét toàn bộ thư mục bừa bãi.

## ✂️ 4. QUY TẮC PONYTAIL (TỐI GIẢN CODE - YAGNI)
- Tuân thủ nghiêm ngặt YAGNI: Không tạo wrapper/helper thừa.
- Giữ git diff dưới 20 dòng đối với các bug fix nhỏ.

## 🔍 5. BẰNG CHỨNG THẬT (EVIDENCE-BASED)
- Báo cáo 100% phải có output thật từ terminal runner hoặc log trình duyệt. Cấm suy luận cảm tính.
