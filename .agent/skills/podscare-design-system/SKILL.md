---
name: podscare-design-system
description: Hệ thống Design Tokens, bảng màu Calm Jade & Warm Ivory, typography Manrope + DM Sans và bộ UI Components chuẩn từ PodsCare Repair OS. Nghiêm cấm sử dụng gradient tùy tiện.
license: MIT
metadata:
  author: Antigravity
  version: "1.0.0"
  framework: "React, Next.js, Tailwind CSS"
---

# PodsCare Design System Skill

Kỹ năng định chuẩn giao diện (Design System) và hệ thống tokens dành cho hệ điều hành sửa chữa thiết bị **PodsCare Repair OS**, được trích xuất và chuẩn hóa 100% từ nguyên mẫu gốc `PodsCare-Prototype.html`.

---

## 1. Nguyên Tắc Thiết Kế Bất Biến (Design Principles)

1. **Tuyệt đối không dùng Gradient tùy tiện**: Mọi bề mặt thẻ (cards), nút bấm (buttons), thanh điều hướng đều sử dụng màu đơn sắc (solid colors) hoặc viền mỏng (1px border). Không tự ý pha trộn gradient đa sắc hay hiệu ứng bóng kính (glassmorphism) màu mè.
2. **Tone màu y tế / kỹ thuật chuẩn xác (Calm Jade & Warm Ivory)**:
   - Mang lại cảm giác sạch sẽ, tin cậy, chính xác và chuyên nghiệp như phòng lab kỹ thuật Apple.
3. **Phân cấp thị giác rõ ràng (High Contrast & Clear Hierarchy)**:
   - Tiêu đề, số liệu KPI, tên thương hiệu: Sử dụng font **Manrope** (semi-bold đến extra-bold).
   - Nội dung bảng, nhãn trường, văn bản hướng dẫn: Sử dụng font **DM Sans** (regular đến medium).
4. **Nghiêm cấm thêm icon linh tinh / tùy tiện (Strict Standard Icons Only)**:
   - Tuyệt đối không cài thêm các thư viện icon bên ngoài (lucide-react, react-icons, fontawesome...) hoặc chèn SVG thô tùy tiện vào giao diện.
   - BẮT BUỘC sử dụng 100% bộ icon chuẩn tập trung tại `packages/ui/src/atoms/Icons.tsx` thông qua component `<Icon name="..." />`. Trường hợp phát sinh nghiệp vụ cần icon mới, phải định nghĩa bổ sung trực tiếp vào `iconPaths` trong `Icons.tsx` với chuẩn strokeWidth={1.7}, viewBox="0 0 24 24".

---

## 2. Hệ Thống Design Tokens Chuẩn (Color Palette & Variables)

### 2.1. Brand & Surface Colors
| Token Variable | HEX Code | Tailwind Class tương đương | Mục đích sử dụng |
| :--- | :--- | :--- | :--- |
| `--green` / Primary | `#176b51` (`#176b58`) | `bg-brand-primary` / `text-brand-primary` | Màu nhận diện thương hiệu, nút chính, điểm nhấn |
| Primary Hover | `#10583f` (`#125945`) | `hover:bg-brand-hover` | Trạng thái hover của nút bấm chính |
| Primary Light | `#e9f4ef` (`#e7f3ee`) | `bg-brand-light` | Nền icon, badge trạng thái active, hover menu |
| Brand Mark Solid | `#196d52` | `bg-brand-mark` | Nền logo biểu tượng tai nghe |
| Brand Mark Accent | `#c8eadb` | `bg-brand-accent` | 2 vạch biểu tượng trong logo |
| `--bg` / Canvas | `#f6f8f6` (`#f4f7f5`) | `bg-surface-canvas` | Màu nền canvas toàn trang |
| `--white` / Card Surface | `#ffffff` | `bg-surface-card` | Màu nền panel, card, modal, bảng dữ liệu |
| `--line` / Border | `#e9eeeb` (`#e5ece8`) | `border-line` | Đường kẻ chia ngăn, viền panel, viền bảng |
| `--ink` / Text Primary | `#17231f` (`#1c302b`) | `text-ink-primary` | Màu chữ chính, tiêu đề |
| `--muted` / Text Muted | `#81908a` / `#758780` | `text-ink-muted` | Chú thích phụ, subtitle, placeholder |

### 2.2. Bảng Màu Trạng Thái Nghiệp Vụ (Semantic Status Badges)
Mỗi trạng thái đơn hàng đều có cặp màu (Chữ đậm + Nền nhạt) cùng một chấm tròn `5px` đồng màu:
- **`wait` (Chờ khách duyệt / Chờ tiếp nhận)**: Chữ `#b77a21` (hoặc `#a4722f`), Nền `#faf3e7`.
- **`progress` (Đang sửa / Đang kiểm tra / Đang giao)**: Chữ `#4778a4` (hoặc `#437a9d`), Nền `#edf4f8`.
- **`ready` (Sẵn sàng trả / QC đạt / Đã giao)**: Chữ `#28805e` (hoặc `#28765a`), Nền `#eaf5ef`.
- **`danger` (Lỗi / QC từ chối / Hủy)**: Chữ `#bc5b52` (hoặc `#b75e51`), Nền `#fbefed`.
- **`new` (Đơn mới tạo)**: Chữ `#7e729c`, Nền `#f2eff8`.
- **`gray` (Không kiểm tra / Lưu trữ)**: Chữ `#77847e`, Nền `#f0f3f1`.

