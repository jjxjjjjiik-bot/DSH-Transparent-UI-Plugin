/**
 * Liquid glass wallpaper.
 *
 * What it paints, and the two constraints that shape every line:
 *
 *   Apple's own description of this material (WWDC25 session 219) is that it
 *   "bends, shapes and concentrates light" and that lensing, not blur, is how
 *   it reads as glass. So the design here is edges and highlights first, a
 *   translucent fill second, and a deliberately modest backdrop blur.
 *
 *   The wallpaper lives on a node this plugin owns, below the shell. The
 *   pointer highlight lives on a second owned node ABOVE the shell, because a
 *   light drawn behind frosted panes gets blurred and washed away - which is
 *   why an earlier version's cursor glow was invisible.
 *
 *   Nothing here puts backdrop-filter, filter, transform, will-change,
 *   perspective or contain on a host element: those make an element the
 *   containing block for its position:fixed descendants, and the Harness
 *   anchors real controls that way (the sidebar collapse button is
 *   `position: fixed; left: 12px`, the context-meter popover, anchored menus).
 *   The blur sits on a childless ::before instead, which cannot re-anchor
 *   anything. This is the one rule that must not regress.
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
    const STORAGE_KEY = 'dsh.liquid-glass.v8'
    /** Root attribute the stylesheet hangs off (set on <html>). */
    const ROOT_ATTR = 'data-dsh-liquid'
    /** Locale namespace for the settings row. */
    const NS = 'ui-liquid-glass'
    /** Background node marker. */
    const FIELD_ATTR = 'data-dsh-liquid-field'
    /** Foreground pointer-highlight node marker. */
    const POINTER_ATTR = 'data-dsh-liquid-pointer'

    /**
     * The knobs.
     *
     * Three sliders and a toggle, down from six sliders. The two blur knobs
     * ("glass blur" and "backdrop softness") became one `frost`, because a
     * second blur that only moved the wallpaper's falloff was not a distinct
     * effect - it was the same glass parameter reached from two directions.
     * `tint` replaces the old "blue" number and now drives both the hue band
     * and the field's saturation/lightness, so the slider runs pale blue-white
     * to deep blue and cannot reach violet.
     */
    const DEFAULTS = Object.freeze({
      enabled: true,
      clarity: 0.4,
      tint: 50,
      frost: 0.55,
      halo: 0.7,
      haloSize: 0.5,
      motion: true,
    })

    /** Slider ranges, shared by `normalize` and the row. */
    const RANGES = Object.freeze({
      clarity: { min: 0.16, max: 0.9, step: 0.01 },
      tint: { min: 0, max: 100, step: 1 },
      frost: { min: 0, max: 1, step: 0.01 },
      halo: { min: 0, max: 1, step: 0.01 },
      haloSize: { min: 0, max: 1, step: 0.01 },
    })

    /** Clamp into a range. */
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    /**
     * Turn the tint knob into the whole field palette.
     *
     * Apple's material has no inherent colour: it takes the colour of what is
     * behind it. So the knob moves the *background*, and the glass just samples
     * it. Hue stays inside 203-226 degrees - the blue band. Past ~235 the eye
     * reads indigo and then violet, which is the bug this mapping prevents.
     * The blue-ness comes from saturation and lightness, not from hue.
     *
     * @param tint - 0..100.
     * @returns the hue triple plus saturation and the two lightness tracks.
     */
    const palette = (tint) => {
      const t = clamp(tint, 0, 100) / 100
      return {
        h1: 209 + t * 7,
        h2: 202 + t * 6,
        h3: 216 + t * 10,
        sat: 30 + t * 46,
        lum: 86 - t * 30,
        dark: 11 + t * 17,
      }
    }

    /** Coerce stored JSON into a complete, in-range settings object. */
    function normalize(raw) {
      const value = raw && typeof raw === 'object' ? raw : {}
      const num = (key) => {
        const range = RANGES[key]
        const stored = value[key]
        // null, undefined and "" all mean "not set". Number() would turn each
        // of them into 0, which clamps to the slider minimum - a stored null
        // from an older version would silently pin the UI to nearly invisible.
        if (stored === null || stored === undefined || stored === '') return DEFAULTS[key]
        const parsed = Number(stored)
        return Number.isFinite(parsed) ? clamp(parsed, range.min, range.max) : DEFAULTS[key]
      }
      const bool = (key) => (typeof value[key] === 'boolean' ? value[key] : DEFAULTS[key])
      return {
        enabled: bool('enabled'),
        clarity: num('clarity'),
        tint: num('tint'),
        frost: num('frost'),
        halo: num('halo'),
        haloSize: num('haloSize'),
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
        /* Storage is best effort; the field still runs. */
      }
    }

    /**
     * Translucent token layer.
     *
     * Apple sizes the material by area: big surfaces read as thicker and more
     * opaque, small ones stay clear. These tokens are the shell's surfaces, so
     * they get `--lg-a` plus a little, and the sidebar (a large slab) sits a
     * touch heavier still.
     *
     * Every alpha is a var() reference. That is what keeps a slider drag cheap:
     * the token layer is registered once, and a drag rewrites a handful of
     * custom properties instead of re-registering theme tokens and forcing the
     * whole component tree through theme/change on every pointer move.
     *
     * @returns token name -> { light, dark } pairs.
     */
    function tokenLayer() {
      return {
        // Content surfaces stay the most opaque thing on screen. Apple's rule is
        // that material thickness scales with area, and more practically: the
        // conversation body draws its own scroll-away fades using this token, so
        // a value low enough to see text through it breaks those masks.
        '--dsw-alias-bg-base': {
          light: 'rgb(255 255 255 / var(--lg-a))',
          dark: 'rgb(14 18 24 / var(--lg-a))',
        },
        '--dsw-alias-bg-layer-1': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(24 29 37 / var(--lg-a2))',
        },
        '--dsw-alias-bg-layer-2': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(29 35 44 / var(--lg-a2))',
        },
        '--dsw-alias-bg-overlay': {
          light: 'rgb(252 253 255 / var(--lg-a2))',
          dark: 'rgb(31 37 47 / var(--lg-a2))',
        },
        '--dsw-alias-bg-module-platform': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(24 29 37 / var(--lg-a2))',
        },
        '--dsw-alias-bg-multi-select': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(29 35 44 / var(--lg-a2))',
        },
        '--dsw-specific-sidebar-fill': {
          light: 'rgb(255 255 255 / var(--lg-a3))',
          dark: 'rgb(11 15 21 / var(--lg-a3))',
        },
        '--dsw-specific-menu': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(28 34 43 / var(--lg-a2))',
        },
        // The composer pill is the one surface that has to occlude. Its host
        // element carries no backdrop-filter of its own (only the dock root
        // does), so a translucent fill with no blur lets conversation text read
        // straight through the input box. `--lg-a4` is deliberately the most
        // opaque track and the blur is added in the stylesheet.
        '--dsw-specific-input-major': {
          light: 'rgb(255 255 255 / var(--lg-a4))',
          dark: 'rgb(28 34 43 / var(--lg-a4))',
        },
        '--dsw-specific-bubble': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(32 38 48 / var(--lg-a2))',
        },
        '--dsw-alias-settings-card-fill': {
          light: 'rgb(255 255 255 / var(--lg-a2))',
          dark: 'rgb(28 34 43 / var(--lg-a2))',
        },
        '--dsw-menu-surface-fill': {
          light: 'rgb(253 254 255 / var(--lg-a2))',
          dark: 'rgb(28 34 43 / var(--lg-a2))',
        },
        // The frost slider also drives the menus and the composer card, which
        // carry their own backdrop blur through this token. Reusing it means the
        // plugin does not need to add a second blur pass on top of a pane that
        // already blurs - the double blur was both wasted fill rate and haze.
        '--dsw-menu-backdrop-filter': {
          light: 'blur(var(--lg-glass)) saturate(150%) brightness(1.02)',
          dark: 'blur(var(--lg-glass)) saturate(135%) brightness(0.98)',
        },
        // Deliberately NOT overridden, after an audit of their consumers:
        //
        //   --dsw-alias-border-l2 / -l3 are hairlines, not fills. Native values
        //   are black at ~10% alpha. Painting them white made every separator,
        //   tree connector, turn boundary and focus outline vanish in light
        //   mode - including the sidebar's own border-right. Glass rims are
        //   drawn per pane with box-shadow instead.
        //
        //   --dsw-alias-bg-layer-3 is used as a TEXT colour in three places
        //   (the agent-preset broken badge, its tooltip, and icon-button
        //   tooltips use it as the reverse of label-primary). Making it
        //   translucent made those labels translucent.
        //   --dsw-alias-bg-multi-select and --dsw-specific-bubble were checked
        //   for the same misuse and are fills; they stay overridden above.
      }
    }

    /**
     * The stylesheet.
     *
     * Every colour is a variable reference so the sliders only touch custom
     * properties. There is no template literal escape anywhere below on
     * purpose: an accidental backtick inside this block truncates the whole
     * stylesheet, which has cost this file more time than any other mistake.
     */
    const CSS = `
/* ================= field: the light behind the glass ================= */

html[${ROOT_ATTR}] { background: hsl(var(--lg-h2) var(--lg-sat) var(--lg-lum)); --lg-solid: rgb(255 255 255 / 0.97); }
html[${ROOT_ATTR}]:has(body[data-ds-dark-theme]) {
  background: hsl(var(--lg-h2) var(--lg-sat) var(--lg-lum-d));
  --lg-solid: rgb(24 29 37 / 0.97);
}
html[${ROOT_ATTR}] body, html[${ROOT_ATTR}] #root { background: transparent !important; }

/* The shell frame paints an opaque base fill over the field. It is not a
   direct child of #root: the slot host wraps slots in a div[data-slot] with
   display:contents, so a child combinator never matched it. Identify the
   container structurally instead - it is the one box that holds the columns. */
html[${ROOT_ATTR}] :is(div):has(> [class*='_sidebarCol'], > [class*='_centerCol']) {
  background: transparent;
}

[${FIELD_ATTR}] {
  /* Negative z-index rather than lifting #root to z-index 1. That keeps the
     shell's own stacking untouched: any overlay the app hangs off <body> with
     z-index auto or 0 stays above the wallpaper, and the single host rule this
     plugin would otherwise need on #root disappears. A negative layer still
     paints above the root element's canvas background, which is opaque here. */
  position: fixed; inset: 0; z-index: -1; overflow: hidden;
  pointer-events: none; contain: layout paint style;
  /* Painted once. The four corner radials are what survive the pane blur, so
     the panes still tint differently corner to corner instead of flattening to
     one colour; the linear base underneath keeps the whole sheet in one key. */
  background:
    radial-gradient(122% 96% at 12% 4%, hsl(var(--lg-h2) 100% calc(var(--lg-lum) + 7%)) 0%, transparent 57%),
    radial-gradient(94% 76% at 90% 2%, hsl(var(--lg-h1) calc(var(--lg-sat) - 16%) calc(var(--lg-lum) - 1%)) 0%, transparent 53%),
    radial-gradient(116% 94% at 90% 100%, hsl(var(--lg-h3) calc(var(--lg-sat) + 8%) calc(var(--lg-lum) - 26%)) 0%, transparent 61%),
    radial-gradient(90% 76% at 14% 96%, hsl(var(--lg-h1) calc(var(--lg-sat) - 4%) calc(var(--lg-lum) - 16%)) 0%, transparent 55%),
    linear-gradient(158deg,
      hsl(var(--lg-h1) var(--lg-sat) calc(var(--lg-lum) - 5%)) 0%,
      hsl(var(--lg-h2) calc(var(--lg-sat) + 2%) calc(var(--lg-lum) - 14%)) 54%,
      hsl(var(--lg-h3) calc(var(--lg-sat) + 6%) calc(var(--lg-lum) - 22%)) 100%);
}

html[${ROOT_ATTR}] body[data-ds-dark-theme] [${FIELD_ATTR}] {
  background:
    radial-gradient(122% 96% at 12% 4%, hsl(var(--lg-h2) 76% calc(var(--lg-lum-d) + 11%)) 0%, transparent 57%),
    radial-gradient(94% 76% at 90% 2%, hsl(var(--lg-h1) 64% calc(var(--lg-lum-d) + 5%)) 0%, transparent 53%),
    radial-gradient(116% 94% at 90% 100%, hsl(var(--lg-h3) 84% calc(var(--lg-lum-d) + 16%)) 0%, transparent 61%),
    radial-gradient(90% 76% at 14% 96%, hsl(var(--lg-h1) 70% calc(var(--lg-lum-d) + 4%)) 0%, transparent 55%),
    linear-gradient(158deg,
      hsl(var(--lg-h1) 78% var(--lg-lum-d)) 0%,
      hsl(var(--lg-h2) 72% calc(var(--lg-lum-d) + 4%)) 54%,
      hsl(var(--lg-h3) 80% calc(var(--lg-lum-d) - 3%)) 100%);
}

/* Two slow orbs. Defined-edge radial gradients, no filter: a blur() here would
   mean a full-size offscreen buffer re-rasterised every frame for an effect
   the gradient already gives, and the whole point is that the pane blur has
   something worth softening. will-change is correct because these drift by
   transform only and blend with nothing. */
[${FIELD_ATTR}] .lg-orb {
  position: absolute; border-radius: 50%;
  will-change: transform;
  animation: lg-drift 40s ease-in-out infinite alternate;
}
[${FIELD_ATTR}] .lg-orb-1 {
  width: 76vmax; height: 76vmax; left: -24vmax; top: -32vmax;
  background: radial-gradient(circle closest-side,
    hsl(var(--lg-h2) 100% calc(var(--lg-lum) + 11%) / 0.95) 0%,
    hsl(var(--lg-h2) 100% calc(var(--lg-lum) + 7%) / 0.5) 42%,
    transparent 68%);
}
[${FIELD_ATTR}] .lg-orb-2 {
  width: 84vmax; height: 84vmax; right: -26vmax; bottom: -50vmax;
  background: radial-gradient(circle closest-side,
    hsl(var(--lg-h3) 100% calc(var(--lg-lum) - 8%) / 0.95) 0%,
    hsl(var(--lg-h3) 100% calc(var(--lg-lum) - 14%) / 0.4) 44%,
    transparent 70%);
  animation-duration: 54s; animation-delay: -19s;
}

/* The liquid. Two long flattened ellipses lying across the field, rotated, each
   a hard-ish edged pool of light: this is the part that gives the sheet its
   direction and its wet look, and it is the detail the panes soften. Static on
   purpose - a moving light band this large would cost a compositor layer for no
   benefit, and specular on a fixed sheet does not wander. */
[${FIELD_ATTR}] .lg-ribbon {
  position: absolute; left: 50%; top: 50%;
  width: 168vmax; height: 30vmax; margin: -15vmax 0 0 -84vmax;
  border-radius: 50%;
  mix-blend-mode: screen;
}
[${FIELD_ATTR}] .lg-ribbon-1 {
  transform: rotate(-17deg) translateY(-9vmax);
  background: radial-gradient(closest-side,
    rgba(255, 255, 255, 0.52) 0%,
    rgba(255, 255, 255, 0.20) 46%,
    rgba(255, 255, 255, 0) 76%);
}
[${FIELD_ATTR}] .lg-ribbon-2 {
  transform: rotate(12deg) translateY(13vmax);
  background: radial-gradient(closest-side,
    rgba(196, 236, 255, 0.40) 0%,
    rgba(170, 220, 255, 0.14) 50%,
    rgba(160, 215, 255, 0) 78%);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${FIELD_ATTR}] .lg-ribbon { opacity: 0.55; }

/* Grain: the scatter that separates frosted from merely blurred, and the only
   high-frequency detail on the field. Two octave sets at different tile sizes
   keep it from reading as a repeating texture. Static, so one rasterisation. */
[${FIELD_ATTR}] .lg-grain {
  position: absolute; inset: 0;
  opacity: var(--lg-tooth, 0.14);
  mix-blend-mode: overlay;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='180' height='180' filter='url(%23g)'/></svg>"),
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.34' numOctaves='3' stitchTiles='stitch'/></filter><rect width='420' height='420' filter='url(%23f)' opacity='0.6'/></svg>");
  background-size: 180px 180px, 420px 420px;
}

@keyframes lg-drift {
  0%   { transform: translate3d(0, 0, 0); }
  50%  { transform: translate3d(5vmax, 4vmax, 0); }
  100% { transform: translate3d(-4vmax, 7vmax, 0); }
}
@media (prefers-reduced-motion: reduce) {
  [${FIELD_ATTR}] .lg-orb { animation: none; }
}
[${FIELD_ATTR}][data-motion='off'] .lg-orb { animation: none; }
/* Paused only while the window is genuinely hidden. A blurred-but-visible
   window still composites every frame, so pausing there saves nothing and
   only makes the wallpaper look stuck when the user glances over. */
[${FIELD_ATTR}][data-suspended='on'] .lg-orb { animation-play-state: paused; }

/* Pointer highlight, painted ABOVE the shell.
 *
 * Two things were wrong before and both are measured, not guessed:
 *
 *   Z-ORDER. The highlight used to live inside the field node at z-index 0,
 *   i.e. behind every pane, and every pane carries a backdrop blur, so it
 *   arrived as a faint grey smear. A specular reflection sits on the OUTSIDE
 *   surface of the glass, so this node is above the shell.
 *
 *   BLEND MODE. Measured against this page: soft-light was invisible (peak
 *   delta 2), plus-lighter was invisible (6), screen only showed on dark
 *   pixels (mean 0.4 over the panel, 92 on text - it was brightening glyphs,
 *   not the glass), while plain alpha compositing shifted the panel by 60.
 *   The shell is nearly white, and nothing that "lightens" can raise white.
 *   Plain alpha does move a near-white panel toward white, so this node has no
 *   blend mode at all - which is also the cheapest option, because a blended
 *   layer cannot be composited independently of its backdrop.
 */
[${POINTER_ATTR}] {
  position: fixed; inset: 0; z-index: 50;
  pointer-events: none; overflow: hidden;
  opacity: 0; transition: opacity 500ms ease;
}
[${POINTER_ATTR}][data-pointer='on'] { opacity: var(--lg-halo, 0.6); }

/* One transform per frame moves all three lobes: they are children of a single
   zero-size box, so the compositor shifts one layer instead of three. The scale
   is the size control, and it scales around the box origin, which is exactly
   the cursor point - so the lobes stay centred at any size, and at scale 0 they
   have no area at all, which is how the size slider switches the glow off. */
[${POINTER_ATTR}] .lg-follow {
  position: absolute; left: 0; top: 0; width: 0; height: 0;
  transform: translate3d(var(--lg-px, -9999px), var(--lg-py, -9999px), 0) scale(var(--lg-hs, 1));
}
[${POINTER_ATTR}] .lg-follow > i {
  position: absolute; left: 0; top: 0; border-radius: 50%; display: block;
}
[${POINTER_ATTR}] .lg-halo {
  width: 640px; height: 640px; margin: -320px 0 0 -320px;
  background: radial-gradient(circle closest-side,
    rgba(255, 255, 255, 0.52) 0%,
    rgba(232, 245, 255, 0.24) 30%,
    rgba(214, 234, 252, 0.09) 58%,
    rgba(255, 255, 255, 0) 84%);
}
/* The ring is a cool tint rather than more white. On a nearly white pane there
   is no headroom left to brighten into - white is the ceiling - so the visible
   half of the lens is a slight shift toward blue. Together the two read as a
   highlight with a refracting rim, which is the shape Apple's lensing has. */
[${POINTER_ATTR}] .lg-lens {
  width: 320px; height: 320px; margin: -160px 0 0 -160px;
  background: radial-gradient(circle closest-side,
    rgba(255, 255, 255, 0) 32%,
    rgba(148, 194, 238, 0.26) 48%,
    rgba(170, 208, 244, 0.11) 66%,
    rgba(255, 255, 255, 0) 84%);
}
[${POINTER_ATTR}] .lg-glint {
  width: 190px; height: 190px; margin: -95px 0 0 -95px;
  background: radial-gradient(circle closest-side,
    rgba(255, 255, 255, 0.86) 0%,
    rgba(255, 255, 255, 0.38) 30%,
    rgba(255, 255, 255, 0.10) 58%,
    rgba(255, 255, 255, 0) 78%);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${POINTER_ATTR}] .lg-lens {
  background: radial-gradient(circle closest-side,
    rgba(255, 255, 255, 0) 32%,
    rgba(196, 228, 255, 0.22) 48%,
    rgba(160, 205, 255, 0.08) 66%,
    rgba(255, 255, 255, 0) 84%);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [${POINTER_ATTR}] .lg-glint {
  background: radial-gradient(circle closest-side,
    rgba(226, 242, 255, 0.8) 0%,
    rgba(196, 226, 255, 0.34) 30%,
    rgba(160, 205, 255, 0.09) 58%,
    rgba(150, 200, 255, 0) 78%);
}

/* ================= the glass ================= */

/* The frosted blur lives on ::before, never on the column itself. backdrop-
   filter makes an element the containing block for its position:fixed
   descendants, and the sidebar anchors its collapse button that way, so blur
   on the column re-anchored the button onto the column: it landed on top of
   the brand row and then got clipped away by the column's own overflow:hidden
   once the sidebar collapsed. A pseudo-element is a childless box: it still
   blurs what is behind it and cannot re-anchor anything.
   Verified free: no rule in ui-layout styles these columns' pseudo-elements.
   The frame's own ::before is NOT free (Windows titlebar drag strip) - it is
   left alone. */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol']) {
  position: relative;
}
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'])::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none;
  backdrop-filter: blur(var(--lg-glass, 24px)) saturate(155%) brightness(1.03);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'])::before {
  backdrop-filter: blur(var(--lg-glass, 24px)) saturate(140%) brightness(0.94);
}
/* The blur is the single most expensive thing this plugin asks for, so at a
   frost of zero the property is switched off rather than set to blur(0px):
   Chromium still sets up a backdrop pass for a zero-radius blur. */
html[${ROOT_ATTR}][data-glass-off] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol'])::before {
  backdrop-filter: none;
}

/* Scroll-away fades that the shell draws by running a surface token to
   transparent. Making those tokens translucent weakens the mask, so the two
   that matter are re-pointed at a near-solid version of the same surface.
   These selectors are deliberately narrow and structural. */
html[${ROOT_ATTR}] [data-overflow-below]::after {
  background-image: linear-gradient(to bottom, transparent, var(--lg-solid));
}
html[${ROOT_ATTR}] [class*='sidebarCol'] [class*='fade'] {
  background-image: linear-gradient(to bottom, transparent, var(--lg-solid));
}

/* Pane edges.
   Apple's rim is not a uniform one-pixel border: the top edge catches the most
   light, the sides carry a narrower sheen, and the bottom only picks up a
   faint bounce. The wide negative-spread inner shadow is the cheap stand-in for
   a thick glass edge - it reads as a soft falloff inside the rim rather than a
   painted line, which is what tells the eye the sheet has thickness.
   The outer seams (sidebar right edge, centre left edge) are the only edges the
   eye reads as internal, so those get the strongest highlight. */
html[${ROOT_ATTR}] [class*='sidebarCol'] {
  box-shadow:
    inset -1px 0 0 rgba(255, 255, 255, 0.88),
    inset -16px 0 24px -20px rgba(255, 255, 255, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    inset 0 -1px 0 rgba(255, 255, 255, 0.24);
}
html[${ROOT_ATTR}] [class*='centerCol'] {
  box-shadow:
    inset 2px 0 0 rgba(26, 52, 88, 0.07),
    inset 16px 0 24px -20px rgba(255, 255, 255, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.5),
    inset 0 -1px 0 rgba(255, 255, 255, 0.18);
}
html[${ROOT_ATTR}] [class*='rightbarCol'] {
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.8),
    inset 2px 0 0 rgba(26, 52, 88, 0.06),
    inset 16px 0 24px -20px rgba(255, 255, 255, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol'], [class*='rightbarCol']) {
  box-shadow:
    inset 1px 0 0 rgba(255, 255, 255, 0.14),
    inset -1px 0 0 rgba(255, 255, 255, 0.14),
    inset 2px 0 0 rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}

/* Pane tooth: a background-image, which paints behind the element's own
   content, so the texture lands on the glass and never over the text. Its
   alpha is baked into the SVG and swapped by the frost slider. The second
   layer is light entering the top edge - a broad, quick falloff that stops
   after about a sixth of the pane, which is what a sheet under a window looks
   like and the cheapest cue that the surface is a solid thing. Only the two
   panes that own a fill get the tooth: rightbarCol has no background of its
   own on Windows (its occupant paints), so a tooth there would sit on the
   wallpaper instead of on glass. The shell's own background-image is unused on
   Windows for these columns, so nothing native is being overwritten. */
html[${ROOT_ATTR}] :is([class*='sidebarCol'], [class*='centerCol']) {
  background-image:
    var(--lg-pane-tooth),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 17%);
  background-size: 168px 168px, 100% 100%;
  background-blend-mode: overlay, normal;
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([class*='sidebarCol'], [class*='centerCol']) {
  background-image:
    var(--lg-pane-tooth),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 17%);
}

/* The right column has no fill of its own on Windows, so on an empty panel it
   reads as a hole punched through to the wallpaper. Give it the same glass the
   sidebar gets, which is also what the material hierarchy wants: the right
   panel is chrome, not content. */
html[${ROOT_ATTR}] [class*='rightbarCol'] {
  background-color: rgb(255 255 255 / var(--lg-a3));
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [class*='rightbarCol'] {
  background-color: rgb(17 22 29 / var(--lg-a3));
}

/* Floating glass: the composer card.
 *
 * The card's host element has NO backdrop-filter of its own - it is only a
 * translucent fill, so at a low clarity the conversation text behind it reads
 * straight through and the input box looks like overlapping text. The blur
 * therefore has to be added here, and it is added on ::before for the same
 * reason as on the panes: a pseudo-element has no descendants, so it cannot
 * become the containing block for a position:fixed popover.
 *
 * The isolation property is what makes that pseudo's negative z-index land
 * above the card's own fill (inside a stacking context the element's background
 * paints first, then negative-z children). Without it the pseudo escapes into
 * an ancestor context and lands behind the card, where the blur is pointless.
 * The trade-off is one extra stacking context on a host element; the audit
 * checked the card's absolutely-positioned popups and found their z-index
 * ordering inside the card unchanged.
 *
 * The sheen is a background gradient rather than a second pseudo-element, so it
 * paints under the text and cannot swallow clicks. The radius is left to the
 * host: overriding it desynchronised the dashed workspace-trigger outline,
 * which uses the radius variable directly rather than inheriting it. */
html[${ROOT_ATTR}] [data-composer-card] {
  isolation: isolate;
  background-image: linear-gradient(150deg,
    rgba(255, 255, 255, 0.46) 0%, rgba(255, 255, 255, 0.10) 30%, rgba(255, 255, 255, 0) 54%);
  box-shadow:
    0 18px 44px -20px rgba(18, 38, 66, 0.42),
    0 2px 10px -6px rgba(18, 38, 66, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.4),
    inset 0 -1px 0 rgba(255, 255, 255, 0.16);
}
html[${ROOT_ATTR}] [data-composer-card]::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none; border-radius: inherit;
  backdrop-filter: blur(calc(var(--lg-glass, 24px) + 4px)) saturate(160%) brightness(1.02);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [data-composer-card] {
  background-image: linear-gradient(150deg,
    rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.04) 32%, rgba(255, 255, 255, 0) 56%);
  box-shadow:
    0 22px 50px -22px rgba(0, 0, 0, 0.78),
    inset 0 1px 0 rgba(255, 255, 255, 0.24),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.1),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] [data-composer-card]::before {
  content: ''; position: absolute; inset: 0; z-index: -1;
  pointer-events: none; border-radius: inherit;
  backdrop-filter: blur(calc(var(--lg-glass, 24px) + 4px)) saturate(140%) brightness(0.96);
}
html[${ROOT_ATTR}][data-glass-off] [data-composer-card]::before {
  backdrop-filter: none;
}

/* Menus: rim light only. They keep their native elevation shadow and their own
   backdrop blur; overriding the shadow here would fight the sweep of Apple's
   elevation scale for no gain. */
html[${ROOT_ATTR}] :is([role='menu'], [role='listbox']) {
  box-shadow:
    var(--dsw-elevation-prominent),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.34);
}
html[${ROOT_ATTR}] body[data-ds-dark-theme] :is([role='menu'], [role='listbox']) {
  box-shadow:
    var(--dsw-elevation-prominent),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.1);
}

/* ================= the settings row ================= */
.lg-panel { padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.lg-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lg-headText { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.lg-title { font-size: 14px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.lg-body { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.lg-body[data-off] { display: none; }
.lg-presets { display: flex; gap: 6px; padding: 2px 0 6px; }
.lg-preset {
  flex: 1 1 0; min-width: 0; height: 28px; padding: 0 8px; border-radius: 8px; cursor: pointer;
  font: inherit; font-size: 12px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l2);
  transition: background 120ms ease, color 120ms ease;
}
.lg-preset:hover { background: var(--dsw-alias-interactive-bg-hover); }
.lg-preset[data-active] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
  border-color: var(--dsw-alias-border-l3);
}
.lg-row { display: flex; align-items: center; gap: 12px; padding: 7px 0; }
.lg-rowLabel { flex: none; width: 76px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.lg-slider { flex: 1; min-width: 0; accent-color: var(--dsw-alias-state-business-primary); cursor: pointer; }
.lg-value { flex: none; width: 46px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-tertiary); }
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
      'row.desc': '界面变成带折射边缘的玻璃，壁纸从底下透出来。样式一栏可一键换浓淡，关掉总开关即回到原生外观。',
      'preset.clear': '清透',
      'preset.standard': '标准',
      'preset.rich': '浓郁',
      'field.clarity': '通透度',
      'field.tint': '蓝色',
      'field.frost': '磨砂',
      'field.halo': '光晕亮度',
      'field.haloSize': '光晕大小',
      'field.motion': '流动',
      'state.on': '开',
      'state.off': '关',
    }
    const en = {
      'row.title': 'Liquid glass wallpaper',
      'row.desc': 'The shell turns into glass with a refracting rim and the wallpaper shows through. The style buttons switch weight; the switch returns the stock look.',
      'preset.clear': 'Clear',
      'preset.standard': 'Standard',
      'preset.rich': 'Rich',
      'field.clarity': 'Clarity',
      'field.tint': 'Blue',
      'field.frost': 'Frost',
      'field.halo': 'Glow brightness',
      'field.haloSize': 'Glow size',
      'field.motion': 'Drift',
      'state.on': 'On',
      'state.off': 'Off',
    }

    /**
     * The background node: orbs, ribbons, grain.
     *
     * Prepended to body so it paints under the shell, which is lifted to
     * z-index 1 by the stylesheet.
     * @returns the field element.
     */
    function createField() {
      const field = document.createElement('div')
      field.setAttribute(FIELD_ATTR, '')
      field.setAttribute('aria-hidden', 'true')
      const part = (className) => {
        const node = document.createElement('div')
        node.className = className
        return node
      }
      field.append(
        part('lg-orb lg-orb-1'),
        part('lg-orb lg-orb-2'),
        part('lg-ribbon lg-ribbon-1'),
        part('lg-ribbon lg-ribbon-2'),
        part('lg-grain'),
      )
      document.body.prepend(field)
      return field
    }

    /**
     * The pointer node: three stacked lobes on one transform.
     *
     * Appended to body (after the shell in paint order anyway, and z-index 50
     * pins it above) so the highlight lands on the outside of the glass.
     * `<i>` is used because these are pure shapes with no semantics.
     * @returns the pointer element.
     */
    function createPointer() {
      const node = document.createElement('div')
      node.setAttribute(POINTER_ATTR, '')
      node.setAttribute('aria-hidden', 'true')
      const follow = document.createElement('div')
      follow.className = 'lg-follow'
      for (const name of ['lg-halo', 'lg-lens', 'lg-glint']) {
        const lobe = document.createElement('i')
        lobe.className = name
        follow.appendChild(lobe)
      }
      node.appendChild(follow)
      document.body.appendChild(node)
      return node
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

    /**
     * The three weights.
     *
     * Apple ships a Clear and a Tinted variant of this material for the same
     * reason: one set of numbers cannot serve both a bright desktop and a
     * dim one. These are that idea with a third step, and they only touch the
     * two knobs that actually move the material's weight, leaving the tint and
     * the cursor glow alone.
     */
    const PRESETS = Object.freeze([
      { id: 'clear', clarity: 0.3, frost: 0.32 },
      { id: 'standard', clarity: 0.52, frost: 0.55 },
      { id: 'rich', clarity: 0.68, frost: 0.74 },
    ])

    /** The Settings -> General row: master switch, presets, four sliders. */
    function LiquidGlassRow({ t }) {
      const [settings, setSettings] = useState(loadSettings)
      // State updaters must stay pure: React may call one twice (StrictMode) or
      // discard the render, and a persistence write plus a window event inside
      // the updater would then fire twice or not at all. Compute the next value
      // outside, then commit it once.
      const commit = useCallback((patch) => {
        const next = normalize({ ...settings, ...patch })
        saveSettings(next)
        setSettings(next)
        window.dispatchEvent(new CustomEvent('dsh-liquid-glass:change', { detail: next }))
      }, [settings])
      const activePreset = PRESETS.find(
        (preset) => Math.abs(preset.clarity - settings.clarity) < 0.005
          && Math.abs(preset.frost - settings.frost) < 0.005,
      )
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
          h('div', { className: 'lg-presets' },
            ...PRESETS.map((preset) => h('button', {
              key: preset.id,
              type: 'button',
              className: 'lg-preset',
              'data-active': activePreset?.id === preset.id ? '' : undefined,
              onClick: () => commit({ clarity: preset.clarity, frost: preset.frost }),
            }, t(`preset.${preset.id}`))),
          ),
          h(Slider, {
            label: t('field.clarity'),
            value: settings.clarity,
            min: RANGES.clarity.min,
            max: RANGES.clarity.max,
            step: RANGES.clarity.step,
            display: `${Math.round(settings.clarity * 100)}%`,
            onChange: (clarity) => commit({ clarity }),
          }),
          h(Slider, {
            label: t('field.tint'),
            value: settings.tint,
            min: RANGES.tint.min,
            max: RANGES.tint.max,
            step: RANGES.tint.step,
            display: `${Math.round(settings.tint)}`,
            onChange: (tint) => commit({ tint }),
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
            label: t('field.halo'),
            value: settings.halo,
            min: RANGES.halo.min,
            max: RANGES.halo.max,
            step: RANGES.halo.step,
            display: settings.halo === 0 ? t('state.off') : `${Math.round(settings.halo * 100)}%`,
            onChange: (halo) => commit({ halo }),
          }),
          h(Slider, {
            label: t('field.haloSize'),
            value: settings.haloSize,
            min: RANGES.haloSize.min,
            max: RANGES.haloSize.max,
            step: RANGES.haloSize.step,
            display: settings.haloSize === 0 ? t('state.off') : `${Math.round(settings.haloSize * 100)}%`,
            onChange: (haloSize) => commit({ haloSize }),
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
     * the variables those tokens already reference are rewritten.
     *
     * @param root - document element.
     * @param field - the wallpaper node, or null while disabled.
     * @param pointer - the highlight node, or null while disabled.
     * @param settings - normalized settings.
     * @param committed - true when the caller needs the whole token layer
     *   re-registered (enable/disable), false for a slider tick.
     */
    function paint(root, field, pointer, settings) {
      /**
       * Write a custom property only when it actually changed. Assigning a
       * property its current value still invalidates the style of everything
       * that inherits it, which on a drag means a full-document recalculation
       * for knobs that did not move.
       */
      const put = (name, value) => {
        if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value)
      }
      const p = palette(settings.tint)
      // Area drives thickness. --lg-a is the content surface (largest, so the
      // most opaque, and it backs the shell's own scroll-away fades); --lg-a2 is
      // every floating card and menu; --lg-a3 is the sidebar slab, between the
      // two. The slider moves all three, so the hierarchy survives any setting
      // instead of collapsing when the user drags to an extreme.
      put('--lg-a', String(Math.min(0.96, settings.clarity + 0.15)))
      put('--lg-a2', String(settings.clarity))
      put('--lg-a3', String(Math.min(0.92, settings.clarity + 0.06)))
      // The composer pill is the only surface that has to occlude rather than
      // merely tint, so it sits far above the slider value: it is the one place
      // where text underneath is actively wrong, not just less pretty.
      put('--lg-a4', String(Math.min(0.97, settings.clarity + 0.42)))
      put('--lg-h1', String(p.h1))
      put('--lg-h2', String(p.h2))
      put('--lg-h3', String(p.h3))
      put('--lg-sat', `${p.sat}%`)
      put('--lg-lum', `${p.lum}%`)
      put('--lg-lum-d', `${p.dark}%`)
      // Apple's real blur sits under about 24px; past that the pane stops
      // reading as glass and starts reading as fog, which is precisely what
      // iOS 26 beta 3 was criticised for.
      put('--lg-glass', `${(settings.frost * 30).toFixed(1)}px`)
      put('--lg-tooth', (0.03 + settings.frost * 0.26).toFixed(3))
      // The pane tooth alpha is baked into the SVG, so the whole image swaps;
      // at zero frost it is dropped entirely rather than drawn at alpha 0.
      const paneTooth = settings.frost < 0.02
        ? 'none'
        : `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='168' height='168'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.05' numOctaves='3' stitchTiles='stitch'/></filter><rect width='168' height='168' filter='url(%23n)' opacity='${(0.015 + settings.frost * 0.075).toFixed(3)}'/></svg>")`
      put('--lg-pane-tooth', paneTooth)
      put('--lg-halo', settings.halo.toFixed(2))
      // The size knob scales the whole highlight group around the cursor. At
      // zero the lobes have no area, so the glow is genuinely absent rather
      // than merely transparent - which also lets the listener go idle.
      put('--lg-hs', (settings.haloSize * 1.15).toFixed(3))
      root.toggleAttribute('data-glass-off', settings.frost < 0.02)
      if (field !== null) {
        field.dataset.motion = settings.motion ? 'on' : 'off'
        field.dataset.glass = settings.frost < 0.02 ? 'off' : 'on'
      }
      if (pointer !== null && (settings.halo <= 0 || settings.haloSize <= 0)) {
        pointer.dataset.pointer = 'off'
      }
    }

    return {
      inject: ['slots', 'theme', 'locale'],
      /**
       * Install the wallpaper: locale copy, stylesheet, both owned nodes, the
       * pointer listener, the token overrides and the settings row.
       * @param ctx - client cordis context.
       */
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'liquid glass: dictionaries')

        // Guarded like the shell's own plugin stylesheets: if apply runs twice
        // on one page (HMR), the second pass must not stack a duplicate sheet.
        const STYLE_ATTR = 'data-dsh-liquid-css'
        let style = document.querySelector(`style[${STYLE_ATTR}]`)
        if (style === null) {
          style = document.createElement('style')
          style.setAttribute(STYLE_ATTR, '')
          document.head.appendChild(style)
        }
        if (style.textContent !== CSS) style.textContent = CSS

        const root = document.documentElement
        let field = null
        let pointer = null
        let tokens = null
        /**
         * Latest snapshot. The pointer listener reads it to go completely idle
         * when the glow is switched off, instead of tracking the cursor and
         * writing a transform nobody can see.
         */
        let live = loadSettings()

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
          live = settings
          if (!settings.enabled) {
            root.removeAttribute(ROOT_ATTR)
            field?.remove()
            pointer?.remove()
            field = null
            pointer = null
            tokens?.()
            tokens = null
            return
          }
          const first = tokens === null
          root.setAttribute(ROOT_ATTR, '')
          if (field === null) {
            field = createField()
            // Seed the suspend flag here too. Only visibilitychange sets it, so
            // a plugin toggled back on while the window is hidden would leave
            // the drift running behind a hidden window until the next switch.
            field.dataset.suspended = document.hidden ? 'on' : 'off'
          }
          if (pointer === null) pointer = createPointer()
          paint(root, field, pointer, settings)
          if (first) tokens = ctx.theme.overrideTokens(PKG, tokenLayer())
        }

        sync(loadSettings())

        /**
         * One rAF-throttled pointer listener drives the highlight.
         *
         * The pointer is eased toward the real position instead of snapping to
         * it, which is what makes the light feel like it is flowing across the
         * surface rather than being stapled to the cursor. The easing runs
         * inside the same frame callback, so the whole effect is one style
         * write per frame on a node with no layout participation.
         */
        let frame = 0
        let targetX = 0
        let targetY = 0
        let shownX = 0
        let shownY = 0
        let primed = false
        const flush = () => {
          if (pointer === null) {
            frame = 0
            return
          }
          const dx = targetX - shownX
          const dy = targetY - shownY
          shownX += dx * 0.16
          shownY += dy * 0.16
          pointer.firstElementChild.style.setProperty('--lg-px', `${shownX.toFixed(1)}px`)
          pointer.firstElementChild.style.setProperty('--lg-py', `${shownY.toFixed(1)}px`)
          // Keep animating only while the light still has ground to cover.
          if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) {
            frame = window.requestAnimationFrame(flush)
          } else {
            frame = 0
          }
        }
        const onPointerMove = (event) => {
          if (pointer === null || live.halo <= 0 || live.haloSize <= 0) return
          targetX = event.clientX
          targetY = event.clientY
          if (!primed) {
            shownX = targetX
            shownY = targetY
            primed = true
          }
          if (pointer.dataset.pointer !== 'on') pointer.dataset.pointer = 'on'
          if (frame === 0) frame = window.requestAnimationFrame(flush)
        }
        // pointerout fires when the cursor crosses between elements, so trust
        // the real pointer state rather than the event.
        const hideHighlight = () => {
          if (pointer === null) return
          pointer.dataset.pointer = 'off'
          primed = false
        }
        const onPointerOut = (event) => {
          if (event.relatedTarget !== null) return
          hideHighlight()
        }
        // The pointer can also leave the window entirely, or enter an embedded
        // iframe that swallows the move events - in both cases the highlight
        // would otherwise freeze at its last position.
        const onPointerLeave = () => hideHighlight()
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        window.addEventListener('pointerout', onPointerOut, { passive: true })
        document.documentElement.addEventListener('pointerleave', onPointerLeave, { passive: true })

        /**
         * Suspend the drift while the window is hidden. Only visibilitychange
         * is observed: a blurred-but-visible window still composites every
         * frame, so pausing there saves nothing and only makes the wallpaper
         * look frozen when the user glances back at it.
         */
        const onVisibility = () => {
          if (field !== null) field.dataset.suspended = document.hidden ? 'on' : 'off'
        }
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
          document.documentElement.removeEventListener('pointerleave', onPointerLeave)
          document.removeEventListener('visibilitychange', onVisibility)
          if (frame !== 0) window.cancelAnimationFrame(frame)
          tokens?.()
          field?.remove()
          pointer?.remove()
          // Only drop the sheet this instance owns; a second instance (HMR, or
          // a re-apply) shares the single tagged <style>.
          if (document.querySelectorAll('style[data-dsh-liquid-css]').length <= 1) style.remove()
          root.removeAttribute(ROOT_ATTR)
          root.removeAttribute('data-glass-off')
          for (const name of [
            '--lg-a', '--lg-a2', '--lg-a3', '--lg-a4',
            '--lg-h1', '--lg-h2', '--lg-h3', '--lg-sat',
            '--lg-lum', '--lg-lum-d', '--lg-glass',
            '--lg-tooth', '--lg-pane-tooth', '--lg-halo', '--lg-hs',
          ]) {
            root.style.removeProperty(name)
          }
        }, 'liquid glass: teardown')

        ctx.slots.inject('settings.general.item', () => ctx.slots.register({
          name: 'settings.general.item',
          id: 'liquid-glass',
          order: 11.9,
          locale: NS,
        }, LiquidGlassRow))
      },
    }
  },
})
