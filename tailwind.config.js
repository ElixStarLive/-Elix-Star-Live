/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Device-width breakpoints. The app is phone-first, so the default
      // Tailwind desktop scale is replaced rather than extended.
      screens: {
        xs: '320px',
        sm: '375px',
        md: '414px',
        lg: '768px',
        xl: '1024px',
      },
      fontSize: {
        'fluid-xs': ['clamp(0.625rem, 2.5vw, 0.75rem)', { lineHeight: '1.2' }],
        'fluid-sm': ['clamp(0.75rem, 3vw, 0.875rem)', { lineHeight: '1.3' }],
        'fluid-base': ['clamp(0.875rem, 3.5vw, 1rem)', { lineHeight: '1.4' }],
        'fluid-lg': ['clamp(1rem, 4vw, 1.25rem)', { lineHeight: '1.4' }],
        'fluid-xl': ['clamp(1.25rem, 5vw, 1.5rem)', { lineHeight: '1.3' }],
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
