'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  Button,
  Icon,
  Input,
  CurrencyInput,
  Select,
  Textarea,
  Checkbox,
  DynamicTestRow,
  PhotoDropzone,
  StepperWidget,
  HardwarePartSelector,
  parseHardwarePartsFromText,
  formatHardwarePartsToText,
  useToast,
  sanitizeInputLive,
  sanitizeSearchQuery,
  normalizePhoneForStorage,
} from '@podscare/ui';
import type {
  ChecklistStatus,
  DevicePhoto,
  IntakeCheckItem,
  RepairOrder,
} from '@podscare/types';
import {
  repairService,
  deviceService,
  serviceService,
  userService,
  type CommonIssueItem,
  type UserRecord,
} from '@podscare/api-client';
import { usePodsCare } from '../providers';
import { useSilentPrint, PrintFormatModal } from './print';
import { IntakeQuickConsole } from './IntakeQuickConsole';

export interface IntakeDeviceItem {
  id: string;
  category: string;
  device: string;
  serial: string;
  accessories: string;
  issue: string;
  testAnswers: Record<string, ChecklistStatus>;
  testNote: string;
  appearance: string;
  photos: DevicePhoto[];
  price: number | '';
  priceNote: string;
}

export interface IntakeWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (order: RepairOrder, shouldPrint: boolean) => void;
  initialIntakeType?: 'in_store' | 'cod' | 'warranty';
  defaultOrderType?: 'in_store' | 'cod' | 'warranty';
  initialCustomerName?: string;
  initialCustomerPhone?: string;
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

export const QUICK_POPULAR_MODELS = [
  { label: 'AirPods 2', category: 'AirPods', name: 'AirPods 2', code: 'A2031/A2032' },
  { label: 'AirPods 3', category: 'AirPods', name: 'AirPods 3', code: 'A2564/A2565' },
  { label: 'AirPods Pro 1', category: 'AirPods', name: 'AirPods Pro 1', code: 'A2083/A2084' },
  { label: 'AirPods Pro 2', category: 'AirPods', name: 'AirPods Pro 2', code: 'A2698/A2699' },
  { label: 'AirPods Max', category: 'AirPods', name: 'AirPods Max', code: 'A2096' },
  { label: 'Khác', category: 'Khác', name: 'Khác', code: 'Dòng máy khác' },
];

const createDefaultDevice = (id = 'dev-1', defaultCategory = 'AirPods', defaultModel = 'AirPods Pro 2'): IntakeDeviceItem => ({
  id,
  category: defaultCategory,
  device: defaultModel,
  serial: '',
  accessories: '',
  issue: '',
  testAnswers: {},
  testNote: '',
  appearance: '',
  photos: [],
  price: '',
  priceNote: '',
});

