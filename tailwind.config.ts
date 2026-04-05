import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lucy: {
          bg: '#F8F7FC',
          accent: '#7B7FC4',
          soft: '#B8B5E0',
          text: '#2D2B45',
          muted: '#9896B0',
          border: '#E8E6F4',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        logo: ['Georgia', 'serif'],
      },
      borderRadius: {
        'card': '16px',
        'btn': '12px',
      },
    },
  },
  plugins: [],
};
export default config;
