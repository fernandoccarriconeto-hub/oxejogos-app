import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'oxe-blue': '#0E7490',
        'oxe-navy': '#1E3A5F',
        'oxe-brown': '#B45309',
        'oxe-light': '#E0F2FE',
        'oxe-gold': '#F59E0B',
      },
      fontFamily: {
        fredoka: ['var(--font-fredoka)', 'sans-serif'],
        nunito: ['var(--font-nunito)', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
