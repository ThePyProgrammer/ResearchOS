# Appearance

Choose **Light**, **Dark**, or **System** from the **Theme** selector at the bottom of the sidebar, or from **Library settings → Appearance**. The selector is also available when the sidebar is collapsed. System is the default and follows changes to your device's appearance.

Dark mode uses Obsidian-inspired charcoal surfaces, subtle gray borders, muted text, and violet accents. The theme applies to navigation, library and project views, tables, forms, dialogs, Copilot, rich-text notes, canvases, graphs, charts, and LaTeX previews. Status colors and user-selected canvas/task colors retain their meaning.

Your preference is saved for this browser and synchronized between open tabs. It applies before the application loads to avoid a light flash. If browser storage is blocked, switching themes still works for the current session. Switching does not reload the page or change your notes.

Images, PDFs, and external embedded pages keep their original appearance. Printable note exports retain their print styling; canvas PNG exports use the current theme. JSON Canvas files store document data, not the application theme.

## Development

`frontend/themePalette.cjs` generates the light and dark CSS variables used by Tailwind. Foreground, background, and border colors have separate roles, so utility variants such as `hover:bg-slate-50` and opacity modifiers work in either theme. Light mode retains the existing utility colors. The dark sidebar has its own surface scope for translucent white hover states.

The stylesheet explicitly references `tailwind.config.cjs`. Both the config and palette use CommonJS so Tailwind 3 can invalidate its configuration cache during development, including on Node versions with native `require(ESM)` support. Native ES module caching can otherwise leave a running server serving the old light utilities after a config edit.

Use Tailwind utilities or the `--ui-*` variables in `frontend/src/index.css` for new UI surfaces. Custom editors, SVG visualizations, and imperative autocomplete menus use the same tokens. Keep data colors separate from interface colors. Recharts tooltips and third-party editors need explicit themed styles.

`ThemeProvider` manages the preference and system changes. `frontend/public/theme.js` is the small pre-render script; keep its preference key and resolution rules consistent with the provider.

Validation: run `npm run test:run`, `npm run test:e2e -- theme.spec.js`, and `npm run build` from `frontend`. The full unit suite assumes `TZ=UTC`. Theme browser tests cover persistence, system changes, cross-tab updates, collapsed navigation, application surfaces, dialogs, notes, graphs, and canvases, and produce screenshots for review.
