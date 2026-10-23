/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#176b51', // Calm Jade primary
          DEFAULT: '#176b51',
          hover: '#10583f',
          light: '#e9f4ef',
          mark: '#196d52',
          accent: '#c8eadb',
        },
        surface: {
          canvas: '#f6f8f6', // Warm Ivory canvas
          card: '#ffffff',
          panel: '#fafbfa',
        },
        ink: {
          primary: '#17231f',
          DEFAULT: '#17231f',
          muted: '#81908a',
          subtle: '#9aa59f',
        },
        line: {
          DEFAULT: '#e9eeeb',
          subtle: '#f0f3f1',
        },
        status: {
          wait: { text: '#b77a21', bg: '#faf3e7', DEFAULT: '#b77a21' },
          progress: { text: '#4778a4', bg: '#edf4f8', DEFAULT: '#4778a4' },
          ready: { text: '#28805e', bg: '#eaf5ef', DEFAULT: '#28805e' },
          danger: { text: '#bc5b52', bg: '#fbefed', DEFAULT: '#bc5b52' },
          new: { text: '#7e729c', bg: '#f2eff8', DEFAULT: '#7e729c' },
          gray: { text: '#77847e', bg: '#f0f3f1', DEFAULT: '#77847e' },
        }
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['var(--font-manrope)', 'Manrope', 'DM Sans', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
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

