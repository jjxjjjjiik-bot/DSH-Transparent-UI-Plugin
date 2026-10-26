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
    const STORAGE_KEY = 'dsh.liquid-glass.v7'
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
     * `blur` softens the colour wells; `glass` is the frosted blur applied to
     * the shell itself, which is the knob that makes it read as glass.
     */
    const DEFAULTS = Object.freeze({
      enabled: true,
      alpha: 0.42,
      blue: 46,
      frost: 0.55,
      glass: 26,
      blur: 46,
      motion: true,
    })

    /** Slider ranges, shared by `normalize` and the row. */
    const RANGES = Object.freeze({
      alpha: { min: 0.02, max: 0.92, step: 0.01 },
      blue: { min: 0, max: 100, step: 1 },
      frost: { min: 0, max: 1, step: 0.01 },
      glass: { min: 0, max: 60, step: 1 },
      blur: { min: 0, max: 100, step: 1 },
    })

    /** Clamp into a range. */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    /**
     * The blue knob maps to a *blue band*, not a hue sweep.
     *
     * A hue sweep is what made the old version turn purple: 192 + 100 × 0.62
     * lands on 254°, which is violet. Blue lives around 205–220°; past ~235° the
     * eye reads indigo and then violet. So the hue only drifts 208 → 218 across
     * the whole slider, and the "blue-ness" itself comes from saturation and
     * lightness: a barely-tinted white at 0, a light blue in the middle, a deep
     * blue at 100.
     *
     * @param blue - 0..100.
     * @returns hue in degrees, always inside the blue band.
     */
    const blueHue = (blue) => 208 + blue * 0.1

    /**
     * Map the blue knob to saturation: 0 is almost grey, 100 is rich blue.
     * @param blue - 0..100.
     * @returns saturation percentage.
     */
    const blueSat = (blue) => 20 + blue * 0.68

    /**
     * Map the blue knob to the light-mode field lightness: near-white down to a
     * solid deep blue. Stops at 49% rather than going darker, because the glass
     * sheet sits on top of this and dark body text still has to land on it.
     * @param blue - 0..100.
     * @returns lightness percentage.
     */
    const blueLum = (blue) => 97 - blue * 0.48

    /**
     * Map the blue knob to the dark-mode field lightness: near-black up to a
     * deep navy. Kept low so the wallpaper stays a backdrop at night.
     * @param blue - 0..100.
     * @returns lightness percentage.
     */
    const blueLumDark = (blue) => 7 + blue * 0.21

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
        glass: num('glass'),
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
/* The shell frame paints an opaque base fill that would cover the wallpaper.
   It is NOT a direct child of #root (the slot host wraps slots in a
   div[data-slot] with display:contents, so a child combinator never matched),
   and matching on 'frame' alone would also strip the background off unrelated
   frame-named elements such as the attachment image preview. Identify it
   structurally instead: it is the one container that holds all the columns. */
html[${ROOT_ATTR}] :is(div):has(> [class*='_sidebarCol'], > [class*='_centerCol']) {
  background: transparent;
}

/* ---------- the light field ---------- */
/* --lg-hue stays inside 208-218°; --lg-sat and --lg-lum carry the blue-ness,
   so the slider runs white -> pale blue -> deep blue and never reaches violet.
   --lg-lum-d is the dark-mode counterpart. */
