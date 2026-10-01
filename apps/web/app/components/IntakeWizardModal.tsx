'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Modal,
  Button,
  Input,
  CurrencyInput,
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
import { repairService, deviceService, serviceService, type CommonIssueItem } from '@podscare/api-client';
import { usePodsCare } from '../providers';
import { realtimeEventBus } from '../utils/socketNotifications';

export interface IntakeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (order: RepairOrder, shouldPrint: boolean) => void;
}

const DEFAULT_COMMON_ISSUES: Record<string, CommonIssueItem[]> = {
  AirPods: [
    { id: 1, category: 'AirPods', issue_name: 'Pin chai, tụt pin nhanh dưới 1 tiếng', estimated_cost: 250000 },
    { id: 2, category: 'AirPods', issue_name: 'Bật chống ồn ANC bị rè, rít gió chói tai', estimated_cost: 350000 },
    { id: 3, category: 'AirPods', issue_name: 'Loa một bên nhỏ tiếng hoặc rè bass', estimated_cost: 200000 },
    { id: 4, category: 'AirPods', issue_name: 'Hộp sạc không nhận sạc hoặc không sạc được cho tai', estimated_cost: 300000 },
    { id: 5, category: 'AirPods', issue_name: 'Bám bẩn lâu ngày, tắc màng âm thanh', estimated_cost: 100000 },
  ],
  'Apple Watch': [
    { id: 11, category: 'Apple Watch', issue_name: 'Pin phù, sụt nhanh hoặc đẩy bung màn hình', estimated_cost: 350000 },
    { id: 12, category: 'Apple Watch', issue_name: 'Cảm ứng liệt hoặc loạn sau va đập', estimated_cost: 450000 },
    { id: 13, category: 'Apple Watch', issue_name: 'Không nhận sạc không dây', estimated_cost: 300000 },
  ],
  'Apple Pencil': [
    { id: 21, category: 'Apple Pencil', issue_name: 'Pin kiệt không nhận sạc từ iPad', estimated_cost: 250000 },
    { id: 22, category: 'Apple Pencil', issue_name: 'Ngòi mòn, đứt nét hoặc mất cảm ứng lực', estimated_cost: 150000 },
  ],
};

