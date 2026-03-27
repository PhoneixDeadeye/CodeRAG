/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Modern Immersive Palette
        "primary": "#4F46E5",
        "primary-hover": "#6366F1",
        "secondary": "#10B981",
        "background-dark": "#020617",
        "sidebar-dark": "rgba(15, 23, 42, 0.4)",
        "border-dark": "rgba(255, 255, 255, 0.1)",
        "surface-dark": "rgba(30, 41, 59, 0.6)",
        "input-dark": "rgba(15, 23, 42, 0.8)",
        "text-secondary": "#94A3B8"
      },
      fontFamily: {
        "display": ["Inter", "system-ui", "sans-serif"],
        "body": ["Inter", "system-ui", "sans-serif"],
        "mono": ["JetBrains Mono", "monospace"]
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "2xl": "2rem",
        "full": "9999px"
      },
      boxShadow: {
        "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        "neon": "0 0 15px rgba(79, 70, 229, 0.5)",
      },
      backdropBlur: {
        "xs": "2px",
        "sm": "4px",
        "md": "8px",
        "lg": "12px",
        "xl": "16px",
      }
    },
  },
  plugins: [],
}