[${LAYER_ATTR}] {
  position: fixed; inset: 0; z-index: 0; overflow: hidden;
  pointer-events: none; contain: layout paint style;
  background: linear-gradient(160deg,
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum) + 4%)) 0%,
    hsl(var(--lg-hue) var(--lg-sat) var(--lg-lum)) 52%,
    hsl(var(--lg-hue) calc(var(--lg-sat) + 4%) calc(var(--lg-lum) - 6%)) 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 4) var(--lg-sat) calc(var(--lg-lum) - 14%));
  --lg-w2: hsl(calc(var(--lg-hue) - 6) calc(var(--lg-sat) - 4%) calc(var(--lg-lum) - 10%));
  --lg-w3: hsl(calc(var(--lg-hue) + 8) calc(var(--lg-sat) - 8%) calc(var(--lg-lum) - 8%));
  --lg-w4: hsl(calc(var(--lg-hue) - 4) calc(var(--lg-sat) - 12%) calc(var(--lg-lum) - 6%));
  /* Gradient falloff midpoints: the softness slider moves these instead of a
     blur radius, so the same element repaints rather than gaining a filter. */
  --lg-w1-fade: 38%;
  --lg-w2-fade: 38%;
  --lg-w3-fade: 38%;
  --lg-w4-fade: 38%;
  --lg-veil: linear-gradient(to bottom,
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum) + 4%) / 0.5),
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum) - 8%) / 0.42));
  --lg-spec: rgba(255, 255, 255, 0.85);
  --lg-cool: rgba(110, 185, 255, 0.72);
  --lg-warm: rgba(150, 225, 255, 0.5);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] { background: hsl(var(--lg-hue) var(--lg-sat) var(--lg-lum-d)); }
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] {
  background: linear-gradient(160deg,
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum-d) + 3%)) 0%,
    hsl(var(--lg-hue) var(--lg-sat) var(--lg-lum-d)) 52%,
    hsl(var(--lg-hue) calc(var(--lg-sat) + 4%) calc(var(--lg-lum-d) - 2%)) 100%);
  --lg-w1: hsl(calc(var(--lg-hue) + 4) calc(var(--lg-sat) + 10%) calc(var(--lg-lum-d) + 13%));
  --lg-w2: hsl(calc(var(--lg-hue) - 6) calc(var(--lg-sat) + 6%) calc(var(--lg-lum-d) + 9%));
  --lg-w3: hsl(calc(var(--lg-hue) + 8) calc(var(--lg-sat) + 4%) calc(var(--lg-lum-d) + 11%));
  --lg-w4: hsl(calc(var(--lg-hue) - 4) var(--lg-sat) calc(var(--lg-lum-d) + 7%));
  --lg-w1-fade: 38%;
  --lg-w2-fade: 38%;
  --lg-w3-fade: 38%;
  --lg-w4-fade: 38%;
  --lg-veil: linear-gradient(to bottom,
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum-d) + 8%) / 0.42),
    hsl(var(--lg-hue) var(--lg-sat) calc(var(--lg-lum-d) - 2%) / 0.62));
  --lg-spec: rgba(255, 255, 255, 0.7);
  --lg-cool: rgba(90, 175, 255, 0.8);
  --lg-warm: rgba(120, 210, 255, 0.56);
}

/* Colour wells.
 *
 * No filter: blur() here. A radial-gradient already fades to transparent on
 * its own, so a blur on top of it only costs a large offscreen buffer that has
 * to be rasterised and re-composited every animation frame — several thousand
 * pixels square per well — while changing the visible result almost not at all.
 * The softness slider widens the gradient's own falloff instead, which is free
 * to rasterise because it is just a different paint of the same box.
 *
 * will-change: transform stays: it promotes each well to its own compositor
 * layer so the drift animation runs on the GPU without repainting the field. */
[${LAYER_ATTR}] .lg-well {
  position: absolute; border-radius: 50%;
  will-change: transform;
  animation: lg-flow 32s ease-in-out infinite alternate;
}
[${LAYER_ATTR}] .lg-well-1 {
  width: 78vmax; height: 78vmax; left: -20vmax; top: -28vmax;
  background: radial-gradient(circle closest-side, var(--lg-w1) 0%, var(--lg-w1) var(--lg-w1-fade), transparent);
}
[${LAYER_ATTR}] .lg-well-2 {
  width: 68vmax; height: 68vmax; right: -22vmax; top: -14vmax;
  background: radial-gradient(circle closest-side, var(--lg-w2) 0%, var(--lg-w2) var(--lg-w2-fade), transparent);
  animation-duration: 40s; animation-delay: -9s;
}
[${LAYER_ATTR}] .lg-well-3 {
  width: 84vmax; height: 84vmax; left: 0; bottom: -40vmax;
  background: radial-gradient(circle closest-side, var(--lg-w3) 0%, var(--lg-w3) var(--lg-w3-fade), transparent);
  animation-duration: 48s; animation-delay: -18s;
}
[${LAYER_ATTR}] .lg-well-4 {
  width: 56vmax; height: 56vmax; right: -10vmax; bottom: -18vmax;
  background: radial-gradient(circle closest-side, var(--lg-w4) 0%, var(--lg-w4) var(--lg-w4-fade), transparent);
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

/* Caustics: the slow bright ribbons light leaves behind through curved glass.
   No blur filter: the ribbons are radial gradients that already have soft ends,
   and a 22px blur over an inset:-30% box meant re-rasterising a region larger
   than the viewport each frame. The animation is translate-only so it can be
   composited; the previous rotate+scale forced a full repaint every frame. */
[${LAYER_ATTR}] .lg-caustic {
  position: absolute; inset: -30%;
  mix-blend-mode: soft-light;
  opacity: 0.55;
  will-change: transform;
  background:
    radial-gradient(38% 22% at 30% 34%, rgba(255,255,255,0.9), transparent 70%),
    radial-gradient(30% 18% at 68% 62%, rgba(255,255,255,0.8), transparent 72%),
    radial-gradient(46% 16% at 52% 82%, rgba(220,240,255,0.7), transparent 74%);
  animation: lg-caustic 26s ease-in-out infinite alternate;
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${LAYER_ATTR}] .lg-caustic { opacity: 0.3; }

/* Pointer highlight.
 *
 * This used to be a full-viewport box holding three gradients plus an ::after
 * layer, so every pointer move re-blended the entire screen. It is now a small
 * fixed-size element translated to the cursor: moving it costs a compositor
 * transform, and only its own tile repaints. The gradients are painted once. */
[${LAYER_ATTR}] .lg-pool {
  position: absolute; left: 0; top: 0;
  width: 520px; height: 520px;
  margin-left: -260px; margin-top: -260px;
  transform: translate3d(var(--lg-mx, -9999px), var(--lg-my, -9999px), 0);
  will-change: transform;
  opacity: 0; transition: opacity 420ms ease;
  background:
    radial-gradient(circle at 52% 52%, var(--lg-cool), transparent 55%),
    radial-gradient(circle at 48% 48%, var(--lg-warm), transparent 55%),
    radial-gradient(circle at 50% 50%, var(--lg-spec), transparent 42%);
  mix-blend-mode: soft-light;
}
[${LAYER_ATTR}] .lg-pool::after {
  content: ''; position: absolute; inset: 35%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 70%);
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
  0%   { transform: translate3d(-4%, 2%, 0); }
  50%  { transform: translate3d(3%, -3%, 0); }
  100% { transform: translate3d(6%, 4%, 0); }
}
@media (prefers-reduced-motion: reduce) {
  [${LAYER_ATTR}] .lg-well, [${LAYER_ATTR}] .lg-caustic { animation: none; }
}
[${LAYER_ATTR}][data-motion='off'] .lg-well,
[${LAYER_ATTR}][data-motion='off'] .lg-caustic { animation: none; }
/* Suspended while the window is hidden: no frames are produced at all, which is
   what actually saves the GPU. The static paint stays on screen so regaining
   focus shows no flicker. */
