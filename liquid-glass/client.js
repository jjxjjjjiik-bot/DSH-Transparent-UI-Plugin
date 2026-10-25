/**
 * Liquid glass wallpaper — small on purpose.
 *
 * What it does, and its one hard constraint:
 *
 *   It paints a clear, cool light field behind the shell, and makes the shell
 *   translucent by overriding theme tokens. It deliberately never puts
 *   `backdrop-filter` on a host element. That property makes an element the
 *   containing block for its `position: fixed` descendants, and the Harness
 *   uses fixed positioning for real controls — the sidebar collapse button in
 *   `ui-sidebar` (`position: fixed; left: 12px`), the context-meter popover,
 *   anchored menus. Blurring a column therefore re-anchors those controls onto
 *   the column, which both stacks the collapse button over the brand row and
 *   clips it away once the sidebar collapses (`overflow: hidden`). Every visual
 *   effect here is owned by this plugin instead: colour wells, caustics, a
 *   pointer highlight, grain, and translucent tokens. Nothing restyles a
 *   widget, and no host element gains a containing block.
 *
 * Everything is owned by `apply`: switching the flag off removes the
 * attributes, the layer node and the token layer, and the stock UI returns
 * without a reload.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-liquid-glass',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useState } = React

    /** Token-override layer key and module id. */
    const PKG = '@local/dsh-liquid-glass'
    /** Durable settings key; bumped when the defaults change meaning. */
    const STORAGE_KEY = 'dsh.liquid-glass.v6'
    /** Root attribute the stylesheet hangs off (set on <html>). */
    const ROOT_ATTR = 'data-dsh-liquid'
    /** Locale namespace for the settings row. */
    const NS = 'ui-liquid-glass'
    /** Layer node marker. */
    const LAYER_ATTR = 'data-dsh-liquid-wallpaper'

    /**
     * The knobs, all exposed as sliders.
     *
     * `alpha` is how solid the glass is. It sits at 0.55 now: the earlier 0.24
     * made the shell so see-through that text lost its footing. `blue` drives
     * both hue and saturation of the field, `frost` is the sandblasted tooth,
     * `blur` softens the colour wells.
     */
    const DEFAULTS = Object.freeze({
      enabled: true,
      alpha: 0.55,
      blue: 46,
      frost: 0.5,
      blur: 46,
      motion: true,
    })

    /** Slider ranges, shared by `normalize` and the row. */
    const RANGES = Object.freeze({
      alpha: { min: 0.12, max: 0.92, step: 0.01 },
      blue: { min: 0, max: 100, step: 1 },
      frost: { min: 0, max: 1, step: 0.01 },
      blur: { min: 0, max: 100, step: 1 },
    })

    /** Clamp into a range. */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    /**
     * Map the blue knob to a hue: 0 cool cyan, 100 deep ink blue.
     * @param blue - 0..100.
     * @returns hue in degrees.
     */
    const blueHue = (blue) => 192 + blue * 0.62

    /**
     * Map the blue knob to well saturation: 0 nearly grey, 100 rich.
     * @param blue - 0..100.
     * @returns saturation percentage.
     */
    const blueSat = (blue) => 46 + blue * 0.8

    /** Coerce stored JSON into a complete, in-range settings object. */
    function normalize(raw) {
      const value = raw && typeof raw === 'object' ? raw : {}
      const num = (key) => {
        const range = RANGES[key]
        const parsed = Number(value[key])
        return Number.isFinite(parsed) ? clamp(parsed, range.min, range.max) : DEFAULTS[key]
      }
      const bool = (key) => (typeof value[key] === 'boolean' ? value[key] : DEFAULTS[key])
      return {
        enabled: bool('enabled'),
        alpha: num('alpha'),
        blue: num('blue'),
        frost: num('frost'),
        blur: num('blur'),
        motion: bool('motion'),
      }
    }

    /** Read the persisted settings. */
    function loadSettings() {
      try {
        return normalize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
      } catch {
        return normalize(null)
      }
    }

    /** Persist the settings; a quota failure keeps the in-memory value. */
    function saveSettings(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* Storage is best effort; the layer still runs. */
      }
    }

    /**
     * Translucent token layer.
     *
     * The alphas are var(--lg-a), var(--lg-a2) and var(--lg-a3) rather than
     * baked numbers. That is what keeps dragging the transparency slider
     * smooth: the tokens are variable references, so a drag rewrites three
     * custom properties on <html> instead of tearing down and re-stacking the
     * whole theme override layer on every pointer move.
     *
     * @returns token name -> { light, dark } pairs.
     */
    function tokenLayer() {
      return {
        '--dsw-alias-bg-base': {
          light: 'rgb(255 255 255 / var(--lg-a))',
          dark: 'rgb(13 16 21 / var(--lg-a))',
        },
        '--dsw-alias-bg-layer-1': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(23 27 34 / var(--lg-a2))',
        },
        '--dsw-alias-bg-layer-2': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(28 33 41 / var(--lg-a2))',
        },
        '--dsw-alias-bg-layer-3': {
          light: 'rgb(249 251 254 / var(--lg-a2))',
          dark: 'rgb(34 40 49 / var(--lg-a2))',
        },
        '--dsw-alias-bg-overlay': {
          light: 'rgb(251 252 255 / var(--lg-a2))',
          dark: 'rgb(30 36 45 / var(--lg-a2))',
        },
        '--dsw-alias-bg-module-platform': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(23 27 34 / var(--lg-a2))',
        },
        '--dsw-alias-bg-multi-select': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(28 33 41 / var(--lg-a2))',
        },
        '--dsw-specific-sidebar-fill': {
          light: 'rgb(255 255 255 / var(--lg-a3))',
          dark: 'rgb(10 13 18 / var(--lg-a3))',
        },
        '--dsw-specific-menu': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(27 32 40 / var(--lg-a2))',
        },
        '--dsw-specific-input-major': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(27 32 40 / var(--lg-a2))',
        },
        '--dsw-specific-bubble': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(31 37 46 / var(--lg-a2))',
        },
        '--dsw-alias-settings-card-fill': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(27 32 40 / var(--lg-a2))',
        },
        '--dsw-menu-surface-fill': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(27 32 40 / var(--lg-a2))',
        },
        // White rims are what make a sheet read as polished glass.
        '--dsw-alias-border-l2': { light: 'rgba(255,255,255,0.66)', dark: 'rgba(255,255,255,0.15)' },
        '--dsw-alias-border-l3': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(255,255,255,0.2)' },
      }
    }

    /**
     * The stylesheet.
     *
     * Every colour is a variable reference, so the sliders only touch custom
     * properties. No `backdrop-filter` appears anywhere: see the module header
     * for why that matters to the sidebar collapse button.
     */
    const CSS = `
html[${ROOT_ATTR}] { background: hsl(var(--lg-hue) var(--lg-sat) 94%); }
html[${ROOT_ATTR}] body, html[${ROOT_ATTR}] #root { background: transparent !important; }
html[${ROOT_ATTR}] #root { position: relative; z-index: 1; }
html[${ROOT_ATTR}] #root > [class*='frame'] { background: transparent !important; }

/* ---------- the light field ---------- */
[${LAYER_ATTR}] {
  position: fixed; inset: 0; z-index: 0; overflow: hidden;
  pointer-events: none; contain: layout paint style;
  background: linear-gradient(160deg,
    hsl(var(--lg-hue) var(--lg-sat) 96%) 0%,
    hsl(var(--lg-hue) var(--lg-sat) 93%) 52%,
    hsl(calc(var(--lg-hue) - 6) var(--lg-sat) 89%) 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 8) var(--lg-sat) 78%);
  --lg-w2: hsl(calc(var(--lg-hue) - 26) calc(var(--lg-sat) - 6) 80%);
  --lg-w3: hsl(calc(var(--lg-hue) + 34) calc(var(--lg-sat) - 12) 82%);
  --lg-w4: hsl(calc(var(--lg-hue) - 52) calc(var(--lg-sat) - 18) 84%);
  --lg-veil: linear-gradient(to bottom,
    hsl(calc(var(--lg-hue) + 6) var(--lg-sat) 96% / 0.5),
    hsl(calc(var(--lg-hue) - 10) var(--lg-sat) 84% / 0.42));
  --lg-spec: rgba(255, 255, 255, 0.85);
  --lg-cool: rgba(110, 185, 255, 0.72);
  --lg-warm: rgba(150, 225, 255, 0.5);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] { background: hsl(var(--lg-hue) var(--lg-sat) 6%); }
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] {
  background: linear-gradient(160deg,
    hsl(var(--lg-hue) var(--lg-sat) 8%) 0%,
    hsl(var(--lg-hue) var(--lg-sat) 6%) 52%,
    hsl(calc(var(--lg-hue) - 6) var(--lg-sat) 4%) 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 8) calc(var(--lg-sat) + 14) 22%);
  --lg-w2: hsl(calc(var(--lg-hue) - 26) calc(var(--lg-sat) + 10) 18%);
  --lg-w3: hsl(calc(var(--lg-hue) + 34) calc(var(--lg-sat) + 8) 20%);
  --lg-w4: hsl(calc(var(--lg-hue) - 52) calc(var(--lg-sat) + 4) 16%);
  --lg-veil: linear-gradient(to bottom,
    hsl(calc(var(--lg-hue) + 6) var(--lg-sat) 15% / 0.42),
    hsl(calc(var(--lg-hue) - 10) var(--lg-sat) 5% / 0.62));
  --lg-spec: rgba(255, 255, 255, 0.7);
  --lg-cool: rgba(90, 175, 255, 0.8);
  --lg-warm: rgba(120, 210, 255, 0.56);
}

/* Colour wells. Their softness is the blur slider: this is the one safe place
   for a blur radius, because the element is ours and holds no controls. */
[${LAYER_ATTR}] .lg-well {
  position: absolute; border-radius: 50%;
  filter: blur(var(--lg-well-blur, 90px)) saturate(112%);
  will-change: transform;
  animation: lg-flow 32s ease-in-out infinite alternate;
}
[${LAYER_ATTR}] .lg-well-1 {
  width: 78vmax; height: 78vmax; left: -20vmax; top: -28vmax;
  background: radial-gradient(circle, var(--lg-w1), transparent 70%);
}
[${LAYER_ATTR}] .lg-well-2 {
  width: 68vmax; height: 68vmax; right: -22vmax; top: -14vmax;
  background: radial-gradient(circle, var(--lg-w2), transparent 68%);
  animation-duration: 40s; animation-delay: -9s;
}
[${LAYER_ATTR}] .lg-well-3 {
  width: 84vmax; height: 84vmax; left: 0; bottom: -40vmax;
  background: radial-gradient(circle, var(--lg-w3), transparent 72%);
  animation-duration: 48s; animation-delay: -18s;
}
[${LAYER_ATTR}] .lg-well-4 {
  width: 56vmax; height: 56vmax; right: -10vmax; bottom: -18vmax;
  background: radial-gradient(circle, var(--lg-w4), transparent 70%);
  animation-duration: 36s; animation-delay: -24s;
}

/* Fixed specular sweep: light on a curved sheet. */
[${LAYER_ATTR}] .lg-sweep {
  position: absolute; inset: -10%;
  background:
    radial-gradient(58% 38% at 24% 12%, var(--lg-spec), transparent 62%),
    radial-gradient(46% 30% at 80% 84%, var(--lg-spec), transparent 68%);
  mix-blend-mode: soft-light;
  opacity: 0.8;
}

/* Caustics: the slow bright ribbons light leaves behind through curved glass. */
[${LAYER_ATTR}] .lg-caustic {
  position: absolute; inset: -30%;
  mix-blend-mode: soft-light;
  opacity: 0.55;
  background:
    radial-gradient(38% 22% at 30% 34%, rgba(255,255,255,0.9), transparent 70%),
    radial-gradient(30% 18% at 68% 62%, rgba(255,255,255,0.8), transparent 72%),
    radial-gradient(46% 16% at 52% 82%, rgba(220,240,255,0.7), transparent 74%);
  filter: blur(22px);
  animation: lg-caustic 26s ease-in-out infinite alternate;
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] .lg-caustic { opacity: 0.3; }

/* Pointer highlight: a compact reflection that follows the cursor. */
[${LAYER_ATTR}] .lg-pool {
  position: absolute; inset: 0;
  opacity: 0; transition: opacity 420ms ease;
  background:
    radial-gradient(230px 230px at calc(var(--lg-mx, 50%) + 5px) calc(var(--lg-my, 42%) + 4px), var(--lg-cool), transparent 62%),
    radial-gradient(230px 230px at calc(var(--lg-mx, 50%) - 5px) calc(var(--lg-my, 42%) - 4px), var(--lg-warm), transparent 62%),
    radial-gradient(190px 190px at var(--lg-mx, 50%) var(--lg-my, 42%), var(--lg-spec), transparent 56%);
  mix-blend-mode: soft-light;
}
[${LAYER_ATTR}] .lg-pool::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(86px 86px at var(--lg-mx, 50%) var(--lg-my, 42%),
    rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 66%);
  mix-blend-mode: plus-lighter;
  opacity: 0.85;
}
[${LAYER_ATTR}][data-pointer='on'] .lg-pool { opacity: 0.62; }
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] .lg-pool { mix-blend-mode: screen; }
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}][data-pointer='on'] .lg-pool { opacity: 0.34; }

/* Veil: softens the wells into one continuous sheet. */
[${LAYER_ATTR}] .lg-veil { position: absolute; inset: 0; background: var(--lg-veil); }

/* Frost grain: the even scatter that separates "frosted" from "blurred".
   Opacity rides the frost slider. Two octave sets at different sizes keep it
   from reading as a repeating tile. */
[${LAYER_ATTR}] .lg-grain {
  position: absolute; inset: 0;
  opacity: var(--lg-tooth, 0.16);
  mix-blend-mode: overlay;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='180' height='180' filter='url(%23g)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.34' numOctaves='3' stitchTiles='stitch'/></filter><rect width='420' height='420' filter='url(%23f)' opacity='0.6'/></svg>");
  background-size: 180px 180px, 420px 420px;
}

@keyframes lg-flow {
  0%   { transform: translate3d(0, 0, 0) scale(1); }
  50%  { transform: translate3d(7vmax, 6vmax, 0) scale(1.1); }
  100% { transform: translate3d(-5vmax, 10vmax, 0) scale(0.96); }
}
@keyframes lg-caustic {
  0%   { transform: translate3d(-4%, 2%, 0) rotate(-2deg) scale(1.02); }
  50%  { transform: translate3d(3%, -3%, 0) rotate(1.5deg) scale(1.08); }
  100% { transform: translate3d(6%, 4%, 0) rotate(-1deg) scale(1.03); }
}
@media (prefers-reduced-motion: reduce) {
  [${LAYER_ATTR}] .lg-well, [${LAYER_ATTR}] .lg-caustic { animation: none; }
}
[${LAYER_ATTR}][data-motion='off'] .lg-well,
[${LAYER_ATTR}][data-motion='off'] .lg-caustic { animation: none; }

/* ---------- the glass ---------- */
/* Rim light and a cast shadow only. Both are paint properties, and neither
   creates a containing block, so fixed controls nested in these columns keep
   the viewport as their anchor. */
html[${ROOT_ATTR}] [class*='sidebarCol'] {
  box-shadow:
    inset -1px 0 0 rgba(255,255,255,0.72),
    inset -3px 0 10px -7px rgba(255,255,255,0.9),
    inset 0 1px 0 rgba(255,255,255,0.42);
}
html[${ROOT_ATTR}] [class*='centerCol'] {
  box-shadow:
    inset 1px 0 0 rgba(255,255,255,0.72),
    inset 3px 0 10px -7px rgba(255,255,255,0.9),
    inset 0 1px 0 rgba(255,255,255,0.42);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol']) {
  box-shadow:
    inset 1px 0 0 rgba(255,255,255,0.13),
    inset 0 1px 0 rgba(255,255,255,0.07);
}

/* Frost tooth on the panes: a background-image, which paints behind the
   element's own content, so the texture lands on the glass and never over the
   text. Its alpha is baked into the SVG and swapped by the frost slider. */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol']) {
  background-blend-mode: overlay;
  background-image: var(--lg-pane-tooth);
  background-size: 160px 160px;
}

/* Floating panes: polished rim, soft cast shadow, one corner sheen. The sheen
   is a background gradient rather than a pseudo-element, so it cannot swallow
   pointer events from the controls inside the composer. */
html[${ROOT_ATTR}] [data-composer-card],
html[${ROOT_ATTR}] [role='dialog'] {
  border-radius: 22px;
  background-image: linear-gradient(148deg,
    rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 58%);
  box-shadow:
    0 20px 48px -20px rgba(30, 45, 70, 0.34),
    0 3px 12px -6px rgba(30, 45, 70, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([data-composer-card], [role='dialog']) {
  background-image: linear-gradient(148deg,
    rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 36%, rgba(255,255,255,0) 60%);
  box-shadow:
    0 24px 56px -22px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
html[${ROOT_ATTR}] :is([role='menu'], [role='listbox']) {
  box-shadow: 0 10px 30px -14px rgba(30, 45, 70, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

/* ---------- the settings row ---------- */
.lg-panel { padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.lg-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lg-headText { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.lg-title { font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.lg-body { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
.lg-body[data-off] { display: none; }
.lg-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.lg-rowLabel { flex: none; width: 84px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-slider { flex: 1; min-width: 0; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }
.lg-value { flex: none; width: 44px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary); }
.lg-switch {
  flex: none; height: 24px; padding: 0 10px; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary);
  background: transparent; border: 1px solid var(--dsw-alias-border-l3);
}
.lg-switch:hover { background: var(--dsw-alias-interactive-bg-hover); }
.lg-switch[aria-checked='true'] {
  background: var(--dsw-alias-state-business-primary);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-foreground);
}
`

    /** Settings row copy. */
    const zh = {
      'row.title': '液态玻璃壁纸',
      'row.desc': '清澈的流动光场铺在界面底下，界面变成带高光的磨砂玻璃。关掉即回到原生外观。',
      'field.alpha': '透明度',
      'field.blue': '蓝度',
      'field.frost': '磨砂感',
      'field.blur': '柔化',
      'field.motion': '流动',
      'state.on': '开',
      'state.off': '关',
    }
    const en = {
      'row.title': 'Liquid glass wallpaper',
      'row.desc': 'A clear drifting light field sits behind the UI and the shell turns into rim-lit frosted glass. Turn it off for the stock look.',
      'field.alpha': 'Opacity',
      'field.blue': 'Blue',
      'field.frost': 'Frost',
      'field.blur': 'Softness',
      'field.motion': 'Drift',
      'state.on': 'On',
      'state.off': 'Off',
    }

    /** The layer node: wells, sweep, caustics, pointer pool, veil, grain. */
    function createLayer() {
      const layer = document.createElement('div')
      layer.setAttribute(LAYER_ATTR, '')
      layer.setAttribute('aria-hidden', 'true')
      const part = (className) => {
        const node = document.createElement('div')
        node.className = className
        return node
      }
      layer.append(
        part('lg-well lg-well-1'),
        part('lg-well lg-well-2'),
        part('lg-well lg-well-3'),
        part('lg-well lg-well-4'),
        part('lg-sweep'),
        part('lg-caustic'),
        part('lg-pool'),
        part('lg-veil'),
        part('lg-grain'),
      )
      document.body.prepend(layer)
      return layer
    }

    /** One labelled slider. */
    function Slider({ label, value, min, max, step, display, onChange }) {
      return h('div', { className: 'lg-row' },
        h('span', { className: 'lg-rowLabel' }, label),
        h('input', {
          className: 'lg-slider',
          type: 'range',
          min,
          max,
          step,
          value,
          'aria-label': label,
          onChange: (event) => onChange(Number(event.currentTarget.value)),
        }),
        h('span', { className: 'lg-value' }, display),
      )
    }

    /** The Settings -> General row: master switch plus the four sliders. */
    function LiquidGlassRow({ t }) {
      const [settings, setSettings] = useState(loadSettings)
      const commit = useCallback((patch) => {
        setSettings((previous) => {
          const next = normalize({ ...previous, ...patch })
          saveSettings(next)
          window.dispatchEvent(new CustomEvent('dsh-liquid-glass:change', { detail: next }))
          return next
        })
      }, [])
      return h('div', { className: 'lg-panel' },
        h('div', { className: 'lg-head' },
          h('div', { className: 'lg-headText' },
            h('span', { className: 'lg-title' }, t('row.title')),
            h('span', { className: 'lg-desc' }, t('row.desc')),
          ),
          h('button', {
            type: 'button',
            className: 'lg-switch',
            role: 'switch',
            'aria-checked': settings.enabled ? 'true' : 'false',
            onClick: () => commit({ enabled: !settings.enabled }),
          }, settings.enabled ? t('state.on') : t('state.off')),
        ),
        h('div', { className: 'lg-body', 'data-off': settings.enabled ? undefined : '' },
          h(Slider, {
            label: t('field.alpha'),
            value: settings.alpha,
            min: RANGES.alpha.min,
            max: RANGES.alpha.max,
            step: RANGES.alpha.step,
            display: `${Math.round(settings.alpha * 100)}%`,
            onChange: (alpha) => commit({ alpha }),
          }),
          h(Slider, {
            label: t('field.blue'),
            value: settings.blue,
            min: RANGES.blue.min,
            max: RANGES.blue.max,
            step: RANGES.blue.step,
            display: `${Math.round(settings.blue)}`,
            onChange: (blue) => commit({ blue }),
          }),
          h(Slider, {
            label: t('field.frost'),
            value: settings.frost,
            min: RANGES.frost.min,
            max: RANGES.frost.max,
            step: RANGES.frost.step,
            display: `${Math.round(settings.frost * 100)}%`,
            onChange: (frost) => commit({ frost }),
          }),
          h(Slider, {
            label: t('field.blur'),
            value: settings.blur,
            min: RANGES.blur.min,
            max: RANGES.blur.max,
            step: RANGES.blur.step,
            display: `${Math.round(settings.blur)}`,
            onChange: (blur) => commit({ blur }),
          }),
          h(Slider, {
            label: t('field.motion'),
            value: settings.motion ? 1 : 0,
            min: 0,
            max: 1,
            step: 1,
            display: settings.motion ? t('state.on') : t('state.off'),
            onChange: (value) => commit({ motion: value === 1 }),
          }),
        ),
      )
    }

    /**
     * Push one settings snapshot onto the document.
     *
     * Everything is a custom property or an attribute, so this stays cheap
     * enough to run on every slider tick: no token layer is re-registered, only
     * the variables the tokens already reference are rewritten.
     *
     * @param root - document element.
     * @param layer - the wallpaper node, or null while disabled.
     * @param settings - normalized settings.
     */
    function paint(root, layer, settings) {
      const a = settings.alpha
      root.style.setProperty('--lg-a', String(a))
      root.style.setProperty('--lg-a2', String(Math.min(0.95, a + 0.2)))
      root.style.setProperty('--lg-a3', String(Math.max(0.14, a - 0.12)))
      root.style.setProperty('--lg-hue', String(blueHue(settings.blue)))
      root.style.setProperty('--lg-sat', `${blueSat(settings.blue)}%`)
      root.style.setProperty('--lg-well-blur', `${18 + settings.blur * 1.5}px`)
      root.style.setProperty('--lg-tooth', String(0.04 + settings.frost * 0.3))
      // Pane tooth alpha is baked into the SVG, so the layer swaps as a whole
      // image; near-zero frost drops it entirely.
      const paneTooth = settings.frost < 0.02
        ? 'none'
        : `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='${(0.02 + settings.frost * 0.09).toFixed(3)}'/></svg>")`
      root.style.setProperty('--lg-pane-tooth', paneTooth)
      if (layer !== null) layer.dataset.motion = settings.motion ? 'on' : 'off'
    }

    return {
      inject: ['slots', 'theme', 'locale'],
      /**
       * Install the wallpaper: locale copy, stylesheet, the layer node, the
       * pointer listener, the token overrides and the settings row.
       * @param ctx - client cordis context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'liquid glass: dictionaries')

        const style = document.createElement('style')
        style.setAttribute('data-dsh-liquid-css', '')
        style.textContent = CSS
        document.head.appendChild(style)

        const root = document.documentElement
        let layer = null
        let tokens = null

        /** Apply one settings snapshot. */
        const sync = (settings) => {
          if (!settings.enabled) {
            root.removeAttribute(ROOT_ATTR)
            layer?.remove()
            layer = null
            tokens?.()
            tokens = null
            return
          }
          root.setAttribute(ROOT_ATTR, '')
          if (layer === null) layer = createLayer()
          paint(root, layer, settings)
          tokens = ctx.theme.overrideTokens(PKG, tokenLayer())
        }

        sync(loadSettings())

        // One rAF-throttled listener drives the pointer highlight.
        let frame = 0
        let px = 0
        let py = 0
        const flush = () => {
          frame = 0
          if (layer === null) return
          layer.style.setProperty('--lg-mx', `${px}px`)
          layer.style.setProperty('--lg-my', `${py}px`)
        }
        const onPointerMove = (event) => {
          px = event.clientX
          py = event.clientY
          if (layer !== null) layer.dataset.pointer = 'on'
          if (frame === 0) frame = window.requestAnimationFrame(flush)
        }
        const onPointerOut = () => {
          if (layer !== null) layer.dataset.pointer = 'off'
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('pointerout', onPointerOut, { passive: true })

        const onChange = (event) => {
          if (event instanceof CustomEvent && event.detail != null) sync(normalize(event.detail))
        }
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY) sync(loadSettings())
        }
        window.addEventListener('dsh-liquid-glass:change', onChange)
        window.addEventListener('storage', onStorage)

        ctx.effect(() => () => {
          window.removeEventListener('dsh-liquid-glass:change', onChange)
          window.removeEventListener('storage', onStorage)
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerout', onPointerOut)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          tokens?.()
          layer?.remove()
          style.remove()
          root.removeAttribute(ROOT_ATTR)
          for (const name of [
            '--lg-a', '--lg-a2', '--lg-a3', '--lg-hue', '--lg-sat',
            '--lg-well-blur', '--lg-tooth', '--lg-pane-tooth',
          ]) {
            root.style.removeProperty(name)
          }
        }, 'liquid glass: teardown')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'liquid-glass',
          order: 11.8,
          locale: NS,
        }, LiquidGlassRow))
      },
    }
  },
})
