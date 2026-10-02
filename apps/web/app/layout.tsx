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
      <body
        className={`${inter.className} font-sans bg-[#f4f7f5] text-[#1c302b] min-h-screen`}
        style={{ fontFamily: "'Inter', var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
