/**
 * Liquid glass wallpaper — small on purpose.
 *
 * Paints one thing: a clear light field behind the shell that reads like
 * Apple's liquid glass. Colour comes from refraction and highlights, not from
 * a loud backdrop, so the palette stays close to neutral and the saturation is
 * kept low. The shell paints every column from theme tokens, so switching those
 * tokens to translucent values plus one backdrop blur per column is what turns
 * the UI into frosted glass; nothing here restyles individual widgets.
 *
 * Two things move: four slow refraction wells, and a specular pool that
 * follows the pointer (with a faint chromatic split at its edge, the way real
 * glass disperses light).
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
    const STORAGE_KEY = 'dsh.liquid-glass.v5'
    /** Root attribute the stylesheet hangs off (set on <html>). */
    const ROOT_ATTR = 'data-dsh-liquid'
    /** Locale namespace for the settings row. */
    const NS = 'ui-liquid-glass'
    /** Layer node marker. */
    const LAYER_ATTR = 'data-dsh-liquid-wallpaper'

    /**
     * Four knobs, plus the two derived looks. Defaults aim at blue, frosted,
     * clearly liquid glass: a cool hue, a heavy blur, and a low glass alpha so
     * the field keeps showing through.
     */
    const DEFAULTS = Object.freeze({ enabled: true, hue: 218, blur: 52, frost: 0.24, motion: true })

    /** Clamp into a range. */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    /** Coerce stored JSON into a complete, in-range settings object. */
    function normalize(raw) {
      const value = raw && typeof raw === 'object' ? raw : {}
      const num = (key, min, max) => {
        const parsed = Number(value[key])
        return Number.isFinite(parsed) ? clamp(parsed, min, max) : DEFAULTS[key]
      }
      const bool = (key) => (typeof value[key] === 'boolean' ? value[key] : DEFAULTS[key])
      return {
        enabled: bool('enabled'),
        hue: num('hue', 0, 360),
        blur: num('blur', 0, 60),
        frost: num('frost', 0.12, 0.88),
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
     * Translucent token layer. Values stay near neutral white/grey so the glass
     * reads as glass; only the wallpaper carries the cool tint.
     * @param settings - current settings.
     * @returns token name -> { light, dark } pairs.
     */
    function tokenLayer(settings) {
      const a = settings.frost
      const solid = Math.min(0.86, a + 0.24)
      const rail = Math.max(0.18, a - 0.12)
      return {
        '--dsw-alias-bg-base': { light: `rgba(255,255,255,${a})`, dark: `rgba(13,16,21,${a})` },
        '--dsw-alias-bg-layer-1': { light: `rgba(255,255,255,${solid})`, dark: `rgba(23,27,34,${solid})` },
        '--dsw-alias-bg-layer-2': { light: `rgba(253,254,255,${solid})`, dark: `rgba(28,33,41,${solid})` },
        '--dsw-alias-bg-layer-3': { light: `rgba(249,251,254,${solid})`, dark: `rgba(34,40,49,${solid})` },
        '--dsw-alias-bg-overlay': { light: `rgba(251,252,255,${solid})`, dark: `rgba(30,36,45,${solid})` },
        '--dsw-alias-bg-module-platform': { light: `rgba(255,255,255,${solid})`, dark: `rgba(23,27,34,${solid})` },
        '--dsw-alias-bg-multi-select': { light: `rgba(255,255,255,${solid})`, dark: `rgba(28,33,41,${solid})` },
        '--dsw-specific-sidebar-fill': { light: `rgba(255,255,255,${rail})`, dark: `rgba(10,13,18,${rail})` },
        '--dsw-specific-menu': { light: `rgba(253,254,255,${solid})`, dark: `rgba(27,32,40,${solid})` },
        '--dsw-specific-input-major': { light: `rgba(255,255,255,${solid})`, dark: `rgba(27,32,40,${solid})` },
        '--dsw-specific-bubble': { light: `rgba(255,255,255,${solid})`, dark: `rgba(31,37,46,${solid})` },
        '--dsw-alias-settings-card-fill': { light: `rgba(255,255,255,${solid})`, dark: `rgba(27,32,40,${solid})` },
        '--dsw-menu-surface-fill': { light: `rgba(253,254,255,${solid})`, dark: `rgba(27,32,40,${solid})` },
        // White rims are what make a sheet read as polished glass.
        '--dsw-alias-border-l2': { light: 'rgba(255,255,255,0.66)', dark: 'rgba(255,255,255,0.15)' },
        '--dsw-alias-border-l3': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(255,255,255,0.2)' },
      }
    }

    /**
     * The stylesheet.
     *
     * Light mode keeps a blue cast in every well instead of a neutral grey, so
     * the field reads as one cool sheet of glass rather than a white page. Dark
     * mode holds the same hues at 16-24% lightness. The pointer pool and the
     * grain layer are what sell the "frosted" and "liquid" parts.
     */
    const CSS = `
html[${ROOT_ATTR}] { background: #dde8f4; }
html[${ROOT_ATTR}] body, html[${ROOT_ATTR}] #root { background: transparent !important; }
html[${ROOT_ATTR}] #root { position: relative; z-index: 1; }

/* ---------- the light field ---------- */
[${LAYER_ATTR}] {
  position: fixed; inset: 0; z-index: 0; overflow: hidden;
  pointer-events: none; contain: layout paint style;
  background: linear-gradient(160deg, #e8f1fb 0%, #dbe7f6 52%, #cfdff2 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 8) 78% 78%);
  --lg-w2: hsl(calc(var(--lg-hue) - 26) 72% 80%);
  --lg-w3: hsl(calc(var(--lg-hue) + 34) 66% 82%);
  --lg-w4: hsl(calc(var(--lg-hue) - 52) 60% 84%);
  --lg-veil: linear-gradient(to bottom, hsl(calc(var(--lg-hue) + 6) 62% 96% / 0.5), hsl(calc(var(--lg-hue) - 10) 54% 84% / 0.42));
  --lg-spec: rgba(255, 255, 255, 0.85);
  --lg-cool: rgba(110, 185, 255, 0.72);
  --lg-warm: rgba(150, 225, 255, 0.5);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] {
  background: linear-gradient(160deg, #0a1520 0%, #071019 52%, #050b12 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 8) 76% 24%);
  --lg-w2: hsl(calc(var(--lg-hue) - 26) 70% 19%);
  --lg-w3: hsl(calc(var(--lg-hue) + 34) 64% 21%);
  --lg-w4: hsl(calc(var(--lg-hue) - 52) 58% 17%);
  --lg-veil: linear-gradient(to bottom, hsl(calc(var(--lg-hue) + 6) 60% 15% / 0.42), hsl(calc(var(--lg-hue) - 10) 54% 5% / 0.62));
  --lg-spec: rgba(255, 255, 255, 0.7);
  --lg-cool: rgba(90, 175, 255, 0.8);
  --lg-warm: rgba(120, 210, 255, 0.56);
}

[${LAYER_ATTR}] .lg-well {
  position: absolute; border-radius: 50%;
  filter: blur(86px) saturate(112%);
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

/* Fixed specular sweep: the pale band that reads as light on a curved sheet. */
[${LAYER_ATTR}] .lg-sweep {
  position: absolute; inset: -10%;
  background:
    radial-gradient(58% 38% at 24% 12%, var(--lg-spec), transparent 62%),
    radial-gradient(46% 30% at 80% 84%, var(--lg-spec), transparent 68%);
  mix-blend-mode: soft-light;
  opacity: 0.8;
}

/* Pointer pool: a compact highlight that follows the cursor — small enough to
   read as a reflection on the glass rather than a lamp sweeping the page. */
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

/* Frost grain: the fine, even scatter that separates "frosted glass" from
   "a blurred gradient". Two octave sets at different sizes stop it reading as
   a repeating tile. */
[${LAYER_ATTR}] .lg-grain {
  position: absolute; inset: 0; opacity: 0.24;
  mix-blend-mode: overlay;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='180' height='180' filter='url(%23g)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.34' numOctaves='3' stitchTiles='stitch'/></filter><rect width='420' height='420' filter='url(%23f)' opacity='0.6'/></svg>");
  background-size: 180px 180px, 420px 420px;
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] .lg-grain { opacity: 0.16; }

/* Caustics: the slow bright ribbons light leaves behind when it passes through
   curved glass. This is the "liquid" half of liquid glass; the wells supply the
   colour, these supply the sheen. Kept very soft so text stays legible. */
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
@keyframes lg-caustic {
  0%   { transform: translate3d(-4%, 2%, 0) rotate(-2deg) scale(1.02); }
  50%  { transform: translate3d(3%, -3%, 0) rotate(1.5deg) scale(1.08); }
  100% { transform: translate3d(6%, 4%, 0) rotate(-1deg) scale(1.03); }
}
@media (prefers-reduced-motion: reduce) { [${LAYER_ATTR}] .lg-caustic { animation: none; } }
[${LAYER_ATTR}][data-motion='off'] .lg-caustic { animation: none; }

@keyframes lg-flow {
  0%   { transform: translate3d(0, 0, 0) scale(1); }
  50%  { transform: translate3d(7vmax, 6vmax, 0) scale(1.1); }
  100% { transform: translate3d(-5vmax, 10vmax, 0) scale(0.96); }
}
@media (prefers-reduced-motion: reduce) { [${LAYER_ATTR}] .lg-well { animation: none; } }
[${LAYER_ATTR}][data-motion='off'] .lg-well { animation: none; }

/* ---------- the glass ---------- */
/* The frame paints the same base token as the columns. Left alone it would sit
   between the wallpaper and the columns and wash the field out twice, so it
   goes fully transparent and each column blurs the field itself. Scoped to the
   shell frame (a direct child of #root) so deeper frames keep their own paint. */
html[${ROOT_ATTR}] #root > [class*='frame'] { background: transparent !important; }

/* Colour comes from the token layer; these rules add the blur, the frost lift
   and the rim that make each column behave like a thick pane of frosted glass
   standing in front of the field. */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'], [class*='bottomRow']) {
  backdrop-filter: blur(var(--lg-blur)) saturate(235%) brightness(1.06) contrast(1.04);
  -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(235%) brightness(1.06) contrast(1.04);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'], [class*='bottomRow']) {
  backdrop-filter: blur(var(--lg-blur)) saturate(190%) brightness(0.94) contrast(1.06);
  -webkit-backdrop-filter: blur(var(--lg-blur)) saturate(190%) brightness(0.94) contrast(1.06);
}
/* Rim light on the inner vertical edge: bright hairline, then a soft falloff
   just inside it, which is how a thick glass edge catches light. */
html[${ROOT_ATTR}] [class*='sidebarCol'] {
  box-shadow:
    inset -1px 0 0 rgba(255,255,255,0.72),
    inset -3px 0 8px -6px rgba(255,255,255,0.9),
    inset 0 1px 0 rgba(255,255,255,0.42);
}
html[${ROOT_ATTR}] [class*='centerCol'] {
  box-shadow:
    inset 1px 0 0 rgba(255,255,255,0.72),
    inset 3px 0 8px -6px rgba(255,255,255,0.9),
    inset 0 1px 0 rgba(255,255,255,0.42);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol']) {
  box-shadow:
    inset 1px 0 0 rgba(255,255,255,0.13),
    inset 0 1px 0 rgba(255,255,255,0.07);
}
/* Frost scatter over the pane itself. This is a background-image on the column,
   not a pseudo-element on top of it: a background paints behind the element's
   own content, so the tooth lands on the glass while the text stays untouched.
   Opacity is baked into the SVG because background layers cannot carry their
   own alpha. */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol']) {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.055'/></svg>");
  background-size: 160px 160px;
  background-blend-mode: overlay;
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol']) {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='0.04'/></svg>");
}

/* Floating panes: full polished rim, soft cast shadow, one corner sheen. */
html[${ROOT_ATTR}] [data-composer-card],
html[${ROOT_ATTR}] [role='dialog'] {
  position: relative;
  border-radius: 22px;
  backdrop-filter: blur(calc(var(--lg-blur) + 6px)) saturate(185%) brightness(1.04);
  -webkit-backdrop-filter: blur(calc(var(--lg-blur) + 6px)) saturate(185%) brightness(1.04);
  box-shadow:
    0 20px 48px -20px rgba(30, 45, 70, 0.34),
    0 3px 12px -6px rgba(30, 45, 70, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([data-composer-card], [role='dialog']) {
  backdrop-filter: blur(calc(var(--lg-blur) + 6px)) saturate(158%) brightness(0.98);
  -webkit-backdrop-filter: blur(calc(var(--lg-blur) + 6px)) saturate(158%) brightness(0.98);
  box-shadow:
    0 24px 56px -22px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
html[${ROOT_ATTR}] :is([data-composer-card], [role='dialog'])::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(148deg,
    rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 58%);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([data-composer-card], [role='dialog'])::before {
  background: linear-gradient(148deg,
    rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 36%, rgba(255,255,255,0) 60%);
}
html[${ROOT_ATTR}] :is([role='menu'], [role='listbox']) {
  backdrop-filter: blur(calc(var(--lg-blur) + 4px)) saturate(175%) brightness(1.03);
  -webkit-backdrop-filter: blur(calc(var(--lg-blur) + 4px)) saturate(175%) brightness(1.03);
  box-shadow: 0 10px 30px -14px rgba(30, 45, 70, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

/* ---------- the settings row ---------- */
.lg-panel { padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.lg-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lg-headText { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.lg-title { font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.lg-body[data-off] { display: none; }
.lg-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.lg-rowLabel { flex: none; width: 84px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-slider { flex: 1; min-width: 0; accent-color: var(--dsw-alias-state-business-primary); }
.lg-value { flex: none; width: 42px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary); }
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
      'row.desc': '清澈的流动光场铺在界面底下，各栏变成带高光的磨砂玻璃。关掉即回到原生外观。',
      'field.hue': '色调',
      'field.blur': '模糊',
      'field.frost': '玻璃浓度',
      'field.motion': '流动',
      'state.on': '开',
      'state.off': '关',
    }
    const en = {
      'row.title': 'Liquid glass wallpaper',
      'row.desc': 'A clear drifting light field sits behind the UI and each column turns into rim-lit frosted glass. Turn it off for the stock look.',
      'field.hue': 'Hue',
      'field.blur': 'Blur',
      'field.frost': 'Glass body',
      'field.motion': 'Drift',
      'state.on': 'On',
      'state.off': 'Off',
    }
    /** The layer node: four wells, the sweep, the pointer pool, the veil. */
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
          onChange: (event) => onChange(Number(event.currentTarget.value)),
        }),
        h('span', { className: 'lg-value' }, display),
      )
    }

    /** The Settings -> General row: master switch plus three knobs and drift. */
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
            label: t('field.hue'),
            value: settings.hue,
            min: 0,
            max: 360,
            step: 1,
            display: `${Math.round(settings.hue)}°`,
            onChange: (hue) => commit({ hue }),
          }),
          h(Slider, {
            label: t('field.blur'),
            value: settings.blur,
            min: 0,
            max: 60,
            step: 1,
            display: `${Math.round(settings.blur)}px`,
            onChange: (blur) => commit({ blur }),
          }),
          h(Slider, {
            label: t('field.frost'),
            value: settings.frost,
            min: 0.12,
            max: 0.88,
            step: 0.01,
            display: `${Math.round(settings.frost * 100)}%`,
            onChange: (frost) => commit({ frost }),
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

        let layer = null
        let tokens = null

        /** Paint one settings snapshot onto the document. */
        const paint = (settings) => {
          const root = document.documentElement
          if (!settings.enabled) {
            root.removeAttribute(ROOT_ATTR)
            layer?.remove()
            layer = null
            tokens?.()
            tokens = null
            return
          }
          root.setAttribute(ROOT_ATTR, '')
          root.style.setProperty('--lg-hue', String(settings.hue))
          root.style.setProperty('--lg-blur', `${settings.blur}px`)
          if (layer === null) layer = createLayer()
          layer.dataset.motion = settings.motion ? 'on' : 'off'
          tokens = ctx.theme.overrideTokens(PKG, tokenLayer(settings))
        }

        paint(loadSettings())

        // One rAF-throttled listener drives the specular pool.
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
        const onPointerLeave = () => {
          if (layer !== null) layer.dataset.pointer = 'off'
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('pointerout', onPointerLeave, { passive: true })

        const onChange = (event) => {
          if (event instanceof CustomEvent && event.detail != null) paint(normalize(event.detail))
        }
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY) paint(loadSettings())
        }
        window.addEventListener('dsh-liquid-glass:change', onChange)
        window.addEventListener('storage', onStorage)

        ctx.effect(() => () => {
          window.removeEventListener('dsh-liquid-glass:change', onChange)
          window.removeEventListener('storage', onStorage)
          window.removeEventListener('pointermove', onPointerMove)
          window.removeEventListener('pointerout', onPointerLeave)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          tokens?.()
          layer?.remove()
          style.remove()
          const root = document.documentElement
          root.removeAttribute(ROOT_ATTR)
          for (const name of ['--lg-hue', '--lg-blur']) root.style.removeProperty(name)
        }, 'liquid glass: teardown')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'liquid-glass',
          order: 11.7,
          locale: NS,
        }, LiquidGlassRow))
      },
    }
  },
})
