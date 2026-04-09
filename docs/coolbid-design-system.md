# CoolBid Design System & Implementation Guide

**Tailwind CSS + Custom CSS Hybrid Approach**
Version 2.0 - April 2026

## 1. Overview & Architecture

CoolBid is a modern, premium HVAC estimating tool with a **dark theme, cool teal/cyan accents, and glassmorphism-inspired surfaces**.

### Styling Architecture: Tailwind + Custom CSS Hybrid

**Layer 1: Tailwind CSS (structural)**
- Layout: flex, grid, gap, padding, margin, width, height
- Typography: font-size, font-weight, letter-spacing, text-color
- Borders & radius: border, rounded, divide
- Background colors: bg-* using custom theme tokens
- Responsive design: sm:, md:, lg: breakpoint prefixes
- Interactive states: hover:, focus:, active: modifiers

**Layer 2: Custom CSS (effects & animations)**
- Brand gradient (linear-gradient on buttons, text, progress bars)
- Glassmorphism (backdrop-filter: blur)
- Ambient glow (radial-gradient pseudo-element on body)
- Glow shadows (teal-tinted box-shadow)
- Animations (pulse ring, progress bar glow, hover lift)
- Gradient text effect (background-clip: text)

**Rule of thumb:** if Tailwind has a utility for it, use Tailwind. If it requires a CSS function, animation, or pseudo-element, use custom CSS with a descriptive class name.

## 2. Tailwind Configuration

