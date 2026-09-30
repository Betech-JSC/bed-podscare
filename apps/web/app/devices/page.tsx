'use client';

import React, { useState } from 'react';
import {
  Button,
  Modal,
  Input,
  Select,
  Textarea,
  useToast,
  Icon,
} from '@podscare/ui';
import { AppShell } from '../components/AppShell';
import { usePodsCare } from '../providers';
import type { DeviceProfile } from '@podscare/types';

export default function DevicesManagerPage() {
  const { toast } = useToast();
  const { categories, addCategory, deviceProfiles, addOrUpdateProfile } = usePodsCare();

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Editing profile
  const [editingProfile, setEditingProfile] = useState<DeviceProfile | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileCategory, setProfileCategory] = useState(categories[0] || 'AirPods');
  const [profileMaker, setProfileMaker] = useState('Apple');
  const [profileModel, setProfileModel] = useState('');
  const [profileChecksText, setProfileChecksText] = useState('');

  // Collapsible category accordion
  const [expandedCat, setExpandedCat] = useState<string>(categories[0] || 'AirPods');

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast('Vui lòng nhập tên danh mục', 'error');
      return;
    }
    addCategory(newCategoryName.trim());
    toast(`Đã thêm danh mục mới: ${newCategoryName.trim()}`, 'success');
    setNewCategoryName('');
    setCategoryModalOpen(false);
  };

  const openAddProfileModal = (category: string) => {
    setEditingProfile(null);
    setProfileName('');
    setProfileCategory(category);
    setProfileMaker('Apple');
    setProfileModel('');
    setProfileChecksText(
      'Màn hình / hiển thị\nPin và sạc\nKết nối Bluetooth / Wi-Fi\nÂm thanh & micro\nPhím bấm / thao tác'
    );
    setProfileModalOpen(true);
  };

  const openEditProfileModal = (profile: DeviceProfile) => {
    setEditingProfile(profile);
    setProfileName(profile.name);
    setProfileCategory(profile.category);
    setProfileMaker(profile.maker || 'Apple');
    setProfileModel(profile.model || '');
    setProfileChecksText(profile.checks.join('\n'));
    setProfileModalOpen(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
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

    const updated: DeviceProfile = {
      name: profileName.trim(),
      category: profileCategory,
      maker: profileMaker.trim() || 'Apple',
      model: profileModel.trim(),
      icon:
        profileCategory.toLowerCase().includes('watch')
          ? 'watch'
          : profileCategory.toLowerCase().includes('pencil')
          ? 'pencil'
          : profileCategory.toLowerCase().includes('airpods')
          ? 'headphones'
          : 'device',
      checks,
    };

    addOrUpdateProfile(updated);
    toast(
      editingProfile
        ? `Đã cập nhật dòng sản phẩm: ${updated.name}`
        : `Đã thêm dòng sản phẩm mới: ${updated.name}`,
      'success'
    );
    setProfileModalOpen(false);
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
              onClick={() => openAddProfileModal(expandedCat || categories[0] || 'AirPods')}
            >
              Thêm dòng máy mới
            </Button>
          </div>
        </div>

        {/* Categories List */}
        <div className="space-y-3">
          {categories.map((cat) => {
            const models = deviceProfiles.filter((p) => p.category === cat);
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
                    {models.map((model) => (
                      <div
                        key={model.name}
                        className="flex flex-wrap items-center justify-between p-3 bg-white rounded-[8px] border border-[#e5ece8] gap-3"
                      >
                        <div className="min-w-0">
                          <b className="font-heading text-sm text-[#1c302b] block">
                            {model.name}
                            {model.model && (
                              <span className="text-xs text-[#81908a] font-normal ml-2 font-sans">
                                ({model.model})
                              </span>
                            )}
                          </b>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {model.checks.slice(0, 5).map((chk) => (
                              <span
                                key={chk}
                                className="text-xs text-[#55665d] bg-[#f3f6f4] px-1.5 py-0.5 rounded border border-[#e8ecea]"
                              >
                                {chk}
                              </span>
                            ))}
                            {model.checks.length > 5 && (
                              <span className="text-xs text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded font-bold">
                                +{model.checks.length - 5} mục nữa
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEditProfileModal(model)}
                        >
                          Chỉnh sửa checklist
                        </Button>
                      </div>
                    ))}

                    <Button
                      variant="ghost"
                      size="sm"
                      icon="plus"
                      className="w-full text-[#176b58] font-bold border border-dashed border-[#cddbd2] bg-white mt-2"
                      onClick={() => openAddProfileModal(cat)}
                    >
                      Thêm dòng máy cho {cat}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Category Modal */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        eyebrow="CẤU HÌNH DANH MỤC"
        title="Thêm danh mục sửa chữa mới"
        subtitle="Dùng khi mở rộng thêm ngành hoặc nhóm thiết bị mới (Smartwatch, Laptop...)"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setCategoryModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleCreateCategory}>
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
          />
        </form>
      </Modal>

      {/* Add / Edit Profile Modal */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        maxWidth="lg"
        eyebrow="CẤU HÌNH CHECKLIST TIẾP NHẬN"
        title={editingProfile ? `Chỉnh sửa: ${editingProfile.name}` : 'Thêm dòng sản phẩm mới'}
        subtitle="Cấu hình danh mục và các tiêu chí kiểm tra test quầy tại bước tiếp nhận CSKH."
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="secondary" onClick={() => setProfileModalOpen(false)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSaveProfile}>
              {editingProfile ? 'Lưu thay đổi' : 'Lưu dòng sản phẩm'}
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
              options={categories.map((c) => ({ value: c, label: c }))}
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
    </AppShell>
  );
}
