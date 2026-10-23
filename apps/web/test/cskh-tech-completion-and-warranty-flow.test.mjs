import assert from 'node:assert';
import test, { describe } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FSM_TRANSITIONS,
  TECH_COMPLETABLE_STATUSES,
  TECH_COMPLETION_ALLOWED_ROLES,
  canCompleteTechnicalRepair,
} from '../app/repairs/fsm.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '..');

describe('OpenSpec: enable-cskh-tech-completion-and-warranty-flow (Frontend Verification)', () => {
  test('Task 3.2: fsm.ts defines FSM_TRANSITIONS and canCompleteTechnicalRepair for cskh, tech, and admin', () => {
    const completableStatuses = ['waiting_tech', 'assigned', 'in_repair', 'waiting_parts', 'rework_needed'];
    const allowedRoles = ['cskh', 'tech', 'technician', 'admin', 'super_admin'];

    assert.deepStrictEqual(TECH_COMPLETABLE_STATUSES, completableStatuses);
    for (const role of allowedRoles) {
      assert.ok(TECH_COMPLETION_ALLOWED_ROLES.includes(role), `Role ${role} must be in TECH_COMPLETION_ALLOWED_ROLES`);
    }

    for (const st of completableStatuses) {
      const transitions = FSM_TRANSITIONS[st] || [];
      assert.ok(
        transitions.includes('ready_for_return'),
        `FSM_TRANSITIONS[${st}] must include transition to ready_for_return`
      );

      for (const role of allowedRoles) {
        assert.strictEqual(
          canCompleteTechnicalRepair(st, role),
          true,
          `canCompleteTechnicalRepair('${st}', '${role}') must be true`
        );
      }
    }

    // Non-completable statuses must return false
    for (const nonCompletable of ['inspecting', 'waiting_approval', 'ready_for_return', 'waiting_pickup', 'completed', 'cancelled', 'rejected']) {
      assert.strictEqual(
        canCompleteTechnicalRepair(nonCompletable, 'cskh'),
        false,
        `canCompleteTechnicalRepair('${nonCompletable}', 'cskh') must be false`
      );
    }
  });

  test('Task 3.1: TechOrderDetailModal supports waiting_tech, role-aware technician_id selector, and removes fake-success catch fallbacks', () => {
    const modalPath = path.join(webRoot, 'app/components/TechOrderDetailModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    // 1. TECH_COMPLETABLE_STATUSES includes waiting_tech
    assert.ok(
      content.includes("'waiting_tech'") && content.includes('TECH_COMPLETABLE_STATUSES'),
      'TechOrderDetailModal must include waiting_tech in TECH_COMPLETABLE_STATUSES'
    );

    // 2. Fetches active technicians via userService.getUsers
    assert.ok(
      content.includes('userService') &&
        content.includes(".getUsers({ role: 'technician', is_active: true, per_page: 50 })"),
      'TechOrderDetailModal must fetch active technicians via userService.getUsers'
    );

    // 3. Renders technician selector for CSKH/Admin and validates rawTechId
    assert.ok(
      content.includes('data-testid="tech-modal-technician-select"'),
      'TechOrderDetailModal must render data-testid="tech-modal-technician-select" for CSKH/Admin'
    );
    assert.ok(
      content.includes('Vui lòng chọn kỹ thuật viên thực hiện trước khi hoàn thành sửa chữa.'),
      'TechOrderDetailModal must validate and block submission when CSKH/Admin has not selected a technician'
    );
    assert.ok(
      content.includes('technician_id: resolvedTechnicianId'),
      'TechOrderDetailModal must pass technician_id: resolvedTechnicianId in transition payload'
    );

    // 4. Removes fake-success fallback in catch blocks
    assert.ok(
      !content.includes('Fallback update if API offline'),
      'TechOrderDetailModal must NOT contain fake-success fallback in catch blocks'
    );
    assert.ok(
      content.includes("toast(errMsg, 'error')"),
      'TechOrderDetailModal must display real API error message via toast(errMsg, error)'
    );

    // 5. Warranty alert banner reflects unified auto-QC Pass completion
    assert.ok(
      content.includes('data-testid="tech-modal-warranty-alert"') &&
        content.includes('Nghiệm thu bảo hành: Hệ thống tự động ghi nhận QC Đạt (Pass) khi hoàn thành sửa chữa'),
      'TechOrderDetailModal warranty alert banner must describe unified auto-QC Pass completion'
    );
  });

  test('Task 3.2: repairs/page.tsx exposes "Hoàn thành sửa chữa" action and mounts TechOrderDetailModal without modifying Sidebar permissions', () => {
    const pagePath = path.join(webRoot, 'app/repairs/page.tsx');
    const compDir = path.join(webRoot, 'app/repairs/components');
    const compFiles = fs.existsSync(compDir)
      ? fs.readdirSync(compDir).filter((f) => f.endsWith('.tsx')).map((f) => fs.readFileSync(path.join(compDir, f), 'utf-8'))
      : [];
    const content = [fs.readFileSync(pagePath, 'utf-8'), ...compFiles].join('\n');

    assert.ok(
      content.includes('TechOrderDetailModal'),
      'repairs/page.tsx must import and render TechOrderDetailModal'
    );
    assert.ok(
      content.includes('canCompleteTechnicalRepair'),
      'repairs/page.tsx must use canCompleteTechnicalRepair guard'
    );
    assert.ok(
      content.includes('row-tech-complete-btn-'),
      'repairs/page.tsx must render row action button for Hoàn thành sửa chữa'
    );
    assert.ok(
      content.includes('repairs-quick-tech-complete-btn'),
      'repairs/page.tsx must render quick action button for Hoàn thành sửa chữa in Order Detail Modal'
    );
    assert.ok(
      content.includes('repairs-modal-tech-complete-btn'),
      'repairs/page.tsx must render footer button for Hoàn thành sửa chữa in Order Detail Modal'
    );
  });

  test('Task 3.3: CheckoutHandoverModal supports Stage 2 handover for 0đ warranty orders and preserves original warranty terms', () => {
    const checkoutModalPath = path.join(webRoot, 'app/components/CheckoutHandoverModal.tsx');
    const content = fs.readFileSync(checkoutModalPath, 'utf-8');

    assert.ok(
      content.includes("order.order_type === 'warranty'"),
      'CheckoutHandoverModal must detect order_type === warranty'
    );
    assert.ok(
      content.includes('data-testid="checkout-warranty-free-banner"'),
      'CheckoutHandoverModal must render checkout-warranty-free-banner for warranty orders'
    );
    assert.ok(
      content.includes('data-testid="checkout-warranty-preserve-notice"'),
      'CheckoutHandoverModal must render checkout-warranty-preserve-notice explaining original warranty preservation'
    );
    assert.ok(
      content.includes('warrantyTerm: isWarrantyOrder ? order.warrantyTerm'),
      'CheckoutHandoverModal must preserve original warrantyTerm on warranty orders'
    );
  });

  test('Task 1.1–2.2 & Sidebar Guard: Backend OrderWorkflowService, PaymentController, userService, and AppSidebar contracts', () => {
    const userServicePath = path.resolve(webRoot, '../../packages/api-client/src/services/user.service.ts');
    const userServiceContent = fs.readFileSync(userServicePath, 'utf-8');
    assert.ok(
      userServiceContent.includes('getTechnicians') && userServiceContent.includes("role: 'technician'"),
      'userService must provide getTechnicians / getUsers with role filter'
    );

    const sidebarPath = path.resolve(webRoot, '../../packages/ui/src/organisms/AppSidebar.tsx');
    const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');
    const cskhMatch = sidebarContent.match(/cskh:\s*\[([\s\S]*?)\]/);
    assert.ok(cskhMatch, 'AppSidebar.tsx must define cskh rolePermissions');
    assert.strictEqual(
      cskhMatch[1].includes("'tech'"),
      false,
      'AppSidebar.tsx must keep CSKH menu unchanged without adding tech to CSKH sidebar'
    );

    const workflowPath = path.resolve(webRoot, '../api/app/Services/OrderWorkflowService.php');
    const workflowContent = fs.readFileSync(workflowPath, 'utf-8');
    assert.ok(
      workflowContent.includes("'waiting_tech'") &&
        workflowContent.includes("'waiting_parts'") &&
        workflowContent.includes("'ready_for_return'"),
      'OrderWorkflowService::ALLOWED_TRANSITIONS must allow ready_for_return from waiting_tech and waiting_parts'
    );
    assert.ok(
      workflowContent.includes('Vui lòng chọn kỹ thuật viên thực hiện trước khi hoàn thành sửa chữa.') &&
        workflowContent.includes('isTechnicianUser'),
      'OrderWorkflowService must enforce valid technician_id and prevent overwriting technician_id with CSKH user ID'
    );
    assert.ok(
      workflowContent.includes("'final_check_result'") &&
        workflowContent.includes("['status' => 'resolved']"),
      'OrderWorkflowService must persist final_check_result and resolve linked WarrantyClaim on completion'
    );
  });
});
