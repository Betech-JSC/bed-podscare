import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'FIXO · Repair OS',
  description: 'Hệ điều hành quản lý quy trình sửa chữa thiết bị di động & âm thanh',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-icon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#f4f7f5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className={inter.variable}>
      <head>
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var BUILD_STAMP = 'fixo-v2026.10.10.1';
                  // 1. Huỷ đăng ký toàn bộ Service Workers đang chạy ngầm
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(function(regs) {
                      for (var i = 0; i < regs.length; i++) {
                        regs[i].unregister();
                      }
                    });
                  }
                  // 2. Xoá sạch toàn bộ CacheStorage (window.caches)
                  if ('caches' in window) {
                    caches.keys().then(function(names) {
                      for (var i = 0; i < names.length; i++) {
                        caches.delete(names[i]);
                      }
                    });
                  }
                  // 3. Kiểm tra version và dọn dẹp các cache danh mục cũ trong localStorage
                  var currentVer = localStorage.getItem('fixo_client_ver');
                  if (currentVer !== BUILD_STAMP) {
                    var staleKeys = [
                      'podscare_branches',
                      'podscare_device_profiles',
                      'podscare_categories'
                    ];
                    for (var j = 0; j < staleKeys.length; j++) {
                      localStorage.removeItem(staleKeys[j]);
                    }
                    localStorage.setItem('fixo_client_ver', BUILD_STAMP);
                    // Nếu trước đó từng có phiên bản cũ, ép tải lại trang 1 lần trong êm đẹp
                    if (currentVer) {
                      window.location.reload();
                    }
                  }
                } catch (e) {
                  // Không chặn ứng dụng nếu trình duyệt chặn storage
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.className} font-sans bg-[#f4f7f5] text-[#1c302b] min-h-screen`}
        style={{ fontFamily: "'Inter', var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