### 2.1 Theme Extension (tailwind.config.js)

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Backgrounds
        'bg-primary': '#0B0F1A',
        'bg-secondary': '#111827',
        'bg-card': '#1A2236',
        'bg-card-hover': '#1F2A42',
        'bg-elevated': '#232E48',
        'bg-input': '#0F1629',
        // Accent — Teal/Cyan
        accent: {
          deep: '#0E7490',
          dark: '#0891B2',
          DEFAULT: '#06B6D4',
          light: '#22D3EE',
          bright: '#67E8F9',
          'glow': 'rgba(6, 182, 212, 0.15)',
          'glow-strong': 'rgba(6, 182, 212, 0.25)',
        },
        // Secondary — Blue
        'cool-blue': {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
          glow: 'rgba(59, 130, 246, 0.15)',
        },
        // Text
        'txt': {
          primary: '#F1F5F9',
          secondary: '#94A3B8',
          tertiary: '#64748B',
          accent: '#22D3EE',
        },
        // Status
        success: { DEFAULT: '#34D399', bg: 'rgba(52, 211, 153, 0.1)' },
        warning: { DEFAULT: '#FBBF24', bg: 'rgba(251, 191, 36, 0.1)' },
        error: { DEFAULT: '#F87171', bg: 'rgba(248, 113, 113, 0.1)' },
        // Borders
        'b': {
          DEFAULT: 'rgba(148, 163, 184, 0.08)',
          hover: 'rgba(148, 163, 184, 0.15)',
          accent: 'rgba(6, 182, 212, 0.3)',
        },
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.3)',
        md: '0 4px 12px rgba(0,0,0,0.4)',
        lg: '0 8px 32px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(6, 182, 212, 0.15)',
        'glow-strong': '0 0 28px rgba(6, 182, 212, 0.25)',
      },
    },
  },
  plugins: [],
};
```

## 3. Custom CSS (Effects Tailwind Cannot Express)

Add to `src/app/globals.css` after the Tailwind import.

### 3.1 Brand Gradient Classes

```css
.bg-gradient-brand {
  background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%);
}
.bg-gradient-brand:hover,
.bg-gradient-brand-hover {
  background: linear-gradient(135deg, #22D3EE 0%, #60A5FA 100%);
}
.text-gradient-brand {
  background: linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.bg-gradient-card {
  background: linear-gradient(145deg, #1A2236 0%, #151D30 100%);
}
```

### 3.2 Glassmorphism

```css
.glass-header {
  background: rgba(11, 15, 26, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
.glass-card {
  background: rgba(26, 34, 54, 0.6);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
```

### 3.3 Ambient Background Glow

```css
body::before {
  content: '';
  position: fixed;
  top: -200px;
  left: 50%;
  transform: translateX(-50%);
  width: 800px;
  height: 600px;
  background: radial-gradient(ellipse, rgba(6,182,212,0.06) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
```

### 3.4 Glow & Focus Effects

```css
.focus-accent:focus {
  border-color: #06B6D4;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15);
  outline: none;
}
.hover-glow:hover {
  box-shadow: 0 0 20px rgba(6, 182, 212, 0.15);
}
```

### 3.5 Animations

```css
@keyframes pulse-out {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}
.pulse-ring::before, .pulse-ring::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid #06B6D4;
  animation: pulse-out 2s ease-out infinite;
}
.pulse-ring::after { animation-delay: 0.6s; }

.progress-fill {
  background: linear-gradient(90deg, #06B6D4, #3B82F6);
  box-shadow: 0 0 12px rgba(6,182,212,0.4);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.animate-blink { animation: blink 1s ease-in-out infinite; }

.hover-lift { transition: transform 0.2s, box-shadow 0.2s; }
.hover-lift:hover { transform: translateY(-2px); }
```

## 4. Color Palette Reference

### 4.1 Backgrounds

| Name | Hex | Tailwind Class | Usage |
|------|-----|----------------|-------|
| bg-primary | #0B0F1A | `bg-bg-primary` | Page background, base layer |
| bg-secondary | #111827 | `bg-bg-secondary` | Secondary surfaces, sidebar |
| bg-card | #1A2236 | `bg-bg-card` | Card backgrounds, modals |
| bg-card-hover | #1F2A42 | `bg-bg-card-hover` | Card hover state |
| bg-elevated | #232E48 | `bg-bg-elevated` | Elevated elements, active nav |
| bg-input | #0F1629 | `bg-bg-input` | Input field backgrounds |

### 4.2 Accent - Teal/Cyan

| Name | Hex | Tailwind Class | Usage |
|------|-----|----------------|-------|
| deep | #0E7490 | `bg-accent-deep` | Pressed states |
| dark | #0891B2 | `bg-accent-dark` | Hover backgrounds |
| primary | #06B6D4 | `bg-accent` | Buttons, focus rings |
| light | #22D3EE | `text-accent-light` | Accent text, highlights |
| bright | #67E8F9 | `text-accent-bright` | Decorative sparkles |

### 4.3 Text

| Name | Hex | Tailwind Class | Usage |
|------|-----|----------------|-------|
| primary | #F1F5F9 | `text-txt-primary` | Headings, key values |
| secondary | #94A3B8 | `text-txt-secondary` | Body, descriptions |
| tertiary | #64748B | `text-txt-tertiary` | Captions, disabled |
| accent | #22D3EE | `text-txt-accent` | Highlighted values |

### 4.4 Status

| Name | Hex | Tailwind Class | Usage |
|------|-----|----------------|-------|
| success | #34D399 | `text-success` | Completed, valid |
| warning | #FBBF24 | `text-warning` | Drafts, attention |
| error | #F87171 | `text-error` | Errors, destructive |

## 5. Typography

Inter as sole typeface, loaded via Google Fonts.

| Element | Tailwind Classes | Color | Notes |
|---------|-----------------|-------|-------|
| Page Title | `text-[28px] font-bold tracking-tight` | `text-txt-primary` | |
| Section Title | `text-[22px] font-bold tracking-tight` | `text-txt-primary` | |
| Card Title | `text-base font-semibold` | `text-txt-primary` | 16px, often with icon |
| Body Text | `text-sm` | `text-txt-secondary` | 14px default |
| Caption/Label | `text-[13px] font-medium` | `text-txt-secondary` | Input labels, nav tabs |
| Overline | `text-[11px] font-semibold uppercase tracking-wider` | `text-txt-tertiary` | Stat labels, table headers |
| Stat Value | `text-[28px] font-bold tracking-tight` | `text-gradient-brand` | Custom CSS |
| Total Price | `text-[32px] font-extrabold tracking-tighter` | `text-gradient-brand` | Hero BOM number |

## 6. Component Specifications (Tailwind Classes)

### 6.1 Buttons

**Primary Button**
```
bg-gradient-brand hover:bg-gradient-brand-hover
text-white font-medium text-sm
px-5 py-2.5 rounded-sm
shadow-glow hover:shadow-glow-strong
hover-lift cursor-pointer
inline-flex items-center gap-2
```

**Secondary Button**
```
bg-bg-elevated text-txt-primary font-medium text-sm
px-5 py-2.5 rounded-sm
border border-b hover:border-b-hover
hover:bg-bg-card-hover
transition-all duration-200 cursor-pointer
inline-flex items-center gap-2
```

**Ghost Button**
```
bg-transparent text-txt-secondary font-medium text-sm
px-5 py-2.5 rounded-sm
hover:text-txt-primary hover:bg-bg-card
transition-all duration-200 cursor-pointer
inline-flex items-center gap-2
```

### 6.2 Cards

**Standard Card**
```
bg-gradient-card border border-b rounded-lg p-6
hover:border-b-hover hover:shadow-md
transition-all duration-[250ms]
```

**Accent Card**
```
bg-gradient-card border border-b-accent rounded-lg p-6
shadow-[0_0_24px_rgba(6,182,212,0.06)]
```

**Glass Card**
```
glass-card border border-b rounded-lg p-6
```

### 6.3 Inputs

```
w-full px-3.5 py-2.5
bg-bg-input border border-b rounded-sm
text-txt-primary text-sm font-sans
placeholder:text-txt-tertiary
focus-accent
transition-all duration-200
```

### 6.4 Badges

**Accent:** `bg-accent-glow text-accent-light`
**Success:** `bg-success-bg text-success`
**Warning:** `bg-warning-bg text-warning`
**Blue:** `bg-cool-blue-glow text-cool-blue-light`

All: `inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide`

### 6.5 Room Cards

```
bg-gradient-card border border-b rounded-md p-[18px]
hover:border-b-accent hover-glow hover-lift
transition-all duration-[250ms]
```

### 6.6 Tables

**Header cell:** `px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-txt-tertiary bg-bg-card border-b border-b`

**Data cell:** `px-4 py-3.5 text-sm border-b border-b text-txt-secondary`

**Numeric cell:** `tabular-nums font-medium text-txt-primary text-right`

**Row hover:** `hover:bg-[rgba(6,182,212,0.03)]`

## 7. Page Layout Specifications

### 7.1 Header

```
glass-header sticky top-0 z-50
flex items-center justify-between
px-8 py-4 border-b border-b
```

### 7.2 Upload Zone

```
border-2 border-dashed border-b-accent rounded-lg
p-12 text-center bg-accent-glow
hover:border-accent hover:bg-accent-glow-strong
hover:shadow-[0_0_40px_rgba(6,182,212,0.08)]
transition-all duration-300 cursor-pointer
```

### 7.3 Analyzing Screen

Centered (`max-w-[600px] mx-auto`). Pulse-ring animation around icon. 6px progress bar track (`bg-bg-card rounded-full`) with `progress-fill` bar. Checklist of analysis steps with colored dot indicators.

### 7.4 Rooms Screen

Top: flex row with title + buttons. 4-column stat card grid (`grid-cols-4 gap-4`), each stat showing gradient-text value. 3-column room card grid (`grid-cols-3 gap-5`).

### 7.5 BOM Screen

Summary bar: accent card with total (`text-[32px] text-gradient-brand`), materials/labor/profit stats in flex row. 3-column slider row for profit, labor rate, hours. Filter tag row. Full-width BOM table with category-colored badges.

## 8. Key Constraints

- All Tailwind classes go in `className` attributes. No inline `style={{}}` unless unavoidable.
- Custom CSS classes (Section 3) go in `src/app/globals.css` after the Tailwind import.
- All transitions: 200-250ms for snappy, responsive feel. No transition longer than 300ms except pulse ring animation.
- Dark theme only for V1.
