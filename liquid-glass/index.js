/**
 * Host half of the liquid-glass theme. The plugin is purely visual: the
 * wallpaper, the glass layers and the settings row all live in the browser
 * bundle exported from `./client`. This empty `apply` exists so the Host
 * loader has a row to mount, which is what puts the package into the client
 * module graph.
 */

/** Host plugin body. No host-side behaviour for this surface-only plugin. */
export function apply() {}
