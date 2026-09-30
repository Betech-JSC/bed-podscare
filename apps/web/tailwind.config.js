/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@podscare/config-tailwind')],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  plugins: [],
};
