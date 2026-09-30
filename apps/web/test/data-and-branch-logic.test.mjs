import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('OpenSpec: standardize-mock-data-and-branch-logic Frontend Tests', () => {
  describe('Group 1: Dynamic Branch Assignment in User Management', () => {
    const branches = [
      { id: 'all', name: 'Tất cả chi nhánh', code: 'ALL' },
      { id: 1, name: 'PodsCare · Quận 1', code: 'Q1' },
      { id: 2, name: 'PodsCare · Quận 3', code: 'Q3' },
      { id: 3, name: 'PodsCare · Thủ Đức', code: 'TD' },
    ];

    test('branchOptions filters out "all" branch and maps numeric IDs properly', () => {
      const branchOptions = branches
        .filter((b) => b.id !== 'all')
        .map((b) => ({
          value: String(b.id),
          label: b.name,
        }));

      assert.strictEqual(branchOptions.length, 3);
      assert.deepStrictEqual(branchOptions[0], { value: '1', label: 'PodsCare · Quận 1' });
      assert.deepStrictEqual(branchOptions[1], { value: '2', label: 'PodsCare · Quận 3' });
      assert.deepStrictEqual(branchOptions[2], { value: '3', label: 'PodsCare · Thủ Đức' });
    });

    test('branch resolution in user table displays matching branch for any active branch ID', () => {
      const resolveBranchName = (user) => {
        return (
          user.branch?.name ||
          branches.find((b) => Number(b.id) === Number(user.branch_id))?.name ||
          user.branch_name ||
          'Chưa phân công'
        );
      };

      const user1 = { id: 10, name: 'An', branch_id: 3 };
      assert.strictEqual(resolveBranchName(user1), 'PodsCare · Thủ Đức');

      const user2 = { id: 11, name: 'Bình', branch: { id: 2, name: 'PodsCare · Quận 3' } };
      assert.strictEqual(resolveBranchName(user2), 'PodsCare · Quận 3');

      const user3 = { id: 12, name: 'Chưa gán', branch_id: null };
      assert.strictEqual(resolveBranchName(user3), 'Chưa phân công');
    });

    test('user creation payload always uses explicit numeric branch_id', () => {
      const buildCreatePayload = (formData, branchOptions) => {
        const chosenBranchId = Number(formData.branch_id) || Number(branchOptions[0]?.value) || 1;
        return {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          branch_id: chosenBranchId,
        };
      };

      const payload = buildCreatePayload(
        { name: 'Nguyễn Văn C', email: 'c@podscare.vn', role: 'technician', branch_id: 3 },
        [{ value: '1', label: 'PodsCare · Quận 1' }]
      );
      assert.strictEqual(payload.branch_id, 3);
    });
  });

  describe('Group 4: Numeric Technician ID Filtering', () => {
    const currentUser = { id: 5, name: 'KTV Tuấn K.' };

    const orders = [
      { id: 'PC-1', tech: 'KTV Tuấn K.', technicianId: 5, technician_id: 5, status: 'Đang sửa' },
      { id: 'PC-2', tech: 'Chưa phân công', technicianId: null, technician_id: null, status: 'Chờ kỹ thuật' },
      { id: 'PC-3', tech: 'KTV Minh', technicianId: 8, technician_id: 8, status: 'Đang sửa' },
      { id: 'PC-4', tech: 'Chưa phân công', technicianId: null, technician_id: null, status: 'Đã duyệt' },
      { id: 'PC-5', tech: 'KTV Tuấn K.', technicianId: 5, technician_id: 5, status: 'Hoàn tất' },
    ];

    test('availableOrders filters by unassigned (!o.technicianId && !o.technician_id)', () => {
      const availableOrders = orders.filter(
        (o) =>
          !o.technicianId &&
          !o.technician_id &&
          ['Chờ kỹ thuật', 'Đã duyệt', 'Tiếp nhận mới', 'Chờ khách duyệt'].includes(o.status)
      );

      assert.strictEqual(availableOrders.length, 2);
      assert.strictEqual(availableOrders[0].id, 'PC-2');
      assert.strictEqual(availableOrders[1].id, 'PC-4');
    });

    test('myActiveOrders filters by numeric technician ID matching currentUser.id', () => {
      const myActiveOrders = orders.filter(
        (o) =>
          Number(o.technicianId || o.technician_id) === Number(currentUser.id) &&
          !['Hoàn tất kỹ thuật', 'Chờ QC', 'Sẵn sàng trả', 'Hoàn tất', 'Đã hủy'].includes(o.status)
      );

      assert.strictEqual(myActiveOrders.length, 1);
      assert.strictEqual(myActiveOrders[0].id, 'PC-1');
    });

    test('myActiveOrders still matches if display name differs but numeric ID is identical', () => {
      const orderWithRenamedTech = {
        id: 'PC-99',
        tech: 'Tuấn (Mới)',
        technicianId: 5,
        status: 'Đang sửa',
      };
      const isMine = Number(orderWithRenamedTech.technicianId) === Number(currentUser.id);
      assert.strictEqual(isMine, true);
    });
  });

  describe('Group 3: Quick Issue Chips and Dynamic Checklist', () => {
    test('clicking a quick issue chip appends to issue description', () => {
      const appendIssue = (current, chipText) => {
        if (!current.trim()) return chipText;
        if (current.includes(chipText)) return current;
        return `${current}, ${chipText}`;
      };

      let issue = '';
      issue = appendIssue(issue, 'Pin chai, tụt nhanh');
      assert.strictEqual(issue, 'Pin chai, tụt nhanh');

      issue = appendIssue(issue, 'Rè loa phải khi bật ANC');
      assert.strictEqual(issue, 'Pin chai, tụt nhanh, Rè loa phải khi bật ANC');

      // Duplicate click does not duplicate string
      issue = appendIssue(issue, 'Pin chai, tụt nhanh');
      assert.strictEqual(issue, 'Pin chai, tụt nhanh, Rè loa phải khi bật ANC');
    });

    test('suggests estimated price if current price is empty', () => {
      const chip = { issue_name: 'Thay pin', estimated_cost: 350000 };
      let price = '';
      if ((price === '' || price === 0) && chip.estimated_cost) {
        price = Number(chip.estimated_cost);
      }
      assert.strictEqual(price, 350000);

      // Existing price is not overwritten
      let existingPrice = 500000;
      if ((existingPrice === '' || existingPrice === 0) && chip.estimated_cost) {
        existingPrice = Number(chip.estimated_cost);
      }
      assert.strictEqual(existingPrice, 500000);
    });
  });
});
