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
        "primary": "#135bec",
        "primary-hover": "#1d6bf5",
        "background-dark": "#101622",
        "sidebar-dark": "#111722",
        "border-dark": "#232f48",
        "surface-dark": "#1a202c",
        "input-dark": "#192233",
        "text-secondary": "#92a4c9"
      },
      fontFamily: {
        "display": ["Space Grotesk", "sans-serif"],
        "body": ["Noto Sans", "sans-serif"],
        "mono": ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "2xl": "1rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
