'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button, Icon, Input, useToast } from '@podscare/ui';
import { AppShell } from '../../components/AppShell';
import { platformService } from '@podscare/api-client';

interface ExpiringStore {
  id: number;
  code: string;
  name: string;
  phone: string;
  plan: string;
  expiresAt: string;
  daysRemaining: number;
}

interface SepayTransactionItem {
  id: string | number;
  refCode: string;
  storeCode: string;
  storeName: string;
  planName: string;
  amount: number;
  bank: string;
  timestamp: string;
  status: 'completed' | 'processing' | 'pending' | 'failed' | 'paid' | string;
}

export default function PlatformBillingPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [expiringList, setExpiringList] = useState<ExpiringStore[]>([]);
  const [transactions, setTransactions] = useState<SepayTransactionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Dynamic KPI Stats
  const [stats, setStats] = useState({
    mrr: 0,
    mrrFormatted: '0 đ',
    mrrGrowth: 0,
    activeStoresCount: 0,
    totalStoresCount: 0,
    expiringSoonCount: 0,
    weeklyTransactionsCount: 0,
  });

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN').format(amount) + ' đ';
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, txRes] = await Promise.allSettled([
        platformService.getBillingStats(),
        platformService.getTransactions(),
      ]);

      if (statsRes.status === 'fulfilled') {
        const raw = statsRes.value?.data || statsRes.value;
        const mrrVal = Number(raw?.mrr) || 0;
        setStats({
          mrr: mrrVal,
          mrrFormatted: raw?.mrr_formatted || formatVnd(mrrVal),
          mrrGrowth: Number(raw?.mrr_growth_percentage) || 0,
          activeStoresCount: Number(raw?.active_stores_count) || 0,
          totalStoresCount: Number(raw?.total_stores_count) || 0,
          expiringSoonCount: Number(raw?.expiring_soon_count) || 0,
          weeklyTransactionsCount: Number(raw?.weekly_sepay_transactions_count) || 0,
        });

        if (Array.isArray(raw?.expiring_stores)) {
          const mappedExpiring: ExpiringStore[] = raw.expiring_stores.map((s: any) => ({
            id: s.id,
            code: s.code || `FIX-${s.id}`,
            name: s.name,
            phone: s.phone || '',
            plan: s.plan || s.subscription_plan || 'Standard',
            expiresAt: s.expires_at || s.expiresAt || '',
            daysRemaining: s.days_remaining !== undefined ? Number(s.days_remaining) : (s.daysRemaining || 0),
          }));
          setExpiringList(mappedExpiring);
        } else {
          setExpiringList([]);
        }
      }

      if (txRes.status === 'fulfilled') {
        const rawTx = txRes.value?.data || txRes.value;
        const list = Array.isArray(rawTx) ? rawTx : (rawTx?.data || []);
        if (Array.isArray(list)) {
          const mappedTx: SepayTransactionItem[] = list.map((tx: any) => ({
            id: tx.id || tx.ref_code || Math.random(),
            refCode: tx.ref_code || tx.reference_code || tx.code || `TX-${tx.id}`,
            storeCode: tx.store_code || tx.tenant?.code || tx.store?.code || 'FIX-STORE',
            storeName: tx.store_name || tx.tenant?.name || tx.store?.name || 'Gian hàng',
            planName: tx.plan_name || tx.plan?.name || 'Gói bản quyền',
            amount: Number(tx.amount) || 0,
            bank: tx.bank || tx.bank_name || tx.payment_method || 'VietQR SePay',
            timestamp: tx.timestamp || tx.created_at || '',
            status: tx.status === 'paid' ? 'completed' : (tx.status || 'completed'),
          }));
          setTransactions(mappedTx);
        } else {
          setTransactions([]);
        }
      }
    } catch (err) {
      console.warn('Could not fetch platform billing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRemindStore = async (store: ExpiringStore) => {
    setActionLoadingId(store.id);
    try {
      await platformService.remindFee(store.id);
      toast(`Đã gửi thông báo nhắc phí tới ${store.name} (${store.phone}).`, 'success');
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể gửi nhắc phí lúc này.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRenewStore = async (store: ExpiringStore) => {
    setActionLoadingId(store.id);
    try {
      await platformService.renewStore(store.id, { days: 30 });
      setExpiringList((prev) => prev.filter((s) => s.id !== store.id));
      setStats((prev) => ({
        ...prev,
        expiringSoonCount: Math.max(0, prev.expiringSoonCount - 1),
      }));
      toast(`Gian hàng ${store.name} đã được gia hạn thành công thêm 30 ngày.`, 'success');
      loadData();
    } catch (err: any) {
      toast(err?.response?.data?.message || err?.message || 'Không thể gia hạn gian hàng.', 'error');
    } finally {
      setActionLoadingId(null);
    }
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
            <Button
              variant="outline"
              size="sm"
              loading={loading}
              onClick={loadData}
            >
              Làm mới dữ liệu
            </Button>
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
              {loading ? 'Đang tính...' : stats.mrrFormatted}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {stats.mrrGrowth !== 0 ? (
                <>
                  <span className={`font-bold ${stats.mrrGrowth >= 0 ? 'text-[#176b58]' : 'text-[#ef4444]'}`}>
                    {stats.mrrGrowth >= 0 ? `+${stats.mrrGrowth}%` : `${stats.mrrGrowth}%`}
                  </span>
                  <span className="text-[#86968f]">so với tháng trước</span>
                </>
              ) : (
                <span className="text-[#86968f]">Cập nhật theo dữ liệu thực tế</span>
              )}
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
              {loading ? '...' : `${stats.activeStoresCount} gian hàng`}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#86968f]">
              <span>Trên tổng số</span>
              <strong className="text-[#1c302b]">{stats.totalStoresCount} đối tác</strong>
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
              {loading ? '...' : `${stats.expiringSoonCount || expiringList.length} gian hàng`}
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
              {loading ? '...' : `${stats.weeklyTransactionsCount || transactions.length} giao dịch`}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-[#176b58] font-semibold">
              <span>Khớp lệnh tự động qua Webhook</span>
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

          {loading ? (
            <div className="p-8 text-center text-xs text-[#718279]">
              Đang tải danh sách gian hàng sắp hết hạn...
            </div>
          ) : expiringList.length === 0 ? (
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
                      <td className="px-5 py-3.5 text-[#596962]">{store.phone || '—'}</td>
                      <td className="px-5 py-3.5 font-semibold text-[#1c302b]">{store.plan}</td>
                      <td className="px-5 py-3.5 font-medium">{store.expiresAt || '—'}</td>
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
                          {actionLoadingId === store.id ? 'Đang gửi...' : 'Gửi nhắc phí'}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={actionLoadingId === store.id}
                          onClick={() => handleRenewStore(store)}
                        >
                          {actionLoadingId === store.id ? 'Đang gia hạn...' : 'Gia hạn nhanh'}
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
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-xs text-[#718279]">
                      Đang tải lịch sử giao dịch...
                    </td>
                  </tr>
                ) : filteredTransactions.map((tx) => (
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
                    <td className="px-5 py-3.5 text-[#718279]">{tx.timestamp || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eaf4ef] text-[#176b58] border border-[#cde2d6]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                        {tx.status === 'completed' || tx.status === 'paid' ? 'Thành công' : tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-xs text-[#718279]">
                      {searchQuery
                        ? `Không tìm thấy giao dịch nào phù hợp với từ khóa "${searchQuery}".`
                        : 'Chưa có giao dịch SePay nào được ghi nhận.'}
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
