/**
 * StoryStar Tailwind preset (Tailwind CSS v3 style config).
 * Colors point at the CSS variables in tokens.css, so the Bedtime theme works by
 * setting data-theme="bedtime" on <html>. Import tokens.css once, globally.
 *
 * Usage (tailwind.config.js):  presets: [require('./storystar-brand/tokens/tailwind.preset.js')]
 * Tailwind v4: copy these values into an @theme block instead (see BRAND.md, "Using the tokens").
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        'paper': 'var(--paper)',
        'paper-raised': 'var(--paper-raised)',
        'paper-sunk': 'var(--paper-sunk)',
        'ink': 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        'line': 'var(--line)',
        'delft': 'var(--delft)',
        'delft-wash': 'var(--delft-wash)',
        'on-delft': 'var(--on-delft)',
        'persimmon': 'var(--persimmon)',
        'persimmon-wash': 'var(--persimmon-wash)',
        'on-persimmon': 'var(--on-persimmon)',
        'ballet': 'var(--ballet)',
        'ballet-deep': 'var(--ballet-deep)',
        'buttercup': 'var(--buttercup)',
        'sage': 'var(--sage)',
        'on-accent': 'var(--on-accent)',
        'ceiling': 'var(--ceiling)',
        'on-ceiling': 'var(--on-ceiling)',
        'focus-ring': 'var(--focus-ring)',
      },
      fontFamily: {
        display: ['"Young Serif"', '"Iowan Old Style"', 'Georgia', 'serif'],
        sans: ['Figtree', '"Avenir Next"', 'system-ui', 'sans-serif'],
        script: ['Sacramento', '"Snell Roundhand"', 'cursive'],
      },
      fontSize: {
        'display-xl': ['64px', { lineHeight: '68px', fontWeight: '400', letterSpacing: '-0.01em' }],
        'display-l': ['44px', { lineHeight: '50px', fontWeight: '400', letterSpacing: '-0.005em' }],
        'heading': ['30px', { lineHeight: '36px', fontWeight: '400' }],
        'title': ['22px', { lineHeight: '28px', fontWeight: '400' }],
        'story': ['20px', { lineHeight: '32px', fontWeight: '400' }],
        'body': ['17px', { lineHeight: '26px', fontWeight: '400' }],
        'body-s': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'label': ['15px', { lineHeight: '20px', fontWeight: '600' }],
        'eyebrow': ['12px', { lineHeight: '16px', fontWeight: '700', letterSpacing: '0.14em' }],
        'monogram': ['48px', { lineHeight: '52px', fontWeight: '400' }],
        'signature': ['30px', { lineHeight: '34px', fontWeight: '400' }],
      },
      spacing: {
        'ss-1': '4px',
        'ss-2': '8px',
        'ss-3': '12px',
        'ss-4': '16px',
        'ss-6': '24px',
        'ss-8': '32px',
        'ss-12': '48px',
        'ss-16': '64px',
      },
      borderRadius: {
        'book': '4px',
        'sm': '8px',
        'md': '16px',
        'pill': '999px',
      },
      boxShadow: {
        lift: 'var(--shadow-lift)',
        book: 'var(--shadow-book)',
      },
      maxWidth: { content: '1200px' },
    },
  },
};
