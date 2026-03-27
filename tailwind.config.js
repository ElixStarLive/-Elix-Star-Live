/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        'xs': '320px',
        'sm': '375px',
        'md': '414px',
        'lg': '768px',
        'xl': '1024px',
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },
      colors: {
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        rose: "var(--color-rose)",
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
      },
      fontFamily: {
        sans: ["Inter", "Roboto", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      fontSize: {
        'fluid-xs': ['clamp(0.625rem, 2.5vw, 0.75rem)', { lineHeight: '1.2' }],
        'fluid-sm': ['clamp(0.75rem, 3vw, 0.875rem)', { lineHeight: '1.3' }],
        'fluid-base': ['clamp(0.875rem, 3.5vw, 1rem)', { lineHeight: '1.4' }],
        'fluid-lg': ['clamp(1rem, 4vw, 1.25rem)', { lineHeight: '1.4' }],
        'fluid-xl': ['clamp(1.25rem, 5vw, 1.5rem)', { lineHeight: '1.3' }],
        'fluid-2xl': ['clamp(1.5rem, 6vw, 2rem)', { lineHeight: '1.2' }],
      },
      maxWidth: {
        'screen-xs': '320px',
        'screen-sm': '375px',
        'screen-md': '414px',
      },
      minHeight: {
        viewport: '100dvh',
        'viewport-fallback': '100vh',
      },
      height: {
        viewport: '100dvh',
        'viewport-fallback': '100vh',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      },
      animation: {
        pop: 'pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
      }
    },
  },
  plugins: [],
};
