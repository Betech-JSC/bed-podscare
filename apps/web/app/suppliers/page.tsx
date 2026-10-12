'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SuppliersRedirectComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('tab', 'suppliers');
    router.replace(`/inventory?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-3 border-[#176b58]/20 border-t-[#176b58] animate-spin" />
        <span className="text-sm font-semibold text-[#516158]">
          Đang chuyển hướng sang phân hệ Nhà cung cấp & Sổ nợ...
        </span>
      </div>
    </div>
  );
}

export default function SuppliersRedirectPage() {
  return (
    <Suspense fallback={null}>
      <SuppliersRedirectComponent />
    </Suspense>
  );
}