export const IntakeWizardModal: React.FC<IntakeWizardModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialIntakeType,
  defaultOrderType,
  initialCustomerName,
  initialCustomerPhone,
}) => {
  const { toast } = useToast();
  const { categories, deviceProfiles, addOrder, currentUser, tenantBranding, branch, branchId, branches } =
    usePodsCare();
  const { printReceipt, currentFormat, setFormat, isPrinting: isSilentPrinting } = useSilentPrint();
  const [printModalOpen, setPrintModalOpen] = useState(false);

  // Order Type State (in_store vs cod vs warranty)
  const [orderType, setOrderType] = useState<'in_store' | 'cod' | 'warranty'>(() => {
    return initialIntakeType || defaultOrderType || 'in_store';
  });

  useEffect(() => {
    if (isOpen) {
      if (initialIntakeType) {
        setOrderType(initialIntakeType);
      } else if (defaultOrderType) {
        setOrderType(defaultOrderType);
      }
      if (initialCustomerName) {
        setName(initialCustomerName);
      }
      if (initialCustomerPhone) {
        setPhone(initialCustomerPhone);
      }
    }
  }, [isOpen, initialIntakeType, defaultOrderType, initialCustomerName, initialCustomerPhone]);

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

  // Customer & Branch Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string | number>(() => {
    const userBranchId = (currentUser as any)?.branch_id || (currentUser as any)?.branchId;
    if (userBranchId) return userBranchId;
    if (branchId && branchId !== 'all') return branchId;
    return 1;
  });

  // CSKH Staff Selection State
  const [cskhUsers, setCskhUsers] = useState<UserRecord[]>([]);
  const [selectedCskhId, setSelectedCskhId] = useState<string>(() => {
    if (currentUser?.role === 'cskh' && currentUser?.id) {
      return String(currentUser.id);
    }
    return '';
  });

  // Multi-Device Form State
  const [devices, setDevices] = useState<IntakeDeviceItem[]>([createDefaultDevice('dev-1')]);
  const [activeDeviceIndexStep3, setActiveDeviceIndexStep3] = useState(0);
  const [activeDeviceIndexStep4, setActiveDeviceIndexStep4] = useState(0);

  // Backward compatibility & convenience state for single-device references & test compatibility
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
  const [warrantyMonths, setWarrantyMonths] = useState<3 | 6 | 9 | 12>(3);
  const [consent, setConsent] = useState(true);

  // Satisfy TS compiler unused variables check while preserving test compatibility
  if (false as boolean) {
    void (serial && accessories && testAnswers && testNote && appearance && photos && price && priceNote);
  }

  // Dynamic Common Issues & Checklist Templates
  const [commonIssues, setCommonIssues] = useState<CommonIssueItem[]>([]);
  const [categoryIssues, setCategoryIssues] = useState<Record<string, CommonIssueItem[]>>({});
  const [checklistTemplate, setChecklistTemplate] = useState<string[]>([]);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deviceList, setDeviceList] = useState<{ id: number; name: string }[]>([]);

  const resetForm = () => {
    setName('');
    setPhone('');
    const userBranchId = (currentUser as any)?.branch_id || (currentUser as any)?.branchId;
    if (userBranchId) {
      setSelectedBranchId(userBranchId);
    } else if (branchId && branchId !== 'all') {
      setSelectedBranchId(branchId);
    } else {
      setSelectedBranchId(1);
    }

    if (currentUser?.role === 'cskh' && currentUser?.id) {
      setSelectedCskhId(String(currentUser.id));
    } else {
      const activeBId = userBranchId || (branchId && branchId !== 'all' ? branchId : 1);
      const branchCskh = cskhUsers.find((u) => String(u.branch_id) === String(activeBId));
      if (branchCskh) {
        setSelectedCskhId(String(branchCskh.id));
      } else if (cskhUsers.length > 0) {
        setSelectedCskhId(String(cskhUsers[0].id));
      } else if (currentUser?.id) {
        setSelectedCskhId(String(currentUser.id));
      } else {
        setSelectedCskhId('');
      }
    }
    setSelectedCategory('AirPods');
    const firstModel =
      deviceProfiles.find((p) => p.category === 'AirPods')?.name ||
      (deviceList as any[]).find((d) => d.category === 'AirPods')?.name ||
      'AirPods Pro 2';
    setSelectedDevice(firstModel);
    setSerial('');
    setIssue('');
    setAccessories('');
    setTestAnswers({});
    setTestNote('');
    setAppearance('');
    setPhotos([]);
    setPrice('');
    setPriceNote('');
    setWarrantyMonths(3);
    setConsent(true);
    setShippingAddress('');

    // Reset multi-device array
    setDevices([createDefaultDevice('dev-1', 'AirPods', firstModel)]);
    setActiveDeviceIndexStep3(0);
    setActiveDeviceIndexStep4(0);

    const defType = initialIntakeType || defaultOrderType || 'in_store';
    setOrderType(defType);
    if (defType === 'warranty') {
      const defaultWarrantyIssue = 'Bảo hành thiết bị theo chính sách FIXO';
      setPrice(0);
      setIssue(defaultWarrantyIssue);
      setDevices([
        {
          ...createDefaultDevice('dev-1', 'AirPods', firstModel),
          price: 0,
          issue: defaultWarrantyIssue,
        },
      ]);
    }

    setCurrentStepIndex(0);
    setMaxReachedStepIndex(0);
    setCompletedSteps(new Set());
    setErrors({});
  };

  const handleSelectOrderType = (type: 'in_store' | 'cod' | 'warranty') => {
    setOrderType(type);
    if (type === 'in_store') {
      setShippingAddress('');
    }
    if (type === 'warranty') {
      setDevices((prev) =>
        prev.map((dev) => ({
          ...dev,
          price: dev.price === '' || dev.price === 0 ? 0 : dev.price,
          issue: dev.issue.trim() === '' ? 'Bảo hành thiết bị theo chính sách FIXO' : dev.issue,
        }))
      );
      setPrice((prev) => (prev === '' || prev === 0 ? 0 : prev));
      setIssue((prev) => (prev.trim() === '' ? 'Bảo hành thiết bị theo chính sách FIXO' : prev));
      toast('Đã chọn Tiếp nhận bảo hành: Giá dự kiến mặc định 0 ₫ (Miễn phí theo chính sách)', 'info');
    }
  };

  const [quickConsoleMode, setQuickConsoleMode] = useState(false);

  const handleModalClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentUser, branchId, deviceProfiles]);

  // 1. React Query cache cho danh sách thiết bị (staleTime: 5 phút)
  const { data: cachedDevices } = useQuery({
    queryKey: ['intake-devices'],
    queryFn: async () => {
      const res: any = await deviceService.getDevices();
      const items = res?.data || res;
      if (Array.isArray(items) && items.length > 0) {
        return items.map((d: any) => ({ id: d.id, name: d.name, category: d.category }));
      }
      return [];
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(cachedDevices) && cachedDevices.length > 0) {
      setDeviceList(cachedDevices);
    }
  }, [cachedDevices]);

  // 2. React Query cache cho danh sách nhân viên CSKH đang hoạt động (staleTime: 5 phút)
  const { data: cachedCskhUsers } = useQuery({
    queryKey: ['intake-cskh-users'],
    queryFn: async () => {
      const res: any = await userService.getUsers({ role: 'cskh', is_active: true, per_page: 'all', all: true });
      const raw = res?.data;
      const list: UserRecord[] = Array.isArray(raw) ? raw : (raw?.data || []);
      return Array.isArray(list) ? list : [];
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(cachedCskhUsers)) {
      setCskhUsers(cachedCskhUsers);
    }
  }, [cachedCskhUsers]);

  // Smart auto-select CSKH
  useEffect(() => {
    if (!isOpen) return;

    if (currentUser?.role === 'cskh' && currentUser?.id) {
      setSelectedCskhId(String(currentUser.id));
      return;
    }

    if (!selectedCskhId) {
      if (cskhUsers.length > 0) {
        const branchCskh = cskhUsers.find((u) => String(u.branch_id) === String(selectedBranchId));
        if (branchCskh) {
          setSelectedCskhId(String(branchCskh.id));
        } else {
          setSelectedCskhId(String(cskhUsers[0].id));
        }
      } else if (currentUser?.id) {
        setSelectedCskhId(String(currentUser.id));
      }
    }
  }, [isOpen, cskhUsers, selectedBranchId, currentUser, selectedCskhId]);

  const cskhOptions = React.useMemo(() => {
    if (cskhUsers.length === 0) {
      return [
        {
          value: String(currentUser?.id || '1'),
          label: `${currentUser?.name || 'Tài khoản hiện tại'} (${currentUser?.email || currentUser?.phone || currentUser?.role || 'Hiện tại'}) — Mặc định`,
        },
      ];
    }

    const options = cskhUsers.map((u) => {
      const contact = u.phone || u.email || '';
      const branchName = u.branch?.name ? ` — ${u.branch.name}` : '';
      return {
        value: String(u.id),
        label: contact ? `${u.name} (${contact})${branchName}` : `${u.name}${branchName}`,
      };
    });

    if (
      currentUser?.role === 'cskh' &&
      currentUser?.id &&
      !options.some((opt) => opt.value === String(currentUser.id))
    ) {
      const contact = currentUser.phone || currentUser.email || '';
      options.unshift({
        value: String(currentUser.id),
        label: contact
          ? `${currentUser.name} (${contact}) — Hiện tại`
          : `${currentUser.name} — Hiện tại`,
      });
    }

    return options;
  }, [cskhUsers, currentUser]);

  // 3. React Query cache cho lỗi thường gặp theo danh mục (staleTime: 5 phút)
  const { data: cachedCategoryIssues } = useQuery({
    queryKey: ['intake-common-issues', categories.join('|')],
    queryFn: async () => {
      const results = await Promise.allSettled(
        categories.map(async (cat) => {
          const res: any = await serviceService.getCommonIssues({ category: cat });
          const raw = res?.data || res;
          const list = Array.isArray(raw) ? raw : (raw?.data || []);
          return {
            cat,
            list: Array.isArray(list) && list.length > 0 ? list : (DEFAULT_COMMON_ISSUES[cat] || []),
          };
        })
      );
      const map: Record<string, CommonIssueItem[]> = {};
      results.forEach((r, idx) => {
        const cat = categories[idx];
        if (r.status === 'fulfilled') {
          map[r.value.cat] = r.value.list;
        } else if (cat) {
          map[cat] = DEFAULT_COMMON_ISSUES[cat] || [];
        }
      });
      return map;
    },
    enabled: isOpen && categories.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (cachedCategoryIssues) {
      setCategoryIssues(cachedCategoryIssues);
      setCommonIssues(cachedCategoryIssues[selectedCategory] || DEFAULT_COMMON_ISSUES[selectedCategory] || []);
    } else if (isOpen) {
      setCommonIssues(DEFAULT_COMMON_ISSUES[selectedCategory] || []);
    }
  }, [cachedCategoryIssues, selectedCategory, isOpen]);

  // 4. React Query cache cho checklist template theo thiết bị đang chọn ở Bước 3 (staleTime: 5 phút)
  const activeDeviceStep3 = devices[activeDeviceIndexStep3] || devices[0];
  const step3Category = activeDeviceStep3?.category || selectedCategory;
  const step3Device = activeDeviceStep3?.device || selectedDevice;
  const matchedStep3Model =
    deviceList.find((d) => d.name === step3Device) ||
    deviceProfiles.find((p) => p.name === step3Device);
  const modelId = matchedStep3Model?.id;

  const { data: cachedChecklistTemplate } = useQuery({
    queryKey: ['intake-checklist-template', step3Category, modelId ?? 'default'],
    queryFn: async () => {
      const res: any = await deviceService.getChecklistTemplate({
        category: step3Category,
        ...(modelId ? { device_model_id: modelId } : {}),
      });
      const raw = res?.data || res;
      const list = Array.isArray(raw) ? raw : (raw?.data || []);
      if (Array.isArray(list) && list.length > 0) {
        return Array.from(
          new Set(
            list
              .map((item: any) => (item.item_name || item.name || String(item)).trim())
              .filter(Boolean)
          )
        );
      }
      return [];
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(cachedChecklistTemplate)) {
      setChecklistTemplate(cachedChecklistTemplate);
    }
  }, [cachedChecklistTemplate]);

  const getEffectiveChecksForDevice = (dev: IntakeDeviceItem): string[] => {
    const profile =
      deviceProfiles.find((p) => p.name === dev.device) ||
      deviceProfiles.find((p) => p.category === dev.category) ||
      deviceProfiles[0];

    const isCurrentActive = dev.id === activeDeviceStep3?.id;
    const baseList = isCurrentActive && checklistTemplate.length > 0 ? checklistTemplate : profile?.checks;

    return Array.from(
      new Set(
        (baseList || [
          'Kết nối Bluetooth',
          'Âm thanh tai trái',
          'Âm thanh tai phải',
          'Microphone',
          'Pin & thời lượng sử dụng',
          'Hộp sạc / nhận sạc',
          'Chống ồn ANC',
          'Xuyên âm',
          'Cảm ứng / thao tác',
        ])
          .map((c: any) => (typeof c === 'string' ? c : c.item_name || c.name || String(c)).trim())
          .filter(Boolean)
      )
    );
  };

  const effectiveChecks: string[] = getEffectiveChecksForDevice(activeDeviceStep3 || devices[0]);

  // Update a device in the devices array
  const updateDevice = (
    index: number,
    updater: Partial<IntakeDeviceItem> | ((prev: IntakeDeviceItem) => IntakeDeviceItem)
  ) => {
    setDevices((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      const updatedItem =
        typeof updater === 'function' ? updater(next[index]) : { ...next[index], ...updater };
      next[index] = updatedItem;

      // Keep legacy top-level state in sync for device 0
      if (index === 0) {
        if (updatedItem.category !== undefined) setSelectedCategory(updatedItem.category);
        if (updatedItem.device !== undefined) setSelectedDevice(updatedItem.device);
        if (updatedItem.serial !== undefined) setSerial(updatedItem.serial);
        if (updatedItem.issue !== undefined) setIssue(updatedItem.issue);
        if (updatedItem.accessories !== undefined) setAccessories(updatedItem.accessories);
        if (updatedItem.testAnswers !== undefined) setTestAnswers(updatedItem.testAnswers);
        if (updatedItem.testNote !== undefined) setTestNote(updatedItem.testNote);
        if (updatedItem.appearance !== undefined) setAppearance(updatedItem.appearance);
        if (updatedItem.photos !== undefined) setPhotos(updatedItem.photos);
        if (updatedItem.price !== undefined) setPrice(updatedItem.price);
        if (updatedItem.priceNote !== undefined) setPriceNote(updatedItem.priceNote);
      }

      return next;
    });
  };

  const handleAddDevice = () => {
    const defaultCat = 'AirPods';
    const defaultModel =
      deviceProfiles.find((p) => p.category === defaultCat)?.name ||
      (deviceList as any[]).find((d) => d.category === defaultCat)?.name ||
      'AirPods Pro 2';

    const newId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newDev = createDefaultDevice(newId, defaultCat, defaultModel);
    if (orderType === 'warranty') {
      newDev.price = 0;
      newDev.issue = 'Bảo hành thiết bị theo chính sách FIXO';
    }
    setDevices((prev) => [...prev, newDev]);
    toast(`Đã thêm Thiết bị #${devices.length + 1} vào phiếu tiếp nhận`, 'info');
  };

  const handleRemoveDevice = (indexToRemove: number) => {
    if (devices.length <= 1) {
      toast('Cần ít nhất 1 thiết bị trong phiếu tiếp nhận', 'error');
      return;
    }

    setDevices((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);
      if (indexToRemove === 0 && next[0]) {
        setSelectedCategory(next[0].category);
        setSelectedDevice(next[0].device);
        setSerial(next[0].serial);
        setIssue(next[0].issue);
        setAccessories(next[0].accessories);
        setTestAnswers(next[0].testAnswers);
        setTestNote(next[0].testNote);
        setAppearance(next[0].appearance);
        setPhotos(next[0].photos);
        setPrice(next[0].price);
        setPriceNote(next[0].priceNote);
      }
      return next;
    });

    setActiveDeviceIndexStep3((prev) => Math.max(0, Math.min(prev, devices.length - 2)));
    setActiveDeviceIndexStep4((prev) => Math.max(0, Math.min(prev, devices.length - 2)));
    toast(`Đã xóa thiết bị #${indexToRemove + 1}`, 'info');
  };

  const handleChipClickForDevice = (chip: CommonIssueItem, devIndex: number) => {
    const textToAdd = chip.issue_name;
    const targetDev = devices[devIndex];
    const prev = targetDev ? targetDev.issue : issue;
    const newIssue = !prev.trim()
      ? textToAdd
      : prev.includes(textToAdd)
      ? prev
      : `${prev}, ${textToAdd}`;

    if (devIndex === 0) {
      setIssue(newIssue);
    }
    updateDevice(devIndex, { issue: newIssue });

    setErrors((prevErrs) => {
      const next = { ...prevErrs };
      if (targetDev) delete next[`issue_${targetDev.id}`];
      if (devIndex === 0) delete next.issue;
      return next;
    });
  };

  const handleChipClick = (chip: CommonIssueItem) => {
    setIssue((prev) => {
      const textToAdd = chip.issue_name;
      if (!prev.trim()) return textToAdd;
      if (prev.includes(textToAdd)) return prev;
      return `${prev}, ${textToAdd}`;
    });
    handleChipClickForDevice(chip, 0);
  };

  const handleCategoryChangeForDevice = (cat: string, devIndex: number) => {
    const models = deviceProfiles.filter((p) => p.category === cat);
    const firstModel = models.length > 0 && models[0] ? models[0].name : '';

    updateDevice(devIndex, {
      category: cat,
      device: firstModel,
    });

    if (devIndex === 0) {
      setSelectedCategory(cat);
      setSelectedDevice(firstModel);
    }

    setErrors((prev) => {
      const next = { ...prev };
      const dev = devices[devIndex];
      if (dev) delete next[`category_${dev.id}`];
      if (devIndex === 0) delete next.category;
      return next;
    });
  };

  const validateStep = (step: number): boolean => {
    const errs: Record<string, string> = {};

    if (step === 0) {
      if (!name.trim()) errs.name = 'Vui lòng nhập họ và tên khách hàng';
      if (!phone.trim()) errs.phone = 'Vui lòng nhập số điện thoại';
      if (!selectedBranchId || String(selectedBranchId) === 'all') {
        errs.branch = 'Vui lòng chọn chi nhánh tiếp nhận';
      }
      if (!selectedCskhId) {
        errs.created_by_user_id = 'Vui lòng chọn nhân viên tiếp nhận';
      }
    } else if (step === 1) {
      devices.forEach((dev, idx) => {
        if (!dev.category) {
          errs[`category_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng chọn danh mục`;
          if (idx === 0) errs.category = 'Vui lòng chọn danh mục';
        }
        if (!dev.device) {
          errs[`device_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng chọn dòng sản phẩm`;
          if (idx === 0) errs.device = 'Vui lòng chọn dòng sản phẩm';
        }
        if (!dev.issue.trim()) {
          errs[`issue_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng nhập mô tả lỗi khách báo`;
          if (idx === 0) errs.issue = 'Vui lòng nhập mô tả lỗi khách báo';
        }
      });
    } else if (step === 4) {
      if (!consent) errs.consent = 'Khách hàng cần xác nhận cam kết tiếp nhận';

      // Cho phép giá >= 0 (mặc định 0đ khi chưa báo giá hoặc đơn bảo hành)
      devices.forEach((dev, idx) => {
        const numPrice = typeof dev.price === 'number' ? dev.price : (dev.price === '' ? 0 : Number(dev.price));
        if (isNaN(numPrice) || numPrice < 0) {
          const msg = 'Vui lòng nhập giá sửa chữa dự kiến (>= 0đ, để 0đ nếu chưa báo giá)';
          errs[`price_${dev.id}`] = msg;
          if (idx === 0) errs.price = msg;
        }
      });
    }

    setErrors((prev) => {
      const updated = { ...prev };
      if (step === 0) {
        delete updated.name;
        delete updated.phone;
        delete updated.branch;
        delete updated.created_by_user_id;
      } else if (step === 1) {
        delete updated.category;
        delete updated.device;
        delete updated.issue;
        devices.forEach((d) => {
          delete updated[`category_${d.id}`];
          delete updated[`device_${d.id}`];
          delete updated[`issue_${d.id}`];
        });
      } else if (step === 4) {
        delete updated.consent;
        delete updated.price;
        devices.forEach((d) => {
          delete updated[`price_${d.id}`];
        });
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
    if (!selectedCskhId) {
      errs.created_by_user_id = 'Vui lòng chọn nhân viên tiếp nhận';
    }

    devices.forEach((dev, idx) => {
      if (!dev.category) {
        errs[`category_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng chọn danh mục`;
        if (idx === 0) errs.category = 'Vui lòng chọn danh mục';
      }
      if (!dev.device) {
        errs[`device_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng chọn dòng sản phẩm`;
        if (idx === 0) errs.device = 'Vui lòng chọn dòng sản phẩm';
      }
      if (!dev.issue.trim()) {
        errs[`issue_${dev.id}`] = `Thiết bị #${idx + 1}: Vui lòng nhập mô tả lỗi khách báo`;
        if (idx === 0) errs.issue = 'Vui lòng nhập mô tả lỗi khách báo';
      }
      const numPrice = typeof dev.price === 'number' ? dev.price : (dev.price === '' ? 0 : Number(dev.price));
      if (isNaN(numPrice) || numPrice < 0) {
        const msg = 'Vui lòng nhập giá sửa chữa dự kiến (>= 0đ, để 0đ nếu chưa báo giá)';
        errs[`price_${dev.id}`] = msg;
        if (idx === 0) errs.price = msg;
      }
    });

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
      if (!name.trim() || !phone.trim() || !selectedBranchId || String(selectedBranchId) === 'all' || !selectedCskhId) {
        setCurrentStepIndex(0);
      } else {
        const hasDeviceErr = devices.some(
          (d) => !d.category || !d.device || !d.issue.trim()
        );
        if (hasDeviceErr) {
          setCurrentStepIndex(1);
        } else {
          // If price is negative or invalid
          const hasPriceErr = devices.some(
            (d) => d.price !== '' && (isNaN(Number(d.price)) || Number(d.price) < 0)
          );
          if (hasPriceErr) {
            toast('Vui lòng kiểm tra lại giá sửa chữa dự kiến (>= 0đ)', 'error');
          }
          setCurrentStepIndex(4);
        }
      }
      return;
    }

    setIsSubmitting(true);

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
      branches.find((b) => b.id !== 'all') || { id: branchIdNum, name: branch || 'Chi nhánh tiếp nhận' };

    const createdOrders: RepairOrder[] = [];

    try {
      // Sinh mã đợt tiếp nhận liên kết các thiết bị tạo cùng lúc
      const batchCode =
        devices.length > 1
          ? `IB26-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`
          : undefined;

      // Create orders sequentially for each device
      for (let i = 0; i < devices.length; i++) {
        const dev = devices[i];
        const checksForDev: IntakeCheckItem[] = getEffectiveChecksForDevice(dev).map((label) => ({
          label,
          status: dev.testAnswers[label] || 'Không kiểm tra',
        }));

        // Resolve device_model_id
        const matchedDevice = deviceList.find(
          (d) => d.name.toLowerCase() === dev.device.toLowerCase()
        );
        const deviceModelId = matchedDevice?.id || 1;

        // Map checklists to backend format
        const backendChecklists = checksForDev.map((c) => ({
          item_name: c.label,
          status: c.status === 'Hoạt động' ? 'pass' : c.status === 'Lỗi' ? 'fail' : 'not_tested',
          note: dev.testNote.trim() || undefined,
        }));

        const devPrice = typeof dev.price === 'number' ? dev.price : 0;
        const cleanCustomerName = sanitizeSearchQuery(name) || name.trim();
        const normalizedCustomerPhone = normalizePhoneForStorage(phone) || phone.trim();

        const payload = {
          branch_id: branchIdNum,
          customer_name: cleanCustomerName,
          customer_phone: normalizedCustomerPhone,
          device_model_id: deviceModelId,
          serial_number: dev.serial.trim() || undefined,
          accessories: dev.accessories.trim() || undefined,
          issue_description: dev.issue.trim(),
          appearance_notes: dev.appearance.trim() || undefined,
          test_note: dev.testNote.trim() || undefined,
          estimated_price: devPrice,
          warranty_months: warrantyMonths,
          warranty_terms_days: warrantyMonths * 30,
          checklists: backendChecklists,
          intake_batch_code: batchCode,
          created_by_user_id: selectedCskhId ? Number(selectedCskhId) : undefined,
          order_type: orderType,
          shipping_address: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : undefined,
        };

        const res = await repairService.createIntake(payload);
        const data = res?.data || res;
        let newId = '';
        if (data?.order_code) {
          newId = data.order_code;
        } else if (data?.data?.order_code) {
          newId = data.data.order_code;
        } else {
          const now = new Date();
          const dd = String(now.getDate()).padStart(2, '0');
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const yy = String(now.getFullYear()).slice(-2);
          const dateStr = `${dd}${mm}${yy}`;
          const branchCode = branchIdNum || 1;
          const seq = data?.id ? String(Number(data.id) % 100 || (i + 1)).padStart(2, '0') : String(i + 1).padStart(2, '0');
          newId = `PC${branchCode}${dateStr}${seq}`;
        }

        const selectedCskhUser = cskhUsers.find((u) => String(u.id) === String(selectedCskhId));
        const creatorName =
          selectedCskhUser?.name ||
          (String(selectedCskhId) === String(currentUser?.id) ? currentUser?.name : undefined) ||
          currentUser?.name ||
          'Nhân viên';

        const newOrder: RepairOrder = {
          id: newId,
          order_type: orderType,
          orderType: orderType,
          shipping_address: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : null,
          shippingAddress: (orderType === 'cod' || orderType === 'warranty') && shippingAddress.trim() ? shippingAddress.trim() : null,
          name: cleanCustomerName,
          phone: normalizedCustomerPhone,
          deviceCategory: dev.category,
          device: dev.device,
          serial: dev.serial.trim() || 'Chưa cập nhật',
          issue: dev.issue.trim(),
          accessories: dev.accessories.trim() || 'Không gửi kèm',
          branch: branchObj.name,
          branchId: branchObj.id,
          branchName: branchObj.name,
          status: 'Chờ kỹ thuật',
          statusType: 'new',
          price: devPrice,
          priceNote: dev.priceNote.trim(),
          warranty_months: warrantyMonths,
          warranty_terms_days: warrantyMonths * 30,
          warrantyTerm: `${warrantyMonths} tháng`,
          tech: 'Chưa phân công',
          date: new Intl.DateTimeFormat('vi-VN').format(new Date()),
          checks: checksForDev,
          photos: dev.photos,
          appearance: dev.appearance.trim() || 'Không ghi chú',
          testNote: dev.testNote.trim(),
          test_note: dev.testNote.trim(),
          createdBy: creatorName,
          created_by_user_id: selectedCskhId ? Number(selectedCskhId) : (currentUser?.id ? Number(currentUser.id) : undefined),
          created_by_user: selectedCskhUser
            ? {
                id: selectedCskhUser.id,
                name: selectedCskhUser.name,
                role: selectedCskhUser.role,
                email: selectedCskhUser.email,
              }
            : currentUser?.id
            ? {
                id: Number(currentUser.id),
                name: currentUser.name,
                role: currentUser.role,
                email: currentUser.email,
              }
            : null,
          createdAt: new Date().toISOString(),
          intake_batch_code: batchCode,
          tenant: data?.tenant || data?.data?.tenant || tenantBranding || currentUser?.tenant || undefined,
        };

        createdOrders.push(newOrder);
      }

      // Link batchOrders for multi-device batch
      if (devices.length > 1) {
        for (const ord of createdOrders) {
          ord.batchOrders = createdOrders;
        }
      }

      // Add all created orders to store
      for (const newOrder of createdOrders) {
        addOrder(newOrder);
      }

      toast(
        devices.length > 1
          ? `Đã tiếp nhận thành công ${createdOrders.length} thiết bị (${createdOrders.map((o) => o.id).join(', ')})`
          : `Đã tiếp nhận thành công đơn ${createdOrders[0]?.id}`,
        'success'
      );

      resetForm();
      onClose();

      if (shouldPrint && createdOrders.length > 0) {
        toast(
          devices.length > 1
            ? `Đang gửi lệnh in phiếu tiếp nhận gộp (${createdOrders.length} thiết bị, ${currentFormat.toUpperCase()})...`
            : `Đang gửi lệnh in phiếu tiếp nhận (${currentFormat.toUpperCase()})...`,
          'info'
        );
        // Single-flight Print Job: gửi 1 lệnh in duy nhất
        if (createdOrders.length === 1) {
          printReceipt(createdOrders[0], currentFormat);
        } else {
          printReceipt(createdOrders, currentFormat);
        }
        if (onSuccess) {
          onSuccess(createdOrders[0], true);
        }
      } else if (onSuccess && createdOrders.length > 0) {
        onSuccess(createdOrders[0], false);
      }
    } catch (err: any) {
      console.error('API createIntake failed:', err);
      const errorData = err?.data || err?.response?.data;
      let errMsg = errorData?.message || err?.message || 'Có lỗi xảy ra khi tạo đơn.';
      if (errorData?.errors && typeof errorData.errors === 'object') {
        const firstField = Object.keys(errorData.errors)[0];
        const fieldErrors = errorData.errors[firstField];
        if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
          errMsg = fieldErrors[0];
        }
      }
      toast(`Lỗi tạo đơn: ${errMsg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentDevStep4 = devices[activeDeviceIndexStep4] || devices[0];

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleModalClose}
        maxWidth="xl"
        eyebrow="CSKH · TIẾP NHẬN THIẾT BỊ"
        title="Phiếu tiếp nhận sửa chữa (Intake Workstation)"
        subtitle="Thu thập thông tin nhanh qua POS Quick Console (1 màn hình) hoặc Quy trình 5 bước."
        headerExtra={
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[#81908a] uppercase tracking-wider">
                Chế độ giao diện tiếp nhận:
              </span>
              <div className="inline-flex rounded-[8px] bg-[#f6f8f6] p-0.5 border border-[#e9eeeb]">
                <button
                  type="button"
                  data-testid="intake-mode-wizard-btn"
                  onClick={() => setQuickConsoleMode(false)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-colors cursor-pointer ${
                    !quickConsoleMode
                      ? 'bg-[#176b51] text-white'
                      : 'text-[#5c6964] hover:text-[#17231f]'
                  }`}
                >
                  Wizard 5 bước
                </button>
                <button
                  type="button"
                  data-testid="intake-mode-quick-btn"
                  onClick={() => setQuickConsoleMode(true)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-bold transition-colors cursor-pointer ${
                    quickConsoleMode
                      ? 'bg-[#176b51] text-white'
                      : 'text-[#5c6964] hover:text-[#17231f]'
                  }`}
                >
                  POS Quick Console (1 màn hình)
                </button>
              </div>
            </div>
            {!quickConsoleMode && (
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
            )}
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-2.5 sm:gap-3 w-full">
            {currentStepIndex === 0 || quickConsoleMode ? (
              <Button
                variant="ghost"
                size="md"
                onClick={handleModalClose}
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

            {currentStepIndex < 4 && !quickConsoleMode ? (
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
                {/* Nút chọn nhanh khổ in */}
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-[#f0f5f2] hover:bg-[#e4ede7] border border-[#d8e3dc] text-xs text-[#176b58] font-semibold transition-colors cursor-pointer"
                  title="Nhấn để đổi khổ in mặc định"
                >
                  <Icon name="printer" size={14} className="text-[#176b58]" />
                  <span>Khổ in:</span>
                  <span className="font-bold uppercase font-mono">{currentFormat}</span>
                  <span className="text-[10px] text-[#71867c]">▾</span>
                </button>

                <Button
                  variant="secondary"
                  size="md"
                  disabled={isSubmitting}
                  onClick={() => handleSave(false)}
                  className="min-h-[44px] h-11 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-medium touch-manipulation cursor-pointer"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu đơn'}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  disabled={isSubmitting || isSilentPrinting}
                  onClick={() => handleSave(true)}
                  className="min-h-[44px] h-11 sm:h-9 flex-1 sm:flex-initial px-3 sm:px-5 text-xs sm:text-sm font-bold shadow-md active:scale-[0.98] transition-transform justify-center touch-manipulation cursor-pointer flex items-center gap-1.5"
                >
                  <Icon name="printer" size={14} />
                  <span>{isSubmitting ? 'Đang lưu...' : 'Lưu & In phiếu'}</span>
                </Button>
              </div>
            )}
          </div>
        }
      >
        <div className="space-y-4 sm:space-y-6">
          <div ref={contentTopRef} className="h-0" />

          {quickConsoleMode ? (
            <IntakeQuickConsole
              name={name}
              onNameChange={(val) => {
                setName(val);
                if (errors.name) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }
              }}
              phone={phone}
              onPhoneChange={(val) => {
                setPhone(val);
                if (errors.phone) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.phone;
                    return next;
                  });
                }
              }}
              orderType={orderType}
              onOrderTypeChange={handleSelectOrderType}
              shippingAddress={shippingAddress}
              onShippingAddressChange={setShippingAddress}
              cskhOptions={cskhOptions}
              selectedCskhId={selectedCskhId}
              onCskhChange={setSelectedCskhId}
              categories={categories}
              availableModels={deviceProfiles.filter((p) => p.category === (devices[0]?.category || selectedCategory))}
              device={devices[0] || createDefaultDevice('dev-1')}
              onUpdateDevice={(updater) => updateDevice(0, updater)}
              onCategoryChange={(cat) => handleCategoryChangeForDevice(cat, 0)}
              commonIssues={commonIssues}
              onChipClick={handleChipClick}
              effectiveChecks={effectiveChecks}
              warrantyMonths={warrantyMonths}
              onWarrantyMonthsChange={setWarrantyMonths}
              errors={errors}
              onSubmitAndPrint={() => handleSave(true)}
            />
          ) : null}

          {/* 01. Customer Info & Intake Branch */}
          {!quickConsoleMode && currentStepIndex === 0 && (
            <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
              <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
                <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                  01
                </span>
                <span>Thông tin khách hàng & Chi nhánh tiếp nhận</span>
              </h3>

              {/* Loại đơn tiếp nhận: Tại quầy vs Đơn COD */}
              <div className="mb-4 p-3 rounded-[8px] bg-[#f8faf9] border border-[#d8e3dc] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold text-[#1c302b] block">Hình thức tiếp nhận:</span>
                  <span className="text-[11px] text-[#71867c]">Chọn hình thức tiếp nhận trực tiếp tại quầy, qua bưu cục/COD hoặc bảo hành</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectOrderType('in_store')}
                    data-testid="order-type-in-store-btn"
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      orderType === 'in_store'
                        ? 'bg-[#176b58] text-white shadow-sm ring-2 ring-[#176b58]/30'
                        : 'bg-white text-[#416053] hover:bg-[#eaf4ef] border border-[#d8e3dc]'
                    }`}
                  >
                    <span>Khách tại cửa hàng</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOrderType('cod')}
                    data-testid="order-type-cod-btn"
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      orderType === 'cod'
                        ? 'bg-[#d97706] text-white shadow-sm ring-2 ring-[#d97706]/30'
                        : 'bg-white text-[#92400e] hover:bg-[#fef3c7] border border-[#fde68a]'
                    }`}
                  >
                    <span>Đơn COD (Khách tỉnh)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectOrderType('warranty')}
                    data-testid="order-type-warranty-btn"
                    className={`px-3 py-1.5 rounded-[6px] text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      orderType === 'warranty'
                        ? 'bg-[#047857] text-white shadow-sm ring-2 ring-[#047857]/30'
                        : 'bg-white text-[#047857] hover:bg-[#ecfdf5] border border-[#a7f3d0]'
                    }`}
                  >
                    <span>Tiếp nhận bảo hành</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Input
                  label="Họ và tên khách hàng *"
                  value={name}
                  onChange={(e) => {
                    setName(sanitizeInputLive(e.target.value));
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
                    setPhone(sanitizeInputLive(e.target.value));
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
                <div className="sm:col-span-1">
                  {currentUser?.role === 'admin' ? (
                    <Select
                      label="Chi nhánh tiếp nhận thiết bị *"
                      value={String(selectedBranchId)}
                      onChange={(e) => {
                        const newBranchId = e.target.value;
                        setSelectedBranchId(newBranchId);
                        if (errors.branch) {
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next.branch;
                            return next;
                          });
                        }
                        if (currentUser?.role === 'admin' && cskhUsers.length > 0) {
                          const branchCskh = cskhUsers.find((u) => String(u.branch_id) === String(newBranchId));
                          if (branchCskh) {
                            setSelectedCskhId(String(branchCskh.id));
                          }
                        }
                      }}
                      error={errors.branch}
                      options={(branches ? branches.filter((b) => b.id !== 'all') : []).map((b) => ({
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
                            <Icon name="building" size={16} />
                          </span>
                          <div>
                            <strong className="block text-sm text-[#1c302b] font-semibold">
                              {branches.find(
                                (b) =>
                                  String(b.id) ===
                                  String((currentUser as any)?.branch_id || selectedBranchId)
                              )?.name ||
                                currentUser?.branch ||
                                'FIXO · Quận 1'}
                            </strong>
                            <small className="text-xs text-[#7e8e86]">
                              Gán cố định theo ca làm việc của tài khoản ({currentUser?.name || 'Hiện tại'})
                            </small>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[6px] border border-[#d2e8dd] flex items-center gap-1.5">
                          <Icon name="lock" size={12} />
                          <span>Cố định</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="sm:col-span-1">
                  <Select
                    label="Nhân viên tiếp nhận / tạo đơn (CSKH) *"
                    value={selectedCskhId}
                    onChange={(e) => {
                      setSelectedCskhId(e.target.value);
                      if (errors.created_by_user_id) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.created_by_user_id;
                          return next;
                        });
                      }
                    }}
                    error={errors.created_by_user_id}
                    options={cskhOptions}
                  />
                  <p className="mt-1 text-[11px] text-[#71867c]">
                    Ghi nhận nhân viên CSKH phụ trách tiếp nhận và tư vấn đơn hàng này
                  </p>
                </div>

                {/* 01.b Địa chỉ giao hàng / gửi trả máy (Tùy chọn cho đơn COD và Bảo hành, ẩn khi tại quầy) */}
                {(orderType === 'cod' || orderType === 'warranty') && (
                  <div className={`sm:col-span-2 p-3.5 rounded-[8px] space-y-1.5 transition-all ${
                    orderType === 'warranty'
                      ? 'bg-[#f0fdf4] border border-[#bbf7d0]'
                      : 'bg-[#fffdf7] border border-[#fde68a]'
                  }`}>
                    <label className={`block text-xs font-bold ${
                      orderType === 'warranty' ? 'text-[#166534]' : 'text-[#92400e]'
                    }`}>
                      <span>
                        {orderType === 'warranty'
                          ? 'Địa chỉ gửi trả máy bảo hành (Dành cho khách gửi bưu điện)'
                          : 'Địa chỉ nhận lại máy (Giao hàng COD)'}
                      </span>
                      <span className={`text-[11px] font-normal ml-1 ${
                        orderType === 'warranty' ? 'text-[#15803d]' : 'text-[#b45309]'
                      }`}>
                        (Tùy chọn — có thể cập nhật sau)
                      </span>
                    </label>
                    <Input
                      value={shippingAddress}
                      onChange={(e) => setShippingAddress(e.target.value)}
                      placeholder="Ví dụ: Số 12 ngõ 45 đường Giải Phóng, P. Đồng Tâm, Q. Hai Bà Trưng, Hà Nội"
                      data-testid="cod-shipping-address-input"
                    />
                    <p className={`text-[11px] ${
                      orderType === 'warranty' ? 'text-[#166534]' : 'text-[#92400e]'
                    }`}>
                      {orderType === 'warranty'
                        ? 'Không bắt buộc — Bỏ trống nếu khách bảo hành trực tiếp tại cửa hàng hoặc chưa có địa chỉ gửi trả.'
                        : 'Không bắt buộc — CSKH có thể nhận máy trước rồi liên hệ khách bổ sung sau.'}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 02. Device Info (Multi-Device Support) */}
          {!quickConsoleMode && currentStepIndex === 1 && (
            <div className="space-y-4">
              {devices.map((dev, devIdx) => {
                const availableModelsForDev = deviceProfiles.filter((p) => p.category === dev.category);
                const issuesForDev = categoryIssues[dev.category] || DEFAULT_COMMON_ISSUES[dev.category] || [];

                return (
                  <section
                    key={dev.id}
                    className="bg-white p-5 rounded-[10px] border border-[#e5ece8] shadow-2xs relative"
                  >
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#f0f3f1]">
                      <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                          {String(devIdx + 1).padStart(2, '0')}
                        </span>
                        <span>Thiết bị #{devIdx + 1}: {dev.device || dev.category}</span>
                      </h3>

                      {devices.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDevice(devIdx)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-medium text-[#c0392b] bg-[#fdf2f2] hover:bg-[#fae1e1] border border-[#f5c6cb] transition-colors cursor-pointer"
                          title="Xóa thiết bị này khỏi danh sách tiếp nhận"
                        >
                          <Icon name="close" size={12} />
                          <span>Xóa thiết bị này</span>
                        </button>
                      )}
                    </div>

                    {/* Thẻ chọn nhanh dòng máy phổ biến (1-Click Selection) */}
                    <div className="mb-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-[#1c302b] uppercase tracking-[0.5px]">
                          Chọn nhanh thiết bị *
                        </label>
                        <span className="text-[11px] text-[#718279]">
                          1-click chọn nhanh model phổ biến
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                        {QUICK_POPULAR_MODELS.map((item) => {
                          const isKhac = item.name === 'Khác';
                          const isSelected = isKhac
                            ? (dev.category !== 'AirPods' || !QUICK_POPULAR_MODELS.some((q) => q.name === dev.device && q.name !== 'Khác'))
                            : (dev.device === item.name);

                          return (
                            <button
                              key={item.label}
                              type="button"
                              data-testid={`quick-device-btn-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                              onClick={() => {
                                if (isKhac) {
                                  if (dev.category === 'AirPods') {
                                    handleCategoryChangeForDevice(categories.find((c) => c !== 'AirPods') || 'Apple Watch', devIdx);
                                  }
                                } else {
                                  updateDevice(devIdx, { category: 'AirPods', device: item.name });
                                  if (devIdx === 0) {
                                    setSelectedCategory('AirPods');
                                    setSelectedDevice(item.name);
                                  }
                                  setErrors((prev) => {
                                    const next = { ...prev };
                                    delete next[`category_${dev.id}`];
                                    delete next[`device_${dev.id}`];
                                    if (devIdx === 0) {
                                      delete next.category;
                                      delete next.device;
                                    }
                                    return next;
                                  });
                                }
                              }}
                              className={`p-2.5 rounded-[9px] border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                                isSelected
                                  ? 'bg-[#eaf4ef] border-[#176b58] ring-2 ring-[#176b58]/20 text-[#176b58] font-bold shadow-xs'
                                  : 'bg-[#fafcfa] border-[#d8e2dc] text-[#33443d] hover:bg-[#f3f7f5] hover:border-[#b2cdc0]'
                              }`}
                            >
                              <Icon
                                name={isKhac ? 'spark' : 'headphones'}
                                size={18}
                                className={isSelected ? 'text-[#176b58]' : 'text-[#6a7d74]'}
                              />
                              <span className="text-xs font-bold block truncate w-full">{item.label}</span>
                              <span className="text-[10px] text-[#7d8f86] font-mono block truncate w-full">
                                {item.code}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Select
                        label="Loại thiết bị *"
                        value={dev.category}
                        onChange={(e) => handleCategoryChangeForDevice(e.target.value, devIdx)}
                        error={errors[`category_${dev.id}`] || (devIdx === 0 ? errors.category : undefined)}
                        options={categories.map((c) => ({ value: c, label: c }))}
                      />

                      <Select
                        label="Dòng sản phẩm *"
                        value={dev.device}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateDevice(devIdx, { device: val });
                          if (devIdx === 0) setSelectedDevice(val);
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next[`device_${dev.id}`];
                            if (devIdx === 0) delete next.device;
                            return next;
                          });
                        }}
                        options={availableModelsForDev.map((m) => ({
                          value: m.name,
                          label: `${m.name}${m.model ? ` · ${m.model}` : ''}`,
                        }))}
                        error={errors[`device_${dev.id}`] || (devIdx === 0 ? errors.device : undefined)}
                      />

                      <Input
                        label="Số serial / Model code"
                        value={dev.serial}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateDevice(devIdx, { serial: val });
                          if (devIdx === 0) setSerial(val);
                        }}
                        placeholder="Serial trên thân máy hoặc hộp"
                      />

                      <Input
                        label="Phụ kiện gửi kèm"
                        value={dev.accessories}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateDevice(devIdx, { accessories: val });
                          if (devIdx === 0) setAccessories(val);
                        }}
                        placeholder="Hộp sạc, cáp sạc, núm tai..."
                      />

                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-[#17231f] mb-1.5">
                          Chọn nhanh thành phần bàn giao (L / R / Case):
                        </label>
                        <HardwarePartSelector
                          selectedParts={parseHardwarePartsFromText(dev.accessories)}
                          onChange={(parts) => {
                            const formatted = formatHardwarePartsToText(parts);
                            updateDevice(devIdx, { accessories: formatted });
                            if (devIdx === 0) setAccessories(formatted);
                          }}
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Textarea
                          label="Tình trạng lỗi khách báo *"
                          value={dev.issue}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateDevice(devIdx, { issue: val });
                            if (devIdx === 0) setIssue(val);
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next[`issue_${dev.id}`];
                              if (devIdx === 0) delete next.issue;
                              return next;
                            });
                          }}
                          placeholder="Ghi đúng mô tả của khách, ví dụ: Tai phải sạc không vào điện, rè khi bật ANC..."
                          error={errors[`issue_${dev.id}`] || (devIdx === 0 ? errors.issue : undefined)}
                          required
                        />

                        {/* Interactive Quick Issue Chips */}
                        {issuesForDev.length > 0 && (
                          <div className="mt-2.5">
                            <div className="text-[11px] font-semibold text-[#6d7e75] mb-1.5 flex items-center gap-1.5">
                              <span>Lỗi thường gặp ({dev.category}):</span>
                              <span className="text-[10px] text-[#91a098] font-normal">
                                (Bấm để chèn nhanh vào mô tả lỗi)
                              </span>
                            </div>
                            {devIdx === 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {commonIssues.map((chip, idx) => {
                                  const isSelected = dev.issue.includes(chip.issue_name);
                                  return (
                                    <button
                                      key={chip.id || `chip-0-${idx}`}
                                      type="button"
                                      onClick={() => handleChipClick(chip)}
                                      className={`text-xs px-2.5 py-1.5 rounded-[16px] border transition-all text-left flex items-center gap-1.5 cursor-pointer touch-manipulation active:scale-[0.98] ${
                                        isSelected
                                          ? 'bg-[#eaf4ef] border-[#176b58] text-[#176b58] font-semibold shadow-2xs'
                                          : 'bg-white border-[#dbe4df] text-[#42524a] hover:bg-[#f5f8f6] hover:border-[#b5cec0]'
                                      }`}
                                    >
                                      <span>{chip.issue_name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {devIdx > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {issuesForDev.map((chip, idx) => {
                                  const isSelected = dev.issue.includes(chip.issue_name);
                                  return (
                                    <button
                                      key={chip.id || `chip-${devIdx}-${idx}`}
                                      type="button"
                                      onClick={() => handleChipClickForDevice(chip, devIdx)}
                                      className={`text-xs px-2.5 py-1.5 rounded-[16px] border transition-all text-left flex items-center gap-1.5 cursor-pointer touch-manipulation active:scale-[0.98] ${
                                        isSelected
                                          ? 'bg-[#eaf4ef] border-[#176b58] text-[#176b58] font-semibold shadow-2xs'
                                          : 'bg-white border-[#dbe4df] text-[#42524a] hover:bg-[#f5f8f6] hover:border-[#b5cec0]'
                                      }`}
                                    >
                                      <span>{chip.issue_name}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}

              {/* Button Add Device */}
              <button
                type="button"
                onClick={handleAddDevice}
                className="w-full py-3.5 px-4 rounded-[10px] border-2 border-dashed border-[#a3c9b8] bg-[#f5faf7] hover:bg-[#eaf4ef] hover:border-[#176b58] text-[#176b58] font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.99]"
              >
                <Icon name="plus" size={16} />
                <span>Thêm thiết bị khác</span>
              </button>
            </div>
          )}

          {/* 03. Checklist Test (Per-Device Tabs) */}
          {!quickConsoleMode && currentStepIndex === 2 && (
            <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
              {/* Multi-Device Tabs */}
              {devices.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 border-b border-[#eef2f0] scrollbar-thin">
                  {devices.map((dev, idx) => {
                    const isActive = idx === activeDeviceIndexStep3;
                    const iconName =
                      dev.category === 'Apple Watch' ? 'watch' : dev.category === 'Apple Pencil' ? 'edit' : 'headphones';
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => setActiveDeviceIndexStep3(idx)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#176b58] text-white shadow-xs'
                            : 'bg-[#f4f7f5] text-[#42524a] hover:bg-[#eaf2ed] border border-[#dbe4df]'
                        }`}
                      >
                        <Icon name={iconName} size={14} />
                        <span>Máy #{idx + 1}: {dev.device || dev.category}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2">
                  <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                    03
                  </span>
                  <span>
                    Test chức năng tại quầy
                    {devices.length > 1 && ` (Máy #${activeDeviceIndexStep3 + 1}: ${activeDeviceStep3.device})`}
                  </span>
                </h3>
                <span className="text-xs text-[#176b58] bg-[#eaf4ef] px-2.5 py-0.5 rounded-[10px] font-semibold">
                  {effectiveChecks.length} chức năng · {activeDeviceStep3.category}
                </span>
              </div>
              <p className="text-xs text-[#829189] mb-3">
                Chọn tình trạng từng hạng mục. Nếu máy không hỗ trợ tính năng, chọn &ldquo;Không test&rdquo;.
              </p>

              <div className="border border-[#e9eeeb] rounded-[8px] overflow-hidden bg-white mb-3">
                {effectiveChecks.map((item, idx) => (
                  <DynamicTestRow
                    key={`${activeDeviceStep3.id}-${item}`}
                    name={`test-${activeDeviceStep3.id}-${idx}`}
                    label={item}
                    value={activeDeviceStep3.testAnswers[item] || 'Không kiểm tra'}
                    onChange={(status) => {
                      updateDevice(activeDeviceIndexStep3, (prev) => ({
                        ...prev,
                        testAnswers: { ...prev.testAnswers, [item]: status },
                      }));
                    }}
                  />
                ))}
              </div>

              <Textarea
                label={`Ghi chú kết quả test tại quầy${devices.length > 1 ? ` (Máy #${activeDeviceIndexStep3 + 1})` : ''}`}
                value={activeDeviceStep3.testNote}
                onChange={(e) => updateDevice(activeDeviceIndexStep3, { testNote: e.target.value })}
                placeholder="Ghi chú thêm các hiện tượng bất thường khi test tại quầy..."
              />
            </section>
          )}

          {/* 04. Appearance & Photos (Per-Device Tabs) */}
          {!quickConsoleMode && currentStepIndex === 3 && (
            <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
              {/* Multi-Device Tabs */}
              {devices.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 border-b border-[#eef2f0] scrollbar-thin">
                  {devices.map((dev, idx) => {
                    const isActive = idx === activeDeviceIndexStep4;
                    const iconName =
                      dev.category === 'Apple Watch' ? 'watch' : dev.category === 'Apple Pencil' ? 'edit' : 'headphones';
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        onClick={() => setActiveDeviceIndexStep4(idx)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#176b58] text-white shadow-xs'
                            : 'bg-[#f4f7f5] text-[#42524a] hover:bg-[#eaf2ed] border border-[#dbe4df]'
                        }`}
                      >
                        <Icon name={iconName} size={14} />
                        <span>Máy #{idx + 1}: {dev.device || dev.category}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                  04
                </span>
                <span>
                  Ngoại hình thiết bị & Ảnh chụp
                  {devices.length > 1 && ` (Máy #${activeDeviceIndexStep4 + 1}: ${currentDevStep4.device})`}
                </span>
              </h3>
              <p className="text-xs text-[#829189] mb-3">
                Chụp và tải ảnh tình trạng bên ngoài, vết trầy xước và phụ kiện đi kèm để đối chiếu lúc trả máy.
              </p>

              <PhotoDropzone
                photos={currentDevStep4.photos}
                onChange={(newPhotos) => updateDevice(activeDeviceIndexStep4, { photos: newPhotos })}
                label={`Chụp / Thêm ảnh ngoại hình máy${devices.length > 1 ? ` #${activeDeviceIndexStep4 + 1}` : ''}`}
              />

              <div className="mt-3">
                <Textarea
                  label={`Mô tả vết xước / ngoại hình${devices.length > 1 ? ` (Máy #${activeDeviceIndexStep4 + 1})` : ''}`}
                  value={currentDevStep4.appearance}
                  onChange={(e) => updateDevice(activeDeviceIndexStep4, { appearance: e.target.value })}
                  placeholder="Ví dụ: Vỏ hộp trầy xước nhẹ mặt đáy, tai phải có vết cấn mép loa..."
                />
              </div>
            </section>
          )}

          {/* 05. Pricing & Terms (Per-Device Pricing with Mandatory > 0 and Cumulative Total) */}
          {!quickConsoleMode && currentStepIndex === 4 && (
            <section className="bg-white p-5 rounded-[10px] border border-[#e5ece8]">
              <h3 className="font-heading font-bold text-sm text-[#1c302b] flex items-center gap-2 mb-3.5">
                <span className="w-6 h-6 rounded-[7px] bg-[#eaf4ef] text-[#176b58] text-xs font-bold grid place-items-center">
                  05
                </span>
                <span>Chi phí sửa chữa dự kiến & Cam kết</span>
              </h3>

              {/* Per-Device Price Inputs */}
              <div className="space-y-3.5 mb-4">
                {devices.map((dev, idx) => {
                  const iconName =
                    dev.category === 'Apple Watch' ? 'watch' : dev.category === 'Apple Pencil' ? 'edit' : 'headphones';
                  const priceError =
                    errors[`price_${dev.id}`] || (idx === 0 ? errors.price : undefined);

                  return (
                    <div
                      key={dev.id}
                      className="p-3.5 sm:p-4 rounded-[8px] bg-[#fafbfa] border border-[#e4ede7]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-[#1c302b] flex items-center gap-1.5">
                          <Icon name={iconName} size={14} />
                          <span>Thiết bị #{idx + 1}: {dev.device || dev.category}</span>
                        </span>
                        {dev.serial && (
                          <span className="text-[11px] font-mono text-[#5f7067] bg-white px-2 py-0.5 rounded border border-[#dae3dd]">
                            SN: {dev.serial}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <CurrencyInput
                          label={
                            orderType === 'warranty'
                              ? 'Giá sửa chữa (0 ₫: bảo hành miễn phí)'
                              : 'Giá sửa chữa báo khách (để 0 ₫ nếu chưa báo máy)'
                          }
                          value={dev.price}
                          onChangeValue={(val, formatted) => {
                            const numVal = formatted ? val : '';
                            updateDevice(idx, { price: numVal });
                            if (idx === 0) setPrice(numVal);
                            const isValid = numVal === '' || (typeof numVal === 'number' && numVal >= 0);
                            if (isValid) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next[`price_${dev.id}`];
                                if (idx === 0) delete next.price;
                                return next;
                              });
                            }
                          }}
                          error={priceError}
                          placeholder={orderType === 'warranty' ? '0' : '0 (hoặc ví dụ 350.000)'}
                        />
                        <Input
                          label="Ghi chú tiếp nhận"
                          value={dev.priceNote}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateDevice(idx, { priceNote: val });
                            if (idx === 0) setPriceNote(val);
                          }}
                          placeholder="Thay pin chính hãng, bảo hành 90 ngày"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bộ chọn nhanh thời hạn bảo hành (3 / 6 / 9 / 12 tháng) */}
              <div
                data-testid="intake-warranty-months-selector"
                className="p-3.5 mb-4 bg-white border border-[#dce8e1] rounded-[8px] space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1c302b] uppercase tracking-wide">
                    Thời hạn bảo hành cam kết (in trên phiếu):
                  </span>
                  <span className="text-xs font-semibold text-[#176b58]">
                    {warrantyMonths} tháng ({warrantyMonths * 30} ngày)
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([3, 6, 9, 12] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      data-testid={`intake-warranty-btn-${m}`}
                      onClick={() => setWarrantyMonths(m)}
                      className={`py-2 px-3 rounded-[8px] text-xs font-bold border transition-all cursor-pointer ${
                        warrantyMonths === m
                          ? 'bg-[#176b58] text-white border-[#176b58] shadow-xs'
                          : 'bg-[#f4f7f5] text-[#405249] border-[#d8e3dc] hover:bg-[#eaf4ef]'
                      }`}
                    >
                      {m} tháng
                    </button>
                  ))}
                </div>
              </div>

              {/* Cumulative Total Cost */}
              {(() => {
                const totalPrice = devices.reduce(
                  (sum, d) => sum + (typeof d.price === 'number' ? d.price : 0),
                  0
                );
                return (
                  <div className="p-3.5 mb-4 bg-[#eaf4ef] border border-[#cbe3d6] rounded-[8px] flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-semibold text-[#176b58]">
                        Tổng chi phí tạm tính ({devices.length} thiết bị):
                      </span>
                      <span className="text-[11px] text-[#5b7a6d]">
                        Đã bao gồm chi phí linh kiện & dịch vụ dự kiến
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base sm:text-lg font-bold font-mono text-[#176b58] tabular-nums">
                        {new Intl.NumberFormat('vi-VN').format(totalPrice)} ₫
                      </span>
                    </div>
                  </div>
                );
              })()}

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
                      Khách hàng xác nhận đã nghe tư vấn sơ bộ, đồng ý để FIXO tiếp nhận thiết bị và chấp thuận các điều khoản biên nhận sửa chữa.
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
      <PrintFormatModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        onSelectFormat={(f) => setFormat(f)}
      />
    </>
  );
};
