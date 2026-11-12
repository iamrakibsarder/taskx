/**
 * Feature switches, set at build time.
 *
 * - `VITE_SCREENSHOTS=on` turns timer screenshots back on. They're on hold for now, so by
 *   default the option is hidden in Settings and the start-timer dialog, and timers never
 *   ask to share the screen. The code and any saved screenshots are kept.
 */
export const SCREENSHOTS = import.meta.env.VITE_SCREENSHOTS === 'on';
