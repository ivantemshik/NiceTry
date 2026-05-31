/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Дизайн-система из index.html
        blue: {
          DEFAULT: '#1C8CE3',
          50: '#EAF4FD',
          100: '#D6EAFB',
          200: '#BFDDF7',
          600: '#1577C7',
          700: '#0F62A8',
          800: '#0B4E86',
        },
        navy: '#0F1E2E',
        ink: '#10202E',
        muted: {
          DEFAULT: '#5B6472',
          2: '#869099',
        },
        border: {
          DEFAULT: '#E6EAF0',
          2: '#EDF1F6',
        },
        bg: '#F4F7FA',
        surface: '#FFFFFF',
        green: {
          DEFAULT: '#15A05A',
          bg: '#E7F6ED',
        },
        red: {
          DEFAULT: '#D63B3B',
          bg: '#FBEAEA',
        },
        amber: {
          DEFAULT: '#C9821A',
          bg: '#FCF1DF',
        },
        gray: {
          DEFAULT: '#8A949E',
          bg: '#EFF2F5',
        },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        DEFAULT: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(16,32,46,.06)',
        DEFAULT: '0 4px 14px rgba(16,32,46,.08)',
        lg: '0 12px 34px rgba(16,32,46,.14)',
      },
      maxWidth: {
        container: '1280px',
      },
    },
  },
  plugins: [],
}