[${LAYER_ATTR}][data-suspended='on'] .lg-well,
[${LAYER_ATTR}][data-suspended='on'] .lg-caustic,
[${LAYER_ATTR}][data-suspended='on'] .lg-pool { animation-play-state: paused; }

/* ---------- the glass ---------- */
/* The frosted blur lives on ::before, never on the column itself.
 *
 * backdrop-filter on an element makes it the containing block for its
 * position:fixed descendants. The sidebar anchors its collapse button with
 * position:fixed and left:12px, so blurring the column re-anchored that button
 * onto the column, stacking it over the brand row and clipping it away once the
 * sidebar collapsed. A pseudo-element is a childless box of its own: it still
 * blurs whatever paints behind it, and because it has no descendants it cannot
 * re-anchor anything. Verified that these three columns carry no pseudo-element
 * rules of their own, so ::before is free.
 *
 * The frame's own ::before is NOT free (the Windows titlebar drag strip uses
 * it), and it is not touched here.
 */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'], [class*='bottomRow']) {
  position: relative;
}
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'], [class*='bottomRow'])::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none;
  backdrop-filter: blur(var(--lg-glass, 26px)) saturate(180%) brightness(1.04);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'], [class*='bottomRow'])::before {
  backdrop-filter: blur(var(--lg-glass, 26px)) saturate(155%) brightness(0.95);
}

/* Rim light on the inner vertical edge: bright hairline, then a soft falloff
   just inside it, which is how a thick glass edge catches light. */
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

/* Floating panes: same ::before trick for the blur, plus a polished rim, a
   cast shadow and a corner sheen. The sheen is a background gradient rather
   than ::before, because ::before is already carrying the blur here.

   Deliberately NOT [role='dialog']. The stats detail panel is a role="dialog"
   portal that positions itself with position: fixed, so forcing position
   relative here moved it out of viewport coordinates into the end of
   &lt;body&gt;, where it is invisible: the pill looked like it did nothing on
   click. Modal dialogs (the other role="dialog") are already translucent and
   already frosted through the token layer and their own backdrop-filter, so
   styling them here bought nothing and cost a working control. */
