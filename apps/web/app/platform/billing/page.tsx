'use client';

import React, { useState, useMemo } from 'react';
import { Button, Icon, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';

interface ExpiringStore {
  id: number;
  code: string;
  name: string;
  phone: string;
  plan: string;
  expiresAt: string;
  daysRemaining: number;
}

interface SepayTransaction {
  id: string;
  refCode: string;
  storeCode: string;
  storeName: string;
  planName: string;
  amount: number;
  bank: string;
  timestamp: string;
  status: 'completed' | 'processing';
}

const MOCK_EXPIRING_STORES: ExpiringStore[] = [
  {
    id: 101,
    code: 'FIX-HN02',
    name: 'iCare Service Hà Nội',
    phone: '0912.345.678',
    plan: 'Standard (299k/tháng)',
    expiresAt: '04/10/2026',
    daysRemaining: 2,
  },
  {
    id: 102,
    code: 'FIX-DN01',
    name: 'Apple Care Đà Nẵng',
    phone: '0988.765.432',
    plan: 'Pro Enterprise (599k/tháng)',
    expiresAt: '06/10/2026',
    daysRemaining: 4,
  },
  {
    id: 103,
    code: 'FIX-BD03',
    name: 'Bình Dương Tech Repair',
    phone: '0903.112.233',
    plan: 'Standard (299k/tháng)',
    expiresAt: '08/10/2026',
    daysRemaining: 6,
  },
];

const MOCK_TRANSACTIONS: SepayTransaction[] = [
  {
    id: 'TX-98421',
    refCode: 'SEPAY-882910',
    storeCode: 'FIX-Q1',
    storeName: 'FIXO Flagship Quận 1',
    planName: 'Gói Chuyên nghiệp (12 tháng)',
    amount: 7188000,
    bank: 'MBBank VietQR',
    timestamp: '02/10/2026 09:14',
    status: 'completed',
  },
  {
    id: 'TX-98420',
    refCode: 'SEPAY-882909',
    storeCode: 'FIX-Q3',
    storeName: 'Sài Gòn Mobile Care',
    planName: 'Gói Tiêu chuẩn (6 tháng)',
    amount: 1794000,
    bank: 'Vietcombank VietQR',
    timestamp: '01/10/2026 16:32',
    status: 'completed',
  },
  {
    id: 'TX-98419',
    refCode: 'SEPAY-882905',
    storeCode: 'FIX-TD02',
    storeName: 'Thủ Đức Pods Repair',
    planName: 'Gói Tiêu chuẩn (1 tháng)',
    amount: 299000,
    bank: 'MBBank VietQR',
    timestamp: '30/09/2026 14:20',
    status: 'completed',
  },
  {
    id: 'TX-98418',
    refCode: 'SEPAY-882901',
    storeCode: 'FIX-HP01',
    storeName: 'Hải Phòng SmartFix',
    planName: 'Gói Chuyên nghiệp (1 tháng)',
    amount: 599000,
    bank: 'Techcombank VietQR',
    timestamp: '29/09/2026 11:05',
    status: 'completed',
  },
  {
    id: 'TX-98417',
    refCode: 'SEPAY-882898',
    storeCode: 'FIX-CT01',
    storeName: 'Cần Thơ Audio Lab',
    planName: 'Gói Tiêu chuẩn (3 tháng)',
    amount: 897000,
    bank: 'ACB VietQR',
    timestamp: '28/09/2026 18:45',
    status: 'completed',
  },
];

export default function PlatformBillingPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [expiringList, setExpiringList] = useState<ExpiringStore[]>(MOCK_EXPIRING_STORES);
  const [transactions] = useState<SepayTransaction[]>(MOCK_TRANSACTIONS);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
  };

  const handleRemindStore = (store: ExpiringStore) => {
    setActionLoadingId(store.id);
    setTimeout(() => {
      setActionLoadingId(null);
      toast(`Đã gửi thông báo nhắc phí tới ${store.name} (${store.phone}).`, 'success');
    }, 600);
  };

  const handleRenewStore = (store: ExpiringStore) => {
    setActionLoadingId(store.id);
    setTimeout(() => {
      setActionLoadingId(null);
      setExpiringList((prev) => prev.filter((s) => s.id !== store.id));
      toast(`Gian hàng ${store.name} đã được gia hạn thêm 30 ngày.`, 'success');
    }, 600);
  };

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return transactions;
    return transactions.filter(
      (tx) =>
        tx.refCode.toLowerCase().includes(query) ||
        tx.storeCode.toLowerCase().includes(query) ||
        tx.storeName.toLowerCase().includes(query) ||
        tx.bank.toLowerCase().includes(query)
    );
  }, [transactions, searchQuery]);

  return (
    <AppShell crumbName="Doanh thu SaaS">
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#e2e8f0]">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6] mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
              Quản trị Dòng tiền Tự động
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1c302b]">
              DOANH THU & GIA HẠN SAAS
            </h1>
            <p className="text-sm text-[#596962] mt-1">
              Theo dõi dòng tiền định kỳ MRR, đối soát giao dịch VietQR SePay và cảnh báo hạn dùng toàn sàn.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-[#f0f4f2] text-xs font-semibold text-[#176b58] border border-[#d2ded8]">
              <Icon name="checkCheck" size={14} />
              Cổng SePay: Hoạt động (Live)
            </span>
          </div>
        </div>

        {/* 4 Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: MRR */}
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[#718279] mb-2 font-medium">
              <span>Doanh thu tháng này (MRR)</span>
              <div className="w-7 h-7 rounded-[6px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center">
                <Icon name="payments" size={16} />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#1c302b]">
              14.850.000 đ
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="font-bold text-[#176b58]">+18.5%</span>
              <span className="text-[#86968f]">so với tháng trước</span>
            </div>
          </div>

          {/* Card 2: Active paid stores */}
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[#718279] mb-2 font-medium">
              <span>Gian hàng đang trả phí</span>
              <div className="w-7 h-7 rounded-[6px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center">
                <Icon name="spark" size={16} />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#1c302b]">
              28 gian hàng
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#86968f]">
              <span>Trên tổng số</span>
              <strong className="text-[#1c302b]">32 đối tác</strong>
            </div>
          </div>

          {/* Card 3: Expiring soon */}
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[#718279] mb-2 font-medium">
              <span>Sắp hết hạn (&le; 7 ngày)</span>
              <div className="w-7 h-7 rounded-[6px] bg-[#fffbeb] text-[#b45309] flex items-center justify-center">
                <Icon name="alert" size={16} />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#b45309]">
              {expiringList.length} gian hàng
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className="inline-block w-2 h-2 rounded-full bg-[#f59e0b]" />
              <span className="text-[#86968f]">Cần nhắc phí gia hạn</span>
            </div>
          </div>

          {/* Card 4: SePay Auto Transactions */}
          <div className="bg-white border border-[#e2e8f0] rounded-[10px] p-5 shadow-sm">
            <div className="flex items-center justify-between text-xs text-[#718279] mb-2 font-medium">
              <span>Giao dịch SePay trong tuần</span>
              <div className="w-7 h-7 rounded-[6px] bg-[#eaf4ef] text-[#176b58] flex items-center justify-center">
                <Icon name="check" size={16} />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-[#1c302b]">
              15 giao dịch
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#176b58] font-semibold">
              <span>100% khớp lệnh tự động</span>
            </div>
          </div>
        </div>

        {/* Expiring stores alert block */}
        <div className="bg-white border border-[#e2e8f0] rounded-[10px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f1f5f3] flex items-center justify-between bg-[#fbfdfc]">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
              <h2 className="text-sm font-bold text-[#1c302b] uppercase tracking-wide">
                Cảnh báo Gian hàng sắp hết hạn bản quyền (&le; 7 ngày)
              </h2>
            </div>
            <span className="text-xs text-[#718279]">
              {expiringList.length} đối tác cần hỗ trợ
            </span>
          </div>

          {expiringList.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#718279]">
              Không có gian hàng nào sắp hết hạn trong 7 ngày tới. Tất cả bản quyền đang hoạt động ổn định.
            </div>
          ) : (
            <div className="divide-y divide-[#f1f5f3] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#f8faf9] text-[#718279] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Mã & Gian hàng</th>
                    <th className="px-5 py-3">Số điện thoại</th>
                    <th className="px-5 py-3">Gói cước</th>
                    <th className="px-5 py-3">Ngày hết hạn</th>
                    <th className="px-5 py-3">Thời gian còn lại</th>
                    <th className="px-5 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f3] text-[#334155]">
                  {expiringList.map((store) => (
                    <tr key={store.id} className="hover:bg-[#fafbfb] transition-colors">
                      <td className="px-5 py-3.5 font-medium">
                        <span className="font-mono text-[11px] font-bold text-[#176b58] bg-[#eaf4ef] px-1.5 py-0.5 rounded mr-2">
                          {store.code}
                        </span>
                        <strong className="text-[#1c302b]">{store.name}</strong>
                      </td>
                      <td className="px-5 py-3.5 text-[#596962]">{store.phone}</td>
                      <td className="px-5 py-3.5 font-semibold text-[#1c302b]">{store.plan}</td>
                      <td className="px-5 py-3.5 font-medium">{store.expiresAt}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                          Còn {store.daysRemaining} ngày
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoadingId === store.id}
                          onClick={() => handleRemindStore(store)}
                        >
                          Gửi nhắc phí
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={actionLoadingId === store.id}
                          onClick={() => handleRenewStore(store)}
                        >
                          Gia hạn nhanh
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sepay VietQR Transaction History Table */}
        <div className="bg-white border border-[#e2e8f0] rounded-[10px] shadow-sm overflow-hidden">
          <div className="p-5 border-b border-[#f1f5f3] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#fbfdfc]">
            <div>
              <h2 className="text-sm font-bold text-[#1c302b] uppercase tracking-wide">
                Lịch sử Giao dịch SePay VietQR Toàn sàn
              </h2>
              <p className="text-xs text-[#718279] mt-0.5">
                Các khoản thanh toán gia hạn bản quyền được SePay đối soát và ghi nhận tự động.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <Input
                type="text"
                placeholder="Tìm theo mã GD, tên gian hàng..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8faf9] text-[#718279] font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Mã SePay</th>
                  <th className="px-5 py-3">Gian hàng</th>
                  <th className="px-5 py-3">Gói bản quyền</th>
                  <th className="px-5 py-3">Số tiền</th>
                  <th className="px-5 py-3">Kênh thanh toán</th>
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-5 py-3 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f3] text-[#334155]">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#fafbfb] transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono font-bold text-[#1c302b]">{tx.refCode}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <strong className="block text-[#1c302b]">{tx.storeName}</strong>
                        <span className="text-[11px] text-[#718279] font-mono">{tx.storeCode}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-[#1c302b]">{tx.planName}</td>
                    <td className="px-5 py-3.5 font-bold text-[#176b58] text-sm">
                      {formatVnd(tx.amount)}
                    </td>
                    <td className="px-5 py-3.5 text-[#596962]">{tx.bank}</td>
                    <td className="px-5 py-3.5 text-[#718279]">{tx.timestamp}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                        Thành công
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-xs text-[#718279]">
                      Không tìm thấy giao dịch nào phù hợp với từ khóa &quot;{searchQuery}&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
