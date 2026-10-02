import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../atoms/Icons';
import { Avatar } from '../atoms/Avatar';
import { useToast } from '../molecules/Toast';
import type { UserProfile } from '@podscare/types';

export interface BranchOption {
  id: string | number;
  name: string;
  code?: string;
}

export interface NavItemDef {
  id: string;
  label: string;
  icon: string;
  badge?: number | string;
  hasDot?: boolean;
  href?: string;
}

export const mainNavItems: NavItemDef[] = [
  { id: 'tech', label: 'Không gian Kỹ thuật', icon: 'wrench', href: '/tech' },
];

export interface AppSidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  user?: UserProfile | null;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  branchName?: string;
  selectedBranchId?: string | number;
  branches?: BranchOption[];
  onBranchChange?: (branch: BranchOption) => void;
  repairsCount?: number;
  qcCount?: number;
  onHelpClick?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  currentPath,
  onNavigate,
  user: userProp,
  onLogout,
  onHelpClick,
  isOpen = false,
  onClose,
  branchName = 'FIXO · Quận 1',
  selectedBranchId,
  branches,
  onBranchChange,
  repairsCount = 12,
  qcCount = 4,
}) => {
  const defaultUser: UserProfile = {
    id: '1',
    name: 'Minh Lê',
    role: 'admin',
    roleLabel: 'Quản trị viên',
    branch: 'Quận 1',
    initials: 'ML',
  };
  const user = userProp || defaultUser;
  const { toast } = useToast();
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  const branchDropdownRef = useRef<HTMLDivElement | null>(null);

  // Restore scroll position on mount without smooth animation to prevent jump
  useEffect(() => {
    try {
      const savedScroll = sessionStorage.getItem('podscare_sidebar_scroll');
      if (savedScroll && navRef.current) {
        navRef.current.scrollTop = Number(savedScroll);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen click outside to close branch dropdown cleanly
  useEffect(() => {
    if (!branchDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [branchDropdownOpen]);

  // Normalize role
  const rawRole = (user?.role || 'admin') as string;
  const normalizedRole: 'admin' | 'cskh' | 'tech' | 'qc' | 'inventory' | 'super_admin' =
    rawRole === 'super_admin'
      ? 'super_admin'
      : rawRole === 'technician' || rawRole === 'tech'
      ? 'tech'
      : rawRole === 'cskh'
      ? 'cskh'
      : rawRole === 'qc'
      ? 'qc'
      : rawRole === 'inventory'
      ? 'inventory'
      : 'admin';


  // Role menu item permissions matrix
  const rolePermissions: Record<'admin' | 'cskh' | 'tech' | 'qc' | 'inventory' | 'super_admin', string[]> = {
    admin: [
      'dashboard',
      'repairs',
      'customers',
      'devices',
      'quotes',
      'timeline',
      'tech',
      'qc',
      'inventory',
      'shipments',
      'partners',
      'warranty',
      'branches',
      'users',
      'payments',
      'kpi',
      'audit',
    ],
    super_admin: [],
    cskh: [
      'dashboard',
      'repairs',
      'customers',
      'devices',
      'quotes',
      'timeline',
      'shipments',
      'warranty',
    ],
    tech: [
      'tech',
    ],
    qc: [
      'dashboard',
      'repairs',
      'qc',
      'devices',
      'timeline',
    ],
    inventory: [
      'dashboard',
      'repairs',
      'inventory',
      'partners',
      'devices',
    ],
  };

  const allowedIds = rolePermissions[normalizedRole] || rolePermissions.admin;

  const workspaceNav: NavItemDef[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: 'dashboard', href: '/dashboard' },
    { id: 'repairs', label: 'Đơn sửa chữa', icon: 'repairs', badge: repairsCount },
    { id: 'customers', label: 'Khách hàng', icon: 'customers' },
    { id: 'devices', label: 'Thiết bị', icon: 'device' },
    { id: 'quotes', label: 'Báo giá', icon: 'quotes', hasDot: true },
    { id: 'timeline', label: 'Timeline', icon: 'timeline' },
  ];

  const operationsNav: NavItemDef[] = [
    { id: 'tech', label: 'Không gian Kỹ thuật', icon: 'wrench', href: '/tech' },
    { id: 'qc', label: 'Kiểm định QC', icon: 'qc', badge: qcCount },
    { id: 'inventory', label: 'Kho linh kiện', icon: 'inventory' },
    { id: 'shipments', label: 'Giao nhận', icon: 'shipments' },
    { id: 'partners', label: 'Đối tác', icon: 'partners' },
    { id: 'warranty', label: 'Bảo hành', icon: 'warranty' },
  ];

  const systemNav: NavItemDef[] = [
    { id: 'branches', label: 'Quản lý Chi nhánh', icon: 'spark' },
    { id: 'users', label: 'Tài khoản & Phân quyền', icon: 'customers' },
    { id: 'payments', label: 'Thanh toán', icon: 'payments' },
    { id: 'kpi', label: 'Hiệu suất KPI', icon: 'kpi' },
    { id: 'audit', label: 'Nhật ký hoạt động', icon: 'audit' },
  ];

  // Super Admin Platform Navigation
  const platformOperationsNav: NavItemDef[] = [
    { id: 'platform-stores', label: 'Danh sách Gian hàng', icon: 'spark', href: '/platform/stores' },
    { id: 'platform-approvals', label: 'Duyệt đăng ký', icon: 'spark', href: '/platform/approvals' },
    { id: 'platform-plans', label: 'Gói cước & Bản quyền', icon: 'payments', href: '/platform/plans' },
  ];

  const platformMonitoringNav: NavItemDef[] = [
    { id: 'platform-dashboard', label: 'Tổng quan Toàn sàn', icon: 'dashboard', href: '/platform' },
    { id: 'platform-billing', label: 'Doanh thu SaaS', icon: 'payments', href: '/platform/billing' },
  ];

  const platformRevenueConfigNav: NavItemDef[] = [
    { id: 'platform-integrations', label: 'Tài khoản nhận tiền SePay', icon: 'spark', href: '/platform/integrations' },
  ];

  const renderPlatformNavGroup = (caption: string, items: NavItemDef[], spaced = false) => {
    return (
      <div className="mb-2">
        <div
          className={`px-3 pb-2 text-xs font-bold text-[#86968f] tracking-[1.1px] uppercase ${
            spaced ? 'pt-4' : 'pt-1'
          }`}
        >
          {caption}
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const cleanPath = currentPath.replace(/^\//, '');
            const itemPath = item.href ? item.href.replace(/^\//, '') : item.id;
            const isActive =
              cleanPath === itemPath ||
              currentPath === item.href ||
              currentPath === item.id ||
              (item.id === 'platform-dashboard' && (cleanPath === 'platform' || cleanPath === 'platform/dashboard'));
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  try {
                    if (navRef.current) {
                      sessionStorage.setItem('podscare_sidebar_scroll', String(navRef.current.scrollTop));
                    }
                  } catch {
                    // ignore
                  }
                  onNavigate(item.href || item.id);
                  onClose?.();
                }}
                className={`w-full h-10 rounded-[8px] flex items-center gap-3 px-3 text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#eaf4ef] text-[#176b58] font-bold shadow-xs'
                    : 'text-[#596962] hover:bg-[#f5f8f6] hover:text-[#1c302b]'
                }`}
              >
                <span className="w-5 grid place-items-center text-center flex-none">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="truncate flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <em
                    className={`not-italic ml-auto text-xs px-2 py-0.5 rounded-[10px] font-semibold flex-none ${
                      isActive ? 'bg-[#d8ece1] text-[#176b58]' : 'bg-[#eef2ef] text-[#6b7b74]'
                    }`}
                  >
                    {item.badge}
                  </em>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };


  const renderNavGroup = (caption: string, items: NavItemDef[], spaced = false) => {
    // Filter items based on current role permissions
    const filteredItems = items.filter((item) => allowedIds.includes(item.id));

    // If no items in this group are allowed for this role, automatically hide the entire group
    if (filteredItems.length === 0) {
      return null;
    }

    return (
      <div className="mb-2">
        <div
          className={`px-3 pb-2 text-xs font-bold text-[#86968f] tracking-[1.1px] uppercase ${
            spaced ? 'pt-4' : 'pt-1'
          }`}
        >
          {caption}
        </div>
        <div className="space-y-1">
          {filteredItems.map((item) => {
            const isActive =
              currentPath === item.id ||
              currentPath === `/${item.id}` ||
              (item.href ? currentPath === item.href.replace(/^\//, '') : false);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  try {
                    if (navRef.current) {
                      sessionStorage.setItem('podscare_sidebar_scroll', String(navRef.current.scrollTop));
                    }
                  } catch {
                    // ignore
                  }
                  onNavigate(item.href ? item.href.replace(/^\//, '') : item.id);
                  onClose?.();
                }}
                className={`w-full h-10 rounded-[8px] flex items-center gap-3 px-3 text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#eaf4ef] text-[#176b58] font-bold shadow-xs'
                    : 'text-[#596962] hover:bg-[#f5f8f6] hover:text-[#1c302b]'
                }`}
              >
                <span className="w-5 grid place-items-center text-center flex-none">
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="truncate flex-1">{item.label}</span>
                {item.badge !== undefined && (
                  <em
                    className={`not-italic ml-auto text-xs px-2 py-0.5 rounded-[10px] font-semibold flex-none ${
                      isActive ? 'bg-[#d8ece1] text-[#176b58]' : 'bg-[#eef2ef] text-[#6b7b74]'
                    }`}
                  >
                    {item.badge}
                  </em>
                )}
                {item.hasDot && (
                  <span className="w-2 h-2 rounded-full bg-[#d49342] ml-auto flex-none" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-[#17251f]/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-[260px] bg-white border-r border-[#e5ece8] flex flex-col p-4 z-50 transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-2 pb-4 border-b border-[#f0f3f1] mb-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="FIXO Logo"
              className="w-8 h-8 rounded-[8px] object-cover shadow-sm flex-none"
            />
            <div>
              <b className="font-heading font-extrabold text-[20px] tracking-[-1px] text-[#1c302b] block leading-none">
                FIXO
              </b>
              <small className="block text-xs tracking-[1.2px] text-[#819089] font-bold mt-1 uppercase">
                REPAIR OPERATING SYSTEM
              </small>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden text-[#708078] hover:text-[#1c302b] text-xl p-1"
            >
              ×
            </button>
          )}
        </div>

        {/* Branch Selector Dropdown / Platform Core Header / Static Read-only Badge */}
        {normalizedRole === 'super_admin' ? (
          <div className="relative mb-3 z-30">
            <div className="w-full flex items-center justify-between p-2.5 bg-[#f7f9f7] border border-[#edf1ee] rounded-[10px]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-[8px] bg-[#176b58] text-white grid place-items-center flex-none font-bold text-xs tracking-wider">
                  PL
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs font-black tracking-[0.5px] text-[#1c302b] uppercase truncate">
                    FIXO PLATFORM CORE
                  </strong>
                  <span className="block text-[11px] text-[#718279] font-medium truncate">
                    Quản trị Nền tảng
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#eaf4ef] border border-[#d0e5d9] flex-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                <span className="text-[10px] font-bold text-[#176b58] uppercase tracking-wider">Live</span>
              </div>
            </div>
          </div>
        ) : normalizedRole === 'admin' ? (
          <div ref={branchDropdownRef} className="relative mb-3 z-30">
            <button
              type="button"
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              className={`w-full flex items-center gap-2.5 p-2.5 bg-[#f7f9f7] hover:bg-[#edf4f0] border rounded-[10px] transition-all text-left ${
                branchDropdownOpen
                  ? 'border-[#75a994] ring-2 ring-[#176b58]/15 bg-[#edf4f0]'
                  : 'border-[#edf1ee]'
              }`}
            >
              <div className="w-8 h-8 rounded-[8px] bg-[#e4eee8] text-[#176b58] grid place-items-center flex-none">
                <Icon name="spark" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <small className="block text-xs tracking-[0.5px] text-[#7f8f87] font-bold uppercase">
                  CHI NHÁNH ĐANG XEM
                </small>
                <strong className="block text-sm text-[#1c302b] truncate font-semibold">
                  {branchName}
                </strong>
              </div>
              <span
                className={`text-[#7d8983] text-xs transition-transform duration-200 ${
                  branchDropdownOpen ? 'rotate-180 text-[#176b58]' : ''
                }`}
              >
                ⌄
              </span>
            </button>

            {branchDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setBranchDropdownOpen(false)}
                />
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-[#dce5e0] rounded-[10px] shadow-2xl py-1 z-50 divide-y divide-[#f2f5f3]">
                  <div className="px-3 py-1.5 text-xs font-bold text-[#86958e] uppercase tracking-wider">
                    CHỌN CHI NHÁNH / KHO
                  </div>
                  <div className="py-1 max-h-[220px] overflow-y-auto">
                    {(
                      branches || [
                        { id: 'all', name: 'Tất cả chi nhánh', code: 'ALL' },
                        { id: 1, name: 'FIXO · Quận 1', code: 'Q1' },
                        { id: 2, name: 'FIXO · Quận 3', code: 'Q3' },
                        { id: 3, name: 'FIXO · TP. Thủ Đức', code: 'THUDUC' },
                      ]
                    ).map((b) => {
                      const isSelected = selectedBranchId
                        ? String(selectedBranchId) === String(b.id)
                        : branchName === b.name;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            onBranchChange?.(b);
                            setBranchDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left ${
                            isSelected
                              ? 'bg-[#eaf4ef] text-[#176b58] font-bold'
                              : 'text-[#475750] hover:bg-[#f6f9f7] hover:text-[#1c302b]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {b.code && (
                              <span
                                className={`text-xs font-mono px-1.5 py-0.5 rounded font-bold ${
                                  isSelected
                                    ? 'bg-[#d0e8dd] text-[#176b58]'
                                    : 'bg-[#eef2ef] text-[#6a7b73]'
                                }`}
                              >
                                {b.code}
                              </span>
                            )}
                            <span className="truncate">{b.name}</span>
                          </div>
                          {isSelected && (
                            <span className="text-[#176b58] text-xs font-bold ml-1.5 flex-none">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-1.5 border-t border-[#f0f3f1] bg-[#fafbfa]">
                    <button
                      type="button"
                      onClick={() => {
                        setBranchDropdownOpen(false);
                        onNavigate('branches');
                        onClose?.();
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-[6px] text-xs font-bold text-[#176b58] hover:bg-[#eaf4ef] transition-colors"
                    >
                      <span className="text-sm font-bold leading-none">+</span>
                      <span>Thêm chi nhánh mới</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="relative mb-3 z-30">
            <div
              className="w-full flex items-center gap-2.5 p-2.5 bg-[#f7f9f7] border border-[#edf1ee] rounded-[10px] cursor-default select-none pointer-events-none text-left"
            >
              <div className="w-8 h-8 rounded-[8px] bg-[#e4eee8] text-[#176b58] grid place-items-center flex-none">
                <Icon name="building" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <small className="block text-xs tracking-[0.5px] text-[#7f8f87] font-bold uppercase">
                  CHI NHÁNH CỦA BẠN
                </small>
                <strong className="block text-sm text-[#1c302b] truncate font-semibold">
                  {branchName}
                </strong>
              </div>
              <div className="text-[#8e9f97] flex-none px-1" title="Chi nhánh cố định">
                <Icon name="lock" size={14} />
              </div>
            </div>
          </div>
        )}


        {/* Scrollable Navigation */}
        <nav
          ref={navRef}
          onScroll={(e) => {
            try {
              sessionStorage.setItem('podscare_sidebar_scroll', String(e.currentTarget.scrollTop));
            } catch {
              // ignore
            }
          }}
          className="flex-1 overflow-y-auto pr-1 space-y-1 relative z-10"
        >
          {normalizedRole === 'super_admin' ? (
            <>
              {renderPlatformNavGroup('ĐIỀU HÀNH NỀN TẢNG', platformOperationsNav)}
              {renderPlatformNavGroup('GIÁM SÁT TOÀN SÀN', platformMonitoringNav, true)}
              {renderPlatformNavGroup('CẤU HÌNH DOANH THU', platformRevenueConfigNav, true)}
            </>
          ) : (
            <>
              {renderNavGroup('WORKSPACE', workspaceNav)}
              {renderNavGroup('VẬN HÀNH', operationsNav, true)}
              {renderNavGroup('HỆ THỐNG', systemNav, true)}
            </>
          )}
        </nav>


        {/* Sidebar Bottom: Help & Profile */}
        <div className="pt-2 border-t border-[#f0f3f1] mt-auto flex-none">
          <div className="border border-[#e5ece8] rounded-[10px] p-3 mb-2.5 bg-[#fbfcfb]">
            <div className="text-[#bd8738] text-base mb-1">✳</div>
            <strong className="text-sm font-bold text-[#1c302b] block">Cần trợ giúp?</strong>
            <p className="text-xs text-[#798880] leading-normal my-1">
              Xem tài liệu và quy trình chuẩn FIXO Repair OS.
            </p>
            <button
              type="button"
              onClick={() => {
                if (onHelpClick) {
                  onHelpClick();
                } else {
                  toast('Trung tâm trợ giúp: Hotline 1900 8888 hoặc fixo.com.vn/support', 'info');
                }
              }}
              className="text-[#176b58] font-bold text-xs flex items-center gap-1 hover:underline cursor-pointer"
            >
              Mở trung tâm <span>↗</span>
            </button>
          </div>

          <div className="flex items-center gap-3 pt-2.5 border-t border-[#f0f3f1]">
            <Avatar initials={user.initials || 'NV'} variant="dark" size="md" />
            <div className="min-w-0 flex-1">
              <b className="block text-sm text-[#1c302b] font-bold truncate">{user.name}</b>
              <small className="block text-xs text-[#7c8b84] truncate">{user.roleLabel}</small>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Đăng xuất"
                aria-label="Đăng xuất"
                className="w-8 h-8 rounded-[7px] text-[#708078] hover:bg-[#f1f4f2] hover:text-[#bc5b52] grid place-items-center text-sm transition-colors"
              >
                <Icon name="logout" size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
