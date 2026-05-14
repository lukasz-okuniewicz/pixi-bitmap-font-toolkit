# Bitmap Font Toolkit

Browser-based **BMFont** multitool for [PixiJS](https://pixijs.com/) workflows: load or generate bitmap font descriptors, edit metrics and kerning with a **Pixi.js** live preview, and export XML, ASCII `.fnt`, binary `.fnt`, or a ZIP of descriptor plus atlas images. **All processing runs in your browser**—nothing is uploaded to a server.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal (usually `http://localhost:3000`). Use the in-app **Help** panel for format details, keyboard shortcuts, and workflows.

```bash
npm test
```

Runs [Vitest](https://vitest.dev/) unit tests for parsers, serializers, and font logic.

## Deep links

The **Load font** tabs can be opened directly:

- `?tab=bmfont` — default BMFont file upload
- `?tab=styledStrip` — styled charset strip import
- `?tab=rasterFont` — rasterize `.ttf` / `.otf` in the browser

Example: `http://localhost:3000/?tab=rasterFont`

## Multi-page atlases

If your font uses several atlas pages:

- Switch **Texture** tabs in the editor to review each page.
- **Download ZIP** packs the exported XML plus each page image the session could read (matched by `<page file="…">` names when you multi-select uploads).
- Use **Diagnostics** messages and **Go** (when shown) to jump to a glyph or atlas tab.
- Prefer fixing `page` indices in the character table or re-exporting from your toolchain if a glyph points at the wrong atlas.

## Offline (PWA)

After a production build, a minimal service worker may cache static assets for faster repeat visits. First load still requires a network connection to fetch the app.

## License

See [LICENSE](LICENSE).
