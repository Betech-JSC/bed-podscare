/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#176b58', // Calm Jade primary
          DEFAULT: '#176b58',
          hover: '#125945',
          light: '#e7f3ee',
          mark: '#196d52',
          accent: '#c8eadb',
        },
        surface: {
          canvas: '#f4f7f5', // Warm Ivory canvas
          card: '#ffffff',
          panel: '#fafbfa',
        },
        ink: {
          primary: '#1c302b',
          DEFAULT: '#1c302b',
          muted: '#758780',
          subtle: '#9aa59f',
        },
        line: {
          DEFAULT: '#e5ece8',
          subtle: '#f0f3f1',
        },
        status: {
          wait: { text: '#a4722f', bg: '#faf3e7', DEFAULT: '#a4722f' },
          progress: { text: '#437a9d', bg: '#edf4f8', DEFAULT: '#437a9d' },
          ready: { text: '#28805e', bg: '#eaf5ef', DEFAULT: '#28805e' },
          danger: { text: '#bc5b52', bg: '#fbefed', DEFAULT: '#bc5b52' },
          new: { text: '#7e729c', bg: '#f2eff8', DEFAULT: '#7e729c' },
          gray: { text: '#77847e', bg: '#f0f3f1', DEFAULT: '#77847e' },
        }
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        heading: ['var(--font-manrope)', 'Manrope', 'DM Sans', 'sans-serif'],
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
