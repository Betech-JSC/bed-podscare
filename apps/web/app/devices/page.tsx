'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  Modal,
  ConfirmModal,
  Input,
  Select,
  Textarea,
  useToast,
  Icon,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import { deviceService } from '@podscare/api-client';
import type { DeviceModelRecord } from '@podscare/types';

export default function DevicesManagerPage() {
  const { toast } = useToast();
  const { fetchDeviceProfiles } = usePodsCare();

  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<DeviceModelRecord[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([
    'AirPods',
    'Apple Watch',
    'Apple Pencil',
    'MacBook',
    'iPad',
  ]);

  // Modals state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isSavingDevice, setIsSavingDevice] = useState(false);

  // Deleting state
  const [deletingDevice, setDeletingDevice] = useState<DeviceModelRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Category form
  const [newCategoryName, setNewCategoryName] = useState('');

  // Device Form state
  const [editingDevice, setEditingDevice] = useState<DeviceModelRecord | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileCategory, setProfileCategory] = useState('AirPods');
  const [profileMaker, setProfileMaker] = useState('Apple');
  const [profileModel, setProfileModel] = useState('');
  const [profileChecksText, setProfileChecksText] = useState('');

  // Collapsible category accordion
  const [expandedCat, setExpandedCat] = useState<string>('AirPods');

  // Fetch real data from backend
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [devicesRes, categoriesRes] = await Promise.all([
        deviceService.getDevices(),
        deviceService.getCategories(),
      ]);

      const rawDevices = devicesRes?.data;
      const devList = Array.isArray(rawDevices)
        ? rawDevices
        : (rawDevices as any)?.data || (Array.isArray(devicesRes) ? devicesRes : []);

      setDevices(devList);

      const rawCats = categoriesRes?.data;
      const catList = Array.isArray(rawCats)
        ? rawCats
        : (rawCats as any)?.data || (Array.isArray(categoriesRes) ? categoriesRes : []);

      if (Array.isArray(catList) && catList.length > 0) {
        setCategoriesList(catList);
        setExpandedCat((prev) => (!prev || !catList.includes(prev) ? catList[0] : prev));
      }

      // Sync with global context for intake wizard
      await fetchDeviceProfiles();
    } catch (err: any) {
      console.error('Failed to load devices data:', err);
      toast(err?.response?.data?.message || 'Không thể tải danh sách thiết bị từ máy chủ', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [fetchDeviceProfiles, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const catName = newCategoryName.trim();
    if (!catName) {
      toast('Vui lòng nhập tên danh mục', 'error');
      return;
    }

    try {
      setIsSavingCategory(true);
      await deviceService.createCategory(catName);
      toast(`Đã thêm danh mục mới: ${catName}`, 'success');
      setNewCategoryName('');
      setCategoryModalOpen(false);
      setExpandedCat(catName);
      await loadData();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Không thể tạo danh mục thiết bị', 'error');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const openAddProfileModal = (category: string) => {
    setEditingDevice(null);
    setProfileName('');
    setProfileCategory(category || categoriesList[0] || 'AirPods');
    setProfileMaker('Apple');
    setProfileModel('');
    setProfileChecksText(
      'Màn hình / hiển thị\nPin và sạc\nKết nối Bluetooth / Wi-Fi\nÂm thanh & micro\nPhím bấm / thao tác'
    );
    setProfileModalOpen(true);
  };

  const openEditProfileModal = (device: DeviceModelRecord) => {
    setEditingDevice(device);
    setProfileName(device.name);
    setProfileCategory(device.category || 'AirPods');
    setProfileMaker(device.manufacturer || 'Apple');
    setProfileModel(device.model_code || '');

    const checks =
      Array.isArray(device.checklist_templates) && device.checklist_templates.length > 0
        ? device.checklist_templates.map((c) => c.item_name).join('\n')
        : 'Màn hình / hiển thị\nPin và sạc\nKết nối Bluetooth / Wi-Fi\nÂm thanh & micro';

    setProfileChecksText(checks);
    setProfileModalOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast('Vui lòng nhập tên dòng thiết bị', 'error');
      return;
    }

    const checks = profileChecksText
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean);

    if (checks.length === 0) {
      toast('Vui lòng nhập ít nhất 1 mục checklist kiểm tra', 'error');
      return;
    }

    try {
      setIsSavingDevice(true);
      const payload = {
        name: profileName.trim(),
        category: profileCategory,
        manufacturer: profileMaker.trim() || 'Apple',
        model_code: profileModel.trim() || undefined,
        checks,
      };

      if (editingDevice) {
        await deviceService.updateDevice(editingDevice.id, payload);
        toast(`Đã cập nhật dòng sản phẩm: ${payload.name}`, 'success');
      } else {
        await deviceService.createDevice(payload);
        toast(`Đã thêm dòng sản phẩm mới: ${payload.name}`, 'success');
      }

      setProfileModalOpen(false);
      await loadData();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Có lỗi xảy ra khi lưu thiết bị', 'error');
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleDeleteDevice = async () => {
    if (!deletingDevice) return;
    try {
      setIsDeleting(true);
      await deviceService.deleteDevice(deletingDevice.id);
      toast(`Đã xóa thành công dòng máy: ${deletingDevice.name}`, 'success');
      setDeletingDevice(null);
      await loadData();
    } catch (err: any) {
      toast(err?.response?.data?.message || 'Không thể xóa dòng máy này', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell crumbName="Thiết bị & Checklist">
      <div className="space-y-6">
        {/* Head */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#87958e] uppercase tracking-wider mb-1">
              CONFIGURATION
            </div>
            <h1 className="font-heading font-bold text-2xl text-[#1c302b] m-0">
              Danh mục thiết bị & Checklist động
            </h1>
            <p className="text-sm text-[#85928c] mt-1 mb-0">
              Quản lý các dòng máy và cấu hình danh sách tiêu chí kiểm tra chức năng tại quầy CSKH.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              icon="plus"
              onClick={() => setCategoryModalOpen(true)}
            >
              Thêm danh mục
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="plus"
              onClick={() => openAddProfileModal(expandedCat || categoriesList[0] || 'AirPods')}
            >
              Thêm dòng máy mới
            </Button>
          </div>
        </div>

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white border border-[#e5ece8] rounded-[10px] p-4 h-20 animate-pulse flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-[38px] h-[38px] rounded-[11px] bg-[#edf1ee]" />
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-[#edf1ee] rounded" />
                    <div className="w-20 h-3 bg-[#edf1ee] rounded" />
                  </div>
                </div>
                <div className="w-16 h-6 bg-[#edf1ee] rounded-[20px]" />
              </div>
            ))}
          </div>
        )}

        {/* Categories List */}
        {!isLoading && (
          <div className="space-y-3">
            {categoriesList.map((cat) => {
              const models = devices.filter((p) => p.category === cat);
              const isExpanded = expandedCat === cat;

              return (
                <div
                  key={cat}
                  className="bg-white border border-[#e5ece8] rounded-[10px] overflow-hidden shadow-xs"
                >
                  {/* Accordion Summary */}
                  <div
                    onClick={() => setExpandedCat(isExpanded ? '' : cat)}
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[#fafcfa] transition-colors select-none"
                  >
                    <div className="w-[38px] h-[38px] rounded-[11px] bg-[#eaf4ef] text-[#176b58] grid place-items-center flex-none">
                      <Icon
                        name={
                          cat.toLowerCase().includes('watch')
                            ? 'watch'
                            : cat.toLowerCase().includes('pencil')
                            ? 'pencil'
                            : cat.toLowerCase().includes('airpods')
                            ? 'headphones'
                            : 'device'
                        }
                        size={20}
                      />
                    </div>
                    <div>
                      <b className="font-heading font-bold text-base text-[#1c302b] block">{cat}</b>
                      <small className="text-xs text-[#829088]">
                        {models.length} model cấu hình trong hệ thống
                      </small>
                    </div>
                    <span className="ml-auto text-xs font-bold text-[#176b58] bg-[#eaf4ef] px-2.5 py-1 rounded-[20px]">
                      {models.length} dòng
                    </span>
                    <span
                      className={`text-[#829088] transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      ▼
                    </span>
                  </div>

                  {/* Expanded Models List */}
                  {isExpanded && (
                    <div className="border-t border-[#edf1ee] p-4 bg-[#fafbfa] space-y-2">
                      {models.length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-[#dce5e0] rounded-[8px] bg-white">
                          <p className="text-sm text-[#798881] m-0 mb-3 font-medium">
                            Chưa có dòng máy nào trong danh mục <strong>{cat}</strong>.
                          </p>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon="plus"
                            onClick={() => openAddProfileModal(cat)}
                          >
                            Thêm dòng máy cho {cat}
                          </Button>
                        </div>
                      ) : (
                        models.map((model) => {
                          const checks = Array.isArray(model.checklist_templates)
                            ? model.checklist_templates.map((c) => c.item_name)
                            : [];

                          return (
                            <div
                              key={model.id}
                              className="flex flex-wrap items-center justify-between p-3 bg-white rounded-[8px] border border-[#e5ece8] gap-3 hover:border-[#ccdcd2] transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <b className="font-heading text-sm text-[#1c302b] block">
                                  {model.name}
                                  {model.model_code && (
                                    <span className="text-xs text-[#81908a] font-normal ml-2 font-sans">
                                      ({model.model_code})
                                    </span>
                                  )}
                                  {model.manufacturer && (
                                    <span className="text-xs text-[#55665d] bg-[#f0f4f2] px-1.5 py-0.5 rounded ml-2 font-medium">
                                      {model.manufacturer}
                                    </span>
                                  )}
                                </b>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {checks.slice(0, 5).map((chk) => (
                                    <span
                                      key={chk}
                                      className="text-xs text-[#55665d] bg-[#f3f6f4] px-1.5 py-0.5 rounded border border-[#e8ecea]"
                                    >
                                      {chk}
                                    </span>
                                  ))}
                                  {checks.length > 5 && (
                                    <span className="text-xs text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded font-bold">
                                      +{checks.length - 5} mục nữa
                                    </span>
                                  )}
                                  {checks.length === 0 && (
                                    <span className="text-xs text-[#829088] italic">
                                      Chưa cấu hình checklist riêng
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-none">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon="edit"
                                  onClick={() => openEditProfileModal(model)}
                                >
                                  Chỉnh sửa
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  icon="trash"
                                  onClick={() => setDeletingDevice(model)}
                                >
                                  Xóa
                                </Button>
                              </div>
                            </div>
                          );
                        })
                      )}

                      {models.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon="plus"
                          className="w-full text-[#176b58] font-bold border border-dashed border-[#cddbd2] bg-white mt-2 hover:bg-[#f6f9f7]"
                          onClick={() => openAddProfileModal(cat)}
                        >
                          Thêm dòng máy cho {cat}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Category Modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => !isSavingCategory && setCategoryModalOpen(false)}
        eyebrow="CẤU HÌNH DANH MỤC"
        title="Thêm danh mục sửa chữa mới"
        subtitle="Lưu trực tiếp vào CSDL MySQL để phân nhóm thiết bị và cấu hình checklist chuyên biệt."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="secondary"
              disabled={isSavingCategory}
              onClick={() => setCategoryModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={isSavingCategory}
              onClick={handleCreateCategory}
            >
              Tạo danh mục
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateCategory}>
          <Input
            label="Tên danh mục thiết bị *"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Ví dụ: Loa Bluetooth, Smartwatch, Tablet..."
            required
            autoFocus
          />
        </form>
      </Modal>

      {/* Add / Edit Profile Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => !isSavingDevice && setProfileModalOpen(false)}
        maxWidth="lg"
        eyebrow="CẤU HÌNH CHECKLIST TIẾP NHẬN"
        title={editingDevice ? `Chỉnh sửa: ${editingDevice.name}` : 'Thêm dòng sản phẩm mới'}
        subtitle="Cấu hình dòng máy và các tiêu chí kiểm tra test quầy tại bước tiếp nhận CSKH (Lưu CSDL MySQL)."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              variant="secondary"
              disabled={isSavingDevice}
              onClick={() => setProfileModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={isSavingDevice}
              onClick={handleSaveProfile}
            >
              {editingDevice ? 'Lưu thay đổi' : 'Lưu dòng sản phẩm'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Tên dòng / đời máy *"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Ví dụ: AirPods Pro 2"
              required
            />
            <Select
              label="Danh mục chính *"
              value={profileCategory}
              onChange={(e) => setProfileCategory(e.target.value)}
              options={categoriesList.map((c) => ({ value: c, label: c }))}
            />
            <Input
              label="Thương hiệu sản xuất"
              value={profileMaker}
              onChange={(e) => setProfileMaker(e.target.value)}
              placeholder="Apple, Samsung, Sony..."
            />
            <Input
              label="Mã model (nếu có)"
              value={profileModel}
              onChange={(e) => setProfileModel(e.target.value)}
              placeholder="Lightning / USB-C / A2698..."
            />
          </div>

          <Textarea
            label="Checklist chức năng cần test * (mỗi dòng một tiêu chí)"
            value={profileChecksText}
            onChange={(e) => setProfileChecksText(e.target.value)}
            className="min-h-[140px]"
            hint="Nhân viên CSKH sẽ thấy các nút 'Hoạt động / Lỗi / Không test' ứng với từng dòng bạn nhập ở đây."
            required
          />
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!deletingDevice}
        onClose={() => !isDeleting && setDeletingDevice(null)}
        onConfirm={handleDeleteDevice}
        eyebrow="XÁC NHẬN XÓA THIẾT BỊ"
        title={`Xóa dòng máy "${deletingDevice?.name}"?`}
        description={
          <span>
            Hành động này sẽ xóa dòng máy và bộ checklist liên quan khỏi hệ thống.
            <br />
            <strong>Lưu ý:</strong> Nếu dòng máy đã có đơn sửa chữa liên kết, hệ thống sẽ tự động chuyển sang trạng thái ngưng hoạt động (deactivated) để bảo toàn dữ liệu lịch sử của cửa hàng.
          </span>
        }
        confirmText="Xóa thiết bị"
        cancelText="Hủy bỏ"
        variant="danger"
        loading={isDeleting}
      />
    </AppShell>
  );
}