---

## 3. Typography & Spacing Scale

- **Font chữ chính**:
  ```css
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ```
- **Font chữ tiêu đề & chỉ số**:
  ```css
  font-family: 'Manrope', 'DM Sans', sans-serif;
  ```
- **Kích thước tiêu chuẩn**:
  - `h1`: `23px` (Desktop) / `20px` (Mobile), font-weight: 700, letter-spacing: `-0.7px`.
  - `h2`: `16px` - `17px`, font-weight: 700.
  - `h3`: `12px` (Panel title), font-weight: 700.
  - `stat-value`: `24px`, font-weight: 700, letter-spacing: `-0.8px`.
  - `body`: `13px` (Desktop) / `14px` (Mobile).
  - `table-td`: `10px`.
  - `caption / eyebrow`: `8px` - `9px`, uppercase, letter-spacing: `1.05px`, font-weight: 700.

---

## 4. Shared Tailwind Preset (`packages/config-tailwind/tailwind.preset.js`)

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#176b51',
          hover: '#10583f',
          light: '#e9f4ef',
          mark: '#196d52',
          accent: '#c8eadb',
        },
        surface: {
          canvas: '#f6f8f6',
          card: '#ffffff',
          panel: '#fafbfa',
        },
        ink: {
          primary: '#17231f',
          muted: '#81908a',
          subtle: '#9aa59f',
        },
        line: {
          DEFAULT: '#e9eeeb',
          subtle: '#f0f3f1',
        },
        status: {
          wait: { text: '#b77a21', bg: '#faf3e7' },
          progress: { text: '#4778a4', bg: '#edf4f8' },
          ready: { text: '#28805e', bg: '#eaf5ef' },
          danger: { text: '#bc5b52', bg: '#fbefed' },
          new: { text: '#7e729c', bg: '#f2eff8' },
          gray: { text: '#77847e', bg: '#f0f3f1' },
        }
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'sans-serif'],
        heading: ['var(--font-manrope)', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 5px rgba(36, 60, 41, 0.03)',
        modal: '0 24px 90px rgba(18, 37, 27, 0.18)',
        soft: '0 12px 38px rgba(28, 49, 34, 0.04)',
      },
      borderRadius: {
        card: '10px',
        btn: '7px',
        badge: '20px',
      }
    }
  }
};
```

---

## 5. Mẫu React Component Chuẩn

### 5.1. Status Badge Component
```tsx
import React from 'react';

type StatusType = 'wait' | 'progress' | 'ready' | 'danger' | 'new' | 'gray';

interface StatusTagProps {
  label: string;
  type: StatusType;
}

const statusColorMap: Record<StatusType, string> = {
  wait: 'text-[#b77a21] bg-[#faf3e7]',
  progress: 'text-[#4778a4] bg-[#edf4f8]',
  ready: 'text-[#28805e] bg-[#eaf5ef]',
  danger: 'text-[#bc5b52] bg-[#fbefed]',
  new: 'text-[#7e729c] bg-[#f2eff8]',
  gray: 'text-[#77847e] bg-[#f0f3f1]',
};

export const StatusTag: React.FC<StatusTagProps> = ({ label, type }) => {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[20px] text-[8px] font-semibold ${statusColorMap[type]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};
```

### 5.2. Primary & Ghost Button Component
```tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-[7px] font-semibold transition-colors";
  const sizeClasses = size === 'sm' ? "h-7 px-2.5 text-[9px]" : "h-[34px] px-3 text-[10px]";
  
  const variantClasses = {
    primary: "bg-[#176b51] text-white hover:bg-[#10583f] border border-[#176b51]",
    secondary: "bg-white text-[#516059] border border-[#e2e9e4] hover:bg-[#fafcfb] hover:border-[#b7ccc0]",
    ghost: "bg-transparent text-[#708078] hover:bg-[#f1f4f2] border-0",
  }[variant];

  return (
    <button className={`${base} ${sizeClasses} ${variantClasses} ${className}`} {...props}>
      {icon && <span className="text-[14px]">{icon}</span>}
      {children}
    </button>
  );
};
```

---

## 6. Quy Định In Ấn A4 2 Liên (Print Stylesheet)
Khi xuất phiếu tiếp nhận cho khách hàng, tuân thủ cấu trúc print:
```css
@media print {
  body > *:not(#printSheet) {
    display: none !important;
  }
  #printSheet {
    display: block !important;
    font-family: Arial, sans-serif;
    color: #111;
  }
  @page {
    size: A4;
    margin: 8mm;
  }
  .print-receipt {
    min-height: 130mm;
    padding: 8mm 10mm;
    page-break-inside: avoid;
    position: relative;
    font-size: 9pt;
  }
  .print-receipt:first-child {
    border-bottom: 1px dashed #777;
  }
}
```
