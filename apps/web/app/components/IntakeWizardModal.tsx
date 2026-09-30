'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Modal,
  Button,
  Input,
  Select,
  Textarea,
  Checkbox,
  DynamicTestRow,
  PhotoDropzone,
  StepperWidget,
  useToast,
} from '@podscare/ui';
import type {
  ChecklistStatus,
  DevicePhoto,
  IntakeCheckItem,
  RepairOrder,
} from '@podscare/types';
import { repairService, deviceService } from '@podscare/api-client';
import { usePodsCare } from '../providers';

export interface IntakeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (order: RepairOrder, shouldPrint: boolean) => void;
}

export const IntakeWizardModal: React.FC<IntakeWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, deviceProfiles, addOrder, currentUser, branch, branchId, branches } =
    usePodsCare();

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | number>(
    branchId === 'all' ? 1 : branchId || 1
  );
  const [selectedCategory, setSelectedCategory] = useState('AirPods');
  const [selectedDevice, setSelectedDevice] = useState('AirPods Pro 2');
  const [serial, setSerial] = useState('');
  const [issue, setIssue] = useState('');
  const [accessories, setAccessories] = useState('');
  const [testAnswers, setTestAnswers] = useState<Record<string, ChecklistStatus>>({});
  const [testNote, setTestNote] = useState('');
  const [appearance, setAppearance] = useState('');
  const [photos, setPhotos] = useState<DevicePhoto[]>([]);
  const [price, setPrice] = useState<number | ''>('');
  const [priceNote, setPriceNote] = useState('');
  const [consent, setConsent] = useState(true);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceList, setDeviceList] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    deviceService
      .getDevices()
      .then((res: any) => {
        const items = res?.data || res;
        if (Array.isArray(items) && items.length > 0) {
          setDeviceList(items.map((d: any) => ({ id: d.id, name: d.name })));
        }
      })
      .catch(() => {});
  }, []);

  const activeProfile =
    deviceProfiles.find((p) => p.name === selectedDevice) ||
    deviceProfiles.find((p) => p.category === selectedCategory) ||
    deviceProfiles[0];

  const availableModels = deviceProfiles.filter((p) => p.category === selectedCategory);

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    const models = deviceProfiles.filter((p) => p.category === cat);
    if (models.length > 0 && models[0]) {
      setSelectedDevice(models[0].name);
    } else {
      setSelectedDevice('');
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Vui lòng nhập họ và tên khách hàng';
    if (!phone.trim()) errs.phone = 'Vui lòng nhập số điện thoại';
    if (!selectedCategory) errs.category = 'Vui lòng chọn danh mục';
    if (!selectedDevice) errs.device = 'Vui lòng chọn dòng sản phẩm';
    if (!issue.trim()) errs.issue = 'Vui lòng nhập mô tả lỗi khách báo';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (shouldPrint: boolean) => {
    if (!validate()) {
      toast('Vui lòng kiểm tra lại các trường bắt buộc', 'error');
      return;
    }

    setIsSubmitting(true);

    const checks: IntakeCheckItem[] = (activeProfile?.checks || []).map((label) => ({
      label,
      status: testAnswers[label] || 'Không kiểm tra',
    }));

    const branchObj =
      branches.find((b) => String(b.id) === String(selectedBranchId)) ||
      branches.find((b) => b.name === branch) ||
      branches[1] || { id: 1, name: 'PodsCare · Quận 1' };

    const branchIdNum = Number(branchObj.id) > 0 ? Number(branchObj.id) : 1;

    // Resolve device_model_id
    const matchedDevice = deviceList.find(
      (d) => d.name.toLowerCase() === selectedDevice.toLowerCase()
    );
    const deviceModelId = matchedDevice?.id || 1;

    // Map checklists to backend format
    const backendChecklists = checks.map((c) => ({
      item_name: c.label,
      status: c.status === 'Hoạt động' ? 'pass' : c.status === 'Lỗi' ? 'fail' : 'not_tested',
      note: testNote.trim() || undefined,
    }));

    const payload = {
      branch_id: branchIdNum,
      customer_name: name.trim(),
      customer_phone: phone.trim(),
      device_model_id: deviceModelId,
      serial_number: serial.trim() || undefined,
      accessories: accessories.trim() || undefined,
      issue_description: issue.trim(),
      appearance_notes: appearance.trim() || undefined,
      estimated_price: typeof price === 'number' ? price : 0,
      checklists: backendChecklists,
    };

    let newId = `PC26-${Math.floor(10000 + Math.random() * 90000)}`;

    try {
      const res = await repairService.createIntake(payload);
      const data = res?.data || res;
      if (data?.order_code) {
        newId = data.order_code;
      }
      toast(`Đã tiếp nhận thành công đơn ${newId}`, 'success');
    } catch (err: any) {
      console.warn('API call failed, saving locally:', err);
      toast(`Đã lưu đơn ${newId}: ${err?.message || ''}`, 'info');
    } finally {
      setIsSubmitting(false);
    }

    const newOrder: RepairOrder = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      deviceCategory: selectedCategory,
      device: selectedDevice,
      serial: serial.trim() || 'Chưa cập nhật',
      issue: issue.trim(),
      accessories: accessories.trim() || 'Không gửi kèm',
      branch: branchObj.name,
      branchId: branchObj.id,
      branchName: branchObj.name,
      status: 'Chờ khách duyệt',
      statusType: 'wait',
      price: typeof price === 'number' ? price : 0,
      priceNote: priceNote.trim(),
      tech: 'Chưa phân công',
      date: new Intl.DateTimeFormat('vi-VN').format(new Date()),
      checks,
      photos,
      appearance: appearance.trim() || 'Không ghi chú',
      testNote: testNote.trim(),
      createdBy: currentUser.name,
      createdAt: new Date().toISOString(),
    };

    addOrder(newOrder);
    onClose();

    if (shouldPrint) {
      router.push(`/print/${newId}`);
    } else if (onSuccess) {
      onSuccess(newOrder, shouldPrint);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      eyebrow="CSKH · TIẾP NHẬN THIẾT BỊ"
      title="Phiếu tiếp nhận sửa chữa (Intake Wizard)"
      subtitle="Thu thập thông tin 5 bước: Khách hàng, Thiết bị, Test tại quầy, Ngoại hình và Giá dự kiến."
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isSubmitting}>
            Hủy bỏ
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              disabled={isSubmitting}
              onClick={() => handleSave(false)}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu phiếu'}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="download"
              disabled={isSubmitting}
              onClick={() => handleSave(true)}
            >
              {isSubmitting ? 'Đang lưu & Tạo liên in...' : 'Lưu & In 2 liên A4 ▤'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Step Indicator */}
        <StepperWidget
          steps={[
            { id: 1, label: 'Khách hàng' },
            { id: 2, label: 'Thiết bị' },
            { id: 3, label: 'Test quầy' },
            { id: 4, label: 'Ngoại hình' },
            { id: 5, label: 'Cam kết' },
          ]}
          currentStepIndex={4}
        />

        {/* 01. Customer Info & Intake Branch */}
        <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
          <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
            <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
              01
            </span>
            Thông tin khách hàng & Chi nhánh tiếp nhận
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Input
              label="Họ và tên khách hàng *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Nguyễn Minh Anh"
              error={errors.name}
              required
            />
            <Input
              label="Số điện thoại liên hệ *"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0903 482 716"
              error={errors.phone}
              required
            />
            <div className="sm:col-span-2">
              <Select
                label="Chi nhánh tiếp nhận thiết bị *"
                value={String(selectedBranchId)}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                options={branches
                  .filter((b) => b.id !== 'all')
                  .map((b) => ({
                    value: String(b.id),
                    label: `${b.name} (${b.code}) — ${b.address || ''}`,
                  }))}
              />
            </div>
          </div>
        </section>

        {/* 02. Device Info */}
        <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
          <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
            <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
              02
            </span>
            Thiết bị tiếp nhận
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Loại thiết bị *"
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              options={categories.map((c) => ({ value: c, label: c }))}
            />

            <Select
              label="Dòng sản phẩm *"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              options={availableModels.map((m) => ({
                value: m.name,
                label: `${m.name}${m.model ? ` · ${m.model}` : ''}`,
              }))}
              error={errors.device}
            />

            <Input
              label="Số serial / Model code"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Serial trên thân máy hoặc hộp"
            />

            <Input
              label="Phụ kiện gửi kèm"
              value={accessories}
              onChange={(e) => setAccessories(e.target.value)}
              placeholder="Hộp sạc, cáp sạc, núm tai..."
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Tình trạng lỗi khách báo *"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="Ghi đúng mô tả của khách, ví dụ: Tai phải sạc không vào điện, rè khi bật ANC..."
                error={errors.issue}
                required
              />
            </div>
          </div>
        </section>

        {/* 03. Checklist Test */}
        <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2">
              <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                03
              </span>
              Test chức năng tại quầy
            </h3>
            <span className="text-xs text-[#176b58] bg-[#eaf4ef] px-2.5 py-0.5 rounded-[10px] font-semibold">
              {activeProfile?.checks.length || 0} chức năng · {selectedCategory}
            </span>
          </div>
          <p className="text-xs text-[#829189] mb-3">
            Chọn tình trạng từng hạng mục. Nếu máy không hỗ trợ tính năng, chọn &ldquo;Không test&rdquo;.
          </p>

          <div className="border border-[#e9eeeb] rounded-[8px] overflow-hidden bg-white mb-3">
            {(activeProfile?.checks || []).map((item, idx) => (
              <DynamicTestRow
                key={item}
                name={`test-${idx}`}
                label={item}
                value={testAnswers[item] || 'Không kiểm tra'}
                onChange={(status) => setTestAnswers((prev) => ({ ...prev, [item]: status }))}
              />
            ))}
          </div>

          <Textarea
            label="Ghi chú kết quả test tại quầy"
            value={testNote}
            onChange={(e) => setTestNote(e.target.value)}
            placeholder="Ghi chú thêm các hiện tượng bất thường khi test tại quầy..."
          />
        </section>

        {/* 04. Appearance & Photos */}
        <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
          <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
              04
            </span>
            Ngoại hình thiết bị & Ảnh chụp
          </h3>
          <p className="text-xs text-[#829189] mb-3">
            Chụp và tải ảnh tình trạng bên ngoài, vết trầy xước và phụ kiện đi kèm để đối chiếu lúc trả máy.
          </p>

          <PhotoDropzone
            photos={photos}
            onChange={setPhotos}
            label="Chụp / Thêm ảnh ngoại hình máy"
          />

          <div className="mt-3">
            <Textarea
              label="Mô tả vết xước / ngoại hình"
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              placeholder="Ví dụ: Vỏ hộp trầy xước nhẹ mặt đáy, tai phải có vết cấn mép loa..."
            />
          </div>
        </section>

        {/* 05. Pricing & Terms */}
        <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
          <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
            <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
              05
            </span>
            Chi phí sửa chữa dự kiến & Cam kết
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
            <Input
              label="Giá sửa chữa báo khách (VNĐ)"
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : '')}
              placeholder="Ví dụ: 850000"
            />
            <Input
              label="Ghi chú báo giá"
              value={priceNote}
              onChange={(e) => setPriceNote(e.target.value)}
              placeholder="Thay pin chính hãng, bảo hành 90 ngày"
            />
          </div>

          <div className="p-3.5 bg-[#fafbfa] border border-[#edf1ee] rounded-[8px]">
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              label={
                <span className="text-xs text-[#4c5c54] leading-relaxed">
                  Khách hàng xác nhận đã nghe tư vấn sơ bộ, đồng ý để PodsCare tiếp nhận thiết bị và chấp thuận các điều khoản biên nhận sửa chữa.
                </span>
              }
            />
          </div>
        </section>
      </div>
    </Modal>
  );
};
