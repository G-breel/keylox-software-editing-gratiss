module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        app: '#1a1a1a',
        panel: '#222222',
        elevated: '#2a2a2a',
        border: '#333333',
        borderStrong: '#444444',
        textPrimary: '#f0f0f0',
        textMuted: '#888888',
        textDisabled: '#555555',
        active: '#ff6600',
        accent: '#ffffff',
        success: '#4ade80',
        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