html[${ROOT_ATTR}] [data-composer-card] {
  position: relative;
  isolation: isolate;
  border-radius: 22px;
  background-image: linear-gradient(148deg,
    rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.08) 34%, rgba(255,255,255,0) 58%);
  box-shadow:
    0 20px 48px -20px rgba(30, 45, 70, 0.34),
    0 3px 12px -6px rgba(30, 45, 70, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.78),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
}
html[${ROOT_ATTR}] [data-composer-card]::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none; border-radius: inherit;
  backdrop-filter: blur(calc(var(--lg-glass, 26px) + 6px)) saturate(190%) brightness(1.05);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [data-composer-card] {
  background-image: linear-gradient(148deg,
    rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 36%, rgba(255,255,255,0) 60%);
  box-shadow:
    0 24px 56px -22px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [data-composer-card]::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none; border-radius: inherit;
  backdrop-filter: blur(calc(var(--lg-glass, 26px) + 6px)) saturate(160%) brightness(0.98);
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
      'field.glass': '玻璃模糊',
      'field.blur': '背景柔化',
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
      'field.glass': 'Glass blur',
      'field.blur': 'Backdrop softness',
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
            label: t('field.glass'),
            value: settings.glass,
            min: RANGES.glass.min,
            max: RANGES.glass.max,
            step: RANGES.glass.step,
            display: `${Math.round(settings.glass)}px`,
            onChange: (glass) => commit({ glass }),
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
      /**
       * Write a custom property only when it actually changed.
       *
       * Setting a property to its current value still invalidates the style of
       * everything that inherits it, so on a slider drag this guard saves a
       * full-document style recalculation for the knobs that did not move.
       */
      const put = (name, value) => {
        if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value)
      }
      put('--lg-a', String(a))
      put('--lg-a2', String(Math.min(0.95, a + 0.2)))
      put('--lg-a3', String(Math.max(0.14, a - 0.12)))
      put('--lg-hue', String(blueHue(settings.blue)))
      put('--lg-sat', `${blueSat(settings.blue)}%`)
      put('--lg-lum', `${blueLum(settings.blue)}%`)
      put('--lg-lum-d', `${blueLumDark(settings.blue)}%`)
      put('--lg-glass', `${settings.glass}px`)
      // Softness sets where each well starts fading out. A low value keeps the
      // colour solid almost to the rim (a harder, smaller blob); a high value
      // starts the falloff early so the blob reads as a broad wash. The stop
      // stays inside 0-100%, which is what makes it a legal gradient position.
      const fade = `${82 - settings.blur * 0.5}%`
      put('--lg-w1-fade', fade)
      put('--lg-w2-fade', fade)
      put('--lg-w3-fade', fade)
      put('--lg-w4-fade', fade)
      put('--lg-tooth', String(0.04 + settings.frost * 0.3))
      // Pane tooth alpha is baked into the SVG, so the layer swaps as a whole
      // image; near-zero frost drops it entirely.
      const paneTooth = settings.frost < 0.02
        ? 'none'
        : `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='3' stitchTiles='stitch'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='${(0.02 + settings.frost * 0.09).toFixed(3)}'/></svg>")`
      put('--lg-pane-tooth', paneTooth)
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

        /**
         * Apply one settings snapshot.
         *
         * The token layer is registered exactly once per enable cycle. Every
         * token value is a var(--lg-*) reference, so repainting on a slider
         * drag only rewrites custom properties. Re-registering the layer on
         * every input event would emit theme/change and force the whole app to
         * re-render its entire component tree on each pointer move.
         */
        const sync = (settings) => {
          if (!settings.enabled) {
            root.removeAttribute(ROOT_ATTR)
            layer?.remove()
            layer = null
            tokens?.()
            tokens = null
            return
          }
          const first = tokens === null
          root.setAttribute(ROOT_ATTR, '')
          if (layer === null) layer = createLayer()
          paint(root, layer, settings)
          if (first) tokens = ctx.theme.overrideTokens(PKG, tokenLayer())
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
          if (layer !== null && layer.dataset.pointer !== 'on') layer.dataset.pointer = 'on'
          // Skip the rAF bookkeeping entirely when nothing is visible.
          if (frame === 0) frame = window.requestAnimationFrame(flush)
        }
        // pointerout fires when the cursor crosses between elements, so check the
        // real pointer state instead of trusting the event.
        const onPointerOut = (event) => {
          if (layer === null) return
          if (event.relatedTarget !== null) return
          layer.dataset.pointer = 'off'
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('pointerout', onPointerOut, { passive: true })

        /**
         * Suspend the drifting animation while the window is actually hidden.
         *
         * Only visibilitychange is observed, deliberately. A blurred-but-visible
         * window still composites every frame, so pausing there saves nothing
         * and only makes the wallpaper look frozen when the user glances over at
         * it or takes a screenshot. document.hidden is the one state where no
         * frames are produced at all, which is where the saving actually is.
         */
        const setMotionSuspended = (suspended) => {
          if (layer !== null) layer.dataset.suspended = suspended ? 'on' : 'off'
        }
        const onVisibility = () => setMotionSuspended(document.hidden)
        document.addEventListener('visibilitychange', onVisibility)

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
          document.removeEventListener('visibilitychange', onVisibility)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          tokens?.()
          layer?.remove()
          style.remove()
          root.removeAttribute(ROOT_ATTR)
          for (const name of [
            '--lg-a', '--lg-a2', '--lg-a3', '--lg-hue', '--lg-sat',
            '--lg-lum', '--lg-lum-d', '--lg-glass',
            '--lg-w1-fade', '--lg-w2-fade', '--lg-w3-fade', '--lg-w4-fade',
            '--lg-tooth', '--lg-pane-tooth',
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