export const IntakeWizardModal: React.FC<IntakeWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const router = useRouter();
  const { toast } = useToast();
  const { categories, deviceProfiles, addOrder, currentUser, branch, branchId, branches } =
    usePodsCare();

  const contentTopRef = useRef<HTMLDivElement>(null);

  // Step State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [maxReachedStepIndex, setMaxReachedStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Auto scroll to top of step when step changes
  useEffect(() => {
    if (isOpen) {
      contentTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentStepIndex, isOpen]);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | number>(() => {
    const userBranchId = (currentUser as any)?.branch_id || (currentUser as any)?.branchId;
    if (userBranchId) return userBranchId;
    if (branchId && branchId !== 'all') return branchId;
    return 1;
  });
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

  // Dynamic Common Issues & Checklist Templates
  const [commonIssues, setCommonIssues] = useState<CommonIssueItem[]>([]);
  const [checklistTemplate, setChecklistTemplate] = useState<string[]>([]);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceList, setDeviceList] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
      setMaxReachedStepIndex(0);
      setCompletedSteps(new Set());
      setErrors({});

      // Auto assign branch based on current logged in user or active branch
      const userBranchId = (currentUser as any)?.branch_id || (currentUser as any)?.branchId;
      if (userBranchId) {
        setSelectedBranchId(userBranchId);
      } else if (branchId && branchId !== 'all') {
        setSelectedBranchId(branchId);
      } else {
        setSelectedBranchId(1);
      }
    }
  }, [isOpen, currentUser, branchId]);

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

  // Fetch dynamic common issues & checklist templates based on selectedCategory
  useEffect(() => {
    if (!isOpen) return;

    serviceService
      .getCommonIssues({ category: selectedCategory })
      .then((res: any) => {
        const raw = res?.data || res;
        const list = Array.isArray(raw) ? raw : (raw?.data || []);
        if (Array.isArray(list) && list.length > 0) {
          setCommonIssues(list);
        } else {
          setCommonIssues(DEFAULT_COMMON_ISSUES[selectedCategory] || []);
        }
      })
      .catch(() => setCommonIssues(DEFAULT_COMMON_ISSUES[selectedCategory] || []));

    deviceService
      .getChecklistTemplate({ category: selectedCategory })
      .then((res: any) => {
        const raw = res?.data || res;
        const list = Array.isArray(raw) ? raw : (raw?.data || []);
        if (Array.isArray(list) && list.length > 0) {
          const checks = list.map((item: any) => item.item_name || item.name || String(item));
          setChecklistTemplate(checks);
        } else {
          setChecklistTemplate([]);
        }
      })
      .catch(() => setChecklistTemplate([]));
  }, [isOpen, selectedCategory]);

  const activeProfile =
    deviceProfiles.find((p) => p.name === selectedDevice) ||
    deviceProfiles.find((p) => p.category === selectedCategory) ||
    deviceProfiles[0];

  const availableModels = deviceProfiles.filter((p) => p.category === selectedCategory);

  const effectiveChecks: string[] =
    checklistTemplate.length > 0
      ? checklistTemplate
      : activeProfile?.checks || [
          'Kết nối Bluetooth',
          'Âm thanh tai trái',
          'Âm thanh tai phải',
          'Microphone',
          'Pin & thời lượng sử dụng',
          'Hộp sạc / nhận sạc',
          'Chống ồn ANC',
          'Xuyên âm',
          'Cảm ứng / thao tác',
        ];

  const handleChipClick = (chip: CommonIssueItem) => {
    const textToAdd = chip.issue_name;
    setIssue((prev) => {
      if (!prev.trim()) return textToAdd;
      if (prev.includes(textToAdd)) return prev;
      return `${prev}, ${textToAdd}`;
    });
    if (errors.issue) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.issue;
        return next;
      });
    }
    if ((price === '' || price === 0) && chip.estimated_cost) {
      setPrice(Number(chip.estimated_cost));
    }
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    const models = deviceProfiles.filter((p) => p.category === cat);
    if (models.length > 0 && models[0]) {
      setSelectedDevice(models[0].name);
    } else {
      setSelectedDevice('');
    }
  };

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!name.trim()) errs.name = 'Vui lòng nhập họ và tên khách hàng';
      if (!phone.trim()) errs.phone = 'Vui lòng nhập số điện thoại';
      if (!selectedBranchId || String(selectedBranchId) === 'all') {
        errs.branch = 'Vui lòng chọn chi nhánh tiếp nhận';
      }
    } else if (step === 1) {
      if (!selectedCategory) errs.category = 'Vui lòng chọn danh mục';
      if (!selectedDevice) errs.device = 'Vui lòng chọn dòng sản phẩm';
      if (!issue.trim()) errs.issue = 'Vui lòng nhập mô tả lỗi khách báo';
    } else if (step === 4) {
      if (!consent) errs.consent = 'Khách hàng cần xác nhận cam kết tiếp nhận';
    }

    setErrors((prev) => {
      const updated = { ...prev };
      if (step === 0) {
        delete updated.name;
        delete updated.phone;
        delete updated.branch;
      } else if (step === 1) {
        delete updated.category;
        delete updated.device;
        delete updated.issue;
      } else if (step === 4) {
        delete updated.consent;
      }
      return { ...updated, ...errs };
    });

    return Object.keys(errs).length === 0;
  };

  const validateAll = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Vui lòng nhập họ và tên khách hàng';
    if (!phone.trim()) errs.phone = 'Vui lòng nhập số điện thoại';
    if (!selectedBranchId || String(selectedBranchId) === 'all') {
      errs.branch = 'Vui lòng chọn chi nhánh tiếp nhận';
    }
    if (!selectedCategory) errs.category = 'Vui lòng chọn danh mục';
    if (!selectedDevice) errs.device = 'Vui lòng chọn dòng sản phẩm';
    if (!issue.trim()) errs.issue = 'Vui lòng nhập mô tả lỗi khách báo';
    if (!consent) errs.consent = 'Khách hàng cần xác nhận cam kết tiếp nhận';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStepIndex)) {
      setCompletedSteps((prev) => {
        const nextSet = new Set(prev);
        nextSet.add(currentStepIndex);
        return nextSet;
      });
      setMaxReachedStepIndex((prev) => Math.max(prev, currentStepIndex + 1));
      setCurrentStepIndex((prev) => Math.min(prev + 1, 4));
    } else {
      toast('Vui lòng điền đầy đủ các thông tin bắt buộc trước khi tiếp tục', 'error');
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleStepClick = (idx: number) => {
    if (completedSteps.has(idx) || idx <= maxReachedStepIndex || idx < currentStepIndex) {
      setCurrentStepIndex(idx);
    }
  };

  const handleSave = async (shouldPrint: boolean) => {
    if (!validateAll()) {
      toast('Vui lòng kiểm tra lại các trường bắt buộc', 'error');
      if (!name.trim() || !phone.trim() || !selectedBranchId || String(selectedBranchId) === 'all') {
        setCurrentStepIndex(0);
      } else if (!selectedCategory || !selectedDevice || !issue.trim()) {
        setCurrentStepIndex(1);
      } else if (!consent) {
        setCurrentStepIndex(4);
      }
      return;
    }

    setIsSubmitting(true);

    const checks: IntakeCheckItem[] = effectiveChecks.map((label) => ({
      label,
      status: testAnswers[label] || 'Không kiểm tra',
    }));

    const userBranchId = (currentUser as any)?.branch_id || (currentUser as any)?.branchId;
    const branchIdNum =
      currentUser?.role !== 'admin'
        ? Number(userBranchId || branchId || 1)
        : Number(selectedBranchId) > 0
        ? Number(selectedBranchId)
        : 1;

    const branchObj =
      branches.find((b) => String(b.id) === String(branchIdNum)) ||
      branches.find((b) => b.name === branch) ||
      branches[1] || { id: 1, name: 'PodsCare · Quận 1' };

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
      } else if (data?.data?.order_code) {
        newId = data.data.order_code;
      }
      toast(`Đã tiếp nhận thành công đơn ${newId}`, 'success');

      // Kích hoạt ngay sự kiện thông báo vận hành cục bộ (Local Hybrid Feedback)
      const operationalNotification = {
        id: `notif-${newId}-${Date.now()}`,
        type: 'order_created' as const,
        title: 'Tiếp nhận đơn mới',
        message: `Đơn ${newId} (${payload.customer_name}) đã được tiếp nhận thành công.`,
        orderCode: newId,
        orderId: newId,
        severity: 'info' as const,
        timestamp: new Date().toISOString(),
        actionUrl: `/repairs?id=${newId}`,
        branchId: branchIdNum,
      };

      // 1. Phát sự kiện qua RealtimeEventBus
      realtimeEventBus.emit('order.created', operationalNotification);

      // 2. Phát CustomEvent trên window cho NotificationProvider & E2E / browser listeners
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('podscare:operational_event', {
            detail: operationalNotification,
          })
        );
      }
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
      headerExtra={
        <StepperWidget
          steps={[
            { id: 1, label: 'Khách hàng' },
            { id: 2, label: 'Thiết bị' },
            { id: 3, label: 'Test quầy' },
            { id: 4, label: 'Ngoại hình' },
            { id: 5, label: 'Cam kết' },
          ]}
          currentStepIndex={currentStepIndex}
          completedStepIndices={Array.from(completedSteps)}
          onStepClick={handleStepClick}
        />
      }
      footer={
        <div className="flex items-center justify-between gap-2.5 sm:gap-3 w-full">
          {currentStepIndex === 0 ? (
            <Button
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] h-11 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium touch-manipulation cursor-pointer"
            >
              Hủy bỏ
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={handleBack}
              disabled={isSubmitting}
              className="min-h-[44px] h-11 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-semibold touch-manipulation cursor-pointer"
            >
              ← Quay lại
            </Button>
          )}

          {currentStepIndex < 4 ? (
            <Button
              variant="primary"
              size="md"
              onClick={handleNext}
              disabled={isSubmitting}
              className="min-h-[44px] h-11 sm:h-9 flex-1 sm:flex-initial px-5 sm:px-6 text-sm sm:text-base font-bold shadow-md active:scale-[0.98] transition-transform justify-center touch-manipulation cursor-pointer"
            >
              Tiếp tục →
            </Button>
          ) : (
            <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
              <Button
                variant="secondary"
                size="md"
                disabled={isSubmitting}
                onClick={() => handleSave(false)}
                className="min-h-[44px] h-11 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium touch-manipulation cursor-pointer"
              >
                {isSubmitting ? 'Đang lưu...' : 'Lưu'}
              </Button>
              <Button
                variant="primary"
                size="md"
                icon="arrow"
                disabled={isSubmitting}
                onClick={() => handleSave(true)}
                className="min-h-[44px] h-11 sm:h-9 flex-1 sm:flex-initial px-3 sm:px-5 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-transform justify-center touch-manipulation cursor-pointer"
              >
                {isSubmitting ? 'Đang lưu & Mở...' : 'Lưu & Xem phiếu ↗'}
              </Button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4 sm:space-y-6">
        <div ref={contentTopRef} className="h-0" />

        {/* 01. Customer Info & Intake Branch */}
        {currentStepIndex === 0 && (
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
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.name;
                      return next;
                    });
                  }
                }}
                placeholder="Ví dụ: Nguyễn Minh Anh"
                error={errors.name}
                required
              />
              <Input
                label="Số điện thoại liên hệ *"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errors.phone) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.phone;
                      return next;
                    });
                  }
                }}
                placeholder="0903 482 716"
                error={errors.phone}
                required
              />
              <div className="sm:col-span-2">
                {currentUser?.role === 'admin' ? (
                  <Select
                    label="Chi nhánh tiếp nhận thiết bị *"
                    value={String(selectedBranchId)}
                    onChange={(e) => {
                      setSelectedBranchId(e.target.value);
                      if (errors.branch) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.branch;
                        return next;
                      });
                    }
                  }}
                  error={errors.branch}
                  options={((branches && branches.filter((b) => b.id !== 'all').length > 0)
                    ? branches.filter((b) => b.id !== 'all')
                    : [
                        { id: 1, name: 'PodsCare · Quận 1', code: 'Q1', address: '142 Nguyễn Thị Minh Khai, Phường Bến Thành, Quận 1, TP.HCM' },
                        { id: 2, name: 'PodsCare · Quận 3', code: 'Q3', address: '285 Cách Mạng Tháng Tám, Phường 12, Quận 3, TP.HCM' },
                        { id: 3, name: 'PodsCare · TP. Thủ Đức', code: 'THUDUC', address: '56 Võ Văn Ngân, Phường Bình Thọ, TP. Thủ Đức, TP.HCM' },
                      ]
                  ).map((b) => ({
                    value: String(b.id),
                    label: `${b.name} (${b.code}) — ${b.address || ''}`,
                  }))}
                />
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[#556960] mb-1.5">
                    Chi nhánh tiếp nhận thiết bị
                  </label>
                  <div className="flex items-center justify-between p-3 rounded-[8px] bg-[#f7f9f7] border border-[#d6dfda] cursor-default select-none">
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-[8px] bg-[#e4eee8] text-[#176b58] grid place-items-center flex-none font-bold text-sm">
                        📍
                      </span>
                      <div>
                        <strong className="block text-sm text-[#1c302b] font-semibold">
                          {branches.find(
                            (b) =>
                              String(b.id) ===
                              String((currentUser as any)?.branch_id || selectedBranchId)
                          )?.name ||
                            currentUser.branch ||
                            'PodsCare · Quận 1'}
                        </strong>
                        <small className="text-xs text-[#7e8e86]">
                          Gán cố định theo ca làm việc của tài khoản ({currentUser.name})
                        </small>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px] border border-[#d2e8dd] flex items-center gap-1">
                      🔒 Cố định
                    </span>
                  </div>
                </div>
              )}
              </div>
            </div>
          </section>
        )}

        {/* 02. Device Info */}
        {currentStepIndex === 1 && (
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
                onChange={(e) => {
                  handleCategoryChange(e.target.value);
                  if (errors.category) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.category;
                      return next;
                    });
                  }
                }}
                error={errors.category}
                options={categories.map((c) => ({ value: c, label: c }))}
              />

              <Select
                label="Dòng sản phẩm *"
                value={selectedDevice}
                onChange={(e) => {
                  setSelectedDevice(e.target.value);
                  if (errors.device) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.device;
                      return next;
                    });
                  }
                }}
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
                  onChange={(e) => {
                    setIssue(e.target.value);
                    if (errors.issue) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.issue;
                        return next;
                      });
                    }
                  }}
                  placeholder="Ghi đúng mô tả của khách, ví dụ: Tai phải sạc không vào điện, rè khi bật ANC..."
                  error={errors.issue}
                  required
                />

                {/* Interactive Quick Issue Chips */}
                {commonIssues.length > 0 && (
                  <div className="mt-2.5">
                    <div className="text-[11px] font-semibold text-[#6d7e75] mb-1.5 flex items-center gap-1.5">
                      <span>⚡ Lỗi thường gặp ({selectedCategory}):</span>
                      <span className="text-[10px] text-[#91a098] font-normal">
                        (Bấm để chèn nhanh vào mô tả lỗi)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {commonIssues.map((chip, idx) => {
                        const isSelected = issue.includes(chip.issue_name);
                        return (
                          <button
                            key={chip.id || `chip-${idx}`}
                            type="button"
                            onClick={() => handleChipClick(chip)}
                            className={`text-xs px-2.5 py-1.5 rounded-[16px] border transition-all text-left flex items-center gap-1.5 cursor-pointer touch-manipulation active:scale-[0.98] ${
                              isSelected
                                ? 'bg-[#eaf4ef] border-[#176b58] text-[#176b58] font-semibold shadow-2xs'
                                : 'bg-white border-[#dbe4df] text-[#42524a] hover:bg-[#f5f8f6] hover:border-[#b5cec0]'
                            }`}
                          >
                            <span>{chip.issue_name}</span>
                            {chip.estimated_cost ? (
                              <span className="text-[10px] font-mono text-[#768a80]">
                                ~{new Intl.NumberFormat('vi-VN').format(chip.estimated_cost)} ₫
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 03. Checklist Test */}
        {currentStepIndex === 2 && (
          <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2">
                <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                  03
                </span>
                Test chức năng tại quầy
              </h3>
              <span className="text-xs text-[#176b58] bg-[#eaf4ef] px-2.5 py-0.5 rounded-[10px] font-semibold">
                {effectiveChecks.length} chức năng · {selectedCategory}
              </span>
            </div>
            <p className="text-xs text-[#829189] mb-3">
              Chọn tình trạng từng hạng mục. Nếu máy không hỗ trợ tính năng, chọn &ldquo;Không test&rdquo;.
            </p>

            <div className="border border-[#e9eeeb] rounded-[8px] overflow-hidden bg-white mb-3">
              {effectiveChecks.map((item, idx) => (
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
        )}

        {/* 04. Appearance & Photos */}
        {currentStepIndex === 3 && (
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
        )}

        {/* 05. Pricing & Terms */}
        {currentStepIndex === 4 && (
          <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
            <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
              <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                05
              </span>
              Chi phí sửa chữa dự kiến & Cam kết
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
              <CurrencyInput
                label="Giá sửa chữa báo khách"
                value={price}
                onChangeValue={(val, formatted) => setPrice(formatted ? val : '')}
                placeholder="Ví dụ: 850.000"
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
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (errors.consent && e.target.checked) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.consent;
                      return next;
                    });
                  }
                }}
                label={
                  <span className="text-xs text-[#4c5c54] leading-relaxed">
                    Khách hàng xác nhận đã nghe tư vấn sơ bộ, đồng ý để PodsCare tiếp nhận thiết bị và chấp thuận các điều khoản biên nhận sửa chữa.
                  </span>
                }
              />
              {errors.consent && (
                <p className="mt-1.5 text-xs text-[#bc5b52] font-medium">{errors.consent}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};
