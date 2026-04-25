import type { Config } from 'tailwindcss';

// Paleta 1:1 con brand/palette.json
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0A0A0A',
        bgDeep: '#1A0F0A',
        tostado: '#3A2416',
        llama: '#F57C00',
        brasa: '#E65100',
        fuego: '#D32F2F',
        dorado: '#FFB347',
        doradoBrillo: '#FFD27F',
        hueso: '#F5F1EA',
        humo: '#6B6258',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,179,71,0.15), 0 8px 40px rgba(229,81,0,0.12)',
        card: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      backgroundImage: {
        'grad-fire': 'linear-gradient(135deg, #F57C00 0%, #D32F2F 100%)',
        'grad-gold': 'linear-gradient(135deg, #FFB347 0%, #FFD27F 100%)',
        'grad-dark': 'linear-gradient(180deg, #1A0F0A 0%, #0A0A0A 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
