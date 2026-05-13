'use client'

import React from 'react'

type ShoeboxHelpSectionProps = {
  darkTheme: boolean
  text: string
  textMuted: string
  inputBorder: string
  panelBorder: string
}

const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, margin: '20px 0 8px', color: 'inherit' }
const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, margin: '0 0 10px', color: 'inherit' }
const ul: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, margin: '0 0 10px', paddingLeft: 20 }
const code: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
  fontSize: 12,
  padding: '1px 5px',
  borderRadius: 4,
}

export function ShoeboxHelpSection({ darkTheme, text, textMuted, inputBorder, panelBorder }: ShoeboxHelpSectionProps) {
  const codeBg = darkTheme ? '#1e293b' : '#f3f4f6'
  const codeStyle = { ...code, background: codeBg, border: `1px solid ${inputBorder}` }

  return (
    <section
      id="editor-help-panel"
      role="region"
      aria-label="Help and documentation"
      style={{
        marginBottom: 24,
        padding: '16px 18px 18px',
        border: `1px solid ${panelBorder}`,
        borderRadius: 12,
        background: darkTheme ? '#1e293b' : '#fff',
        color: text,
        maxHeight: '70vh',
        overflowY: 'auto',
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>Help</h1>

      <h2 style={{ ...h2, marginTop: 0 }}>What this tool is</h2>
      <p style={p}>
        <strong>Pixi: Bitmap Font Toolkit</strong> is a browser-based <strong>bitmap font multitool</strong> for the BMFont XML format. On each visit it loads a small{' '}
        <strong>bundled example</strong> BMFont (XML + PNG from the site) so you can explore the UI immediately; use <strong>Upload font files</strong> (or the
        other import tabs) to replace it for the current browser session. You can upload an existing <strong>font descriptor</strong> (XML or plain{' '}
        <code style={codeStyle}>.fnt</code>) plus an <strong>atlas image</strong> (usually PNG), <em>or</em> generate a starter descriptor from a{' '}
        <strong>styled charset image</strong> (Shoebox-style) or by <strong>rasterizing a .ttf/.otf</strong> in the browser. The app parses or builds the model,
        lets you inspect and edit metrics, previews with <strong>Pixi.js</strong> the same way <code style={codeStyle}>BitmapText</code> +{' '}
        <code style={codeStyle}>BitmapFont.install</code> would in a game, and exports updated XML. Nothing is uploaded to a server; everything runs locally.
      </p>

      <h2 style={h2}>Optional import modes</h2>
      <p style={p}>
        Use the tabs under <strong>Load font</strong> to switch paths. The default <strong>BMFont files</strong> flow is unchanged from earlier versions. You can
        deep-link a tab with the query parameter <code style={codeStyle}>?tab=bmfont</code>, <code style={codeStyle}>?tab=styledStrip</code>, or{' '}
        <code style={codeStyle}>?tab=rasterFont</code> (for example bookmarking the rasterizer).
      </p>
      <ul style={ul}>
        <li style={{ marginBottom: 8 }}>
          <strong>Styled charset PNG</strong> — For Photoshop (or similar) workflows: export one image whose glyphs appear in reading order (left to right per
          row, rows top to bottom). Paste the same character sequence into <strong>Charset</strong>, upload the image, then <strong>Build BMFont from styled image</strong>.
          The tool finds glyph boxes from alpha and writes <code style={codeStyle}>&lt;char&gt;</code> entries. Glows or tight pairs can merge regions; fix
          rectangles in the texture editor afterward. <strong>Space</strong> (U+0020) is never sliced from ink: it uses a 1×1 atlas anchor and the{' '}
          <strong>space xadvance</strong> value you set.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Raster from font file</strong> — Pick a <code style={codeStyle}>.ttf</code> or <code style={codeStyle}>.otf</code> the browser can load via{' '}
          <code style={codeStyle}>FontFace</code>, enter a charset and size, then <strong>Generate atlas + XML</strong>. A new PNG atlas is packed in rows
          (max width you choose). Duplicate characters in the charset are deduplicated (one glyph per code point). Respect the font&apos;s license; complex
          scripts (Arabic shaping, etc.) are not targeted—Latin-style glyphs work best.
        </li>
      </ul>
      <p style={p}>
        The <strong>styled strip</strong> and <strong>raster</strong> generators do not embed kerning tables in the BMFont they build. After import, use the
        kerning table for manual pairs, or run <strong>Estimate kernings from font…</strong> (under Kerning) with a <code style={codeStyle}>.ttf</code> /{' '}
        <code style={codeStyle}>.otf</code>: the tool measures pairs in canvas using your current glyph set (or the raster charset when the font has fewer than
        two glyphs), merges into existing pairs, and caps how many pairs it evaluates for responsiveness. That path is a <strong>heuristic</strong> (Latin-style
        proportional fonts work best), not a full OpenType kerning extract. You can still tweak <strong>face</strong>, <strong>lineHeight</strong>, offsets, and
        download XML as before.
      </p>

      <h2 style={h2}>Typical workflow</h2>
      <ol style={{ ...ul, listStyleType: 'decimal' }}>
        <li style={{ marginBottom: 6 }}>
          The editor opens with the bundled example font. Under <strong>BMFont files (default)</strong>, click <strong>Upload font files</strong> when you want
          your own XML or .fnt plus atlas (multi-select or one at a time). Refreshing the page restores the example.
        </li>
        <li style={{ marginBottom: 6 }}>Confirm the texture and Pixi previews look correct.</li>
        <li style={{ marginBottom: 6 }}>Adjust global fields (<code style={codeStyle}>face</code>, <code style={codeStyle}>lineHeight</code>, etc.) and glyph rows as needed.</li>
        <li style={{ marginBottom: 6 }}>Use <strong>Download XML</strong> to save. Until you download, edits are only in memory (&quot;Unsaved edits&quot;).</li>
      </ol>

      <h2 style={h2}>For designers</h2>
      <p style={p}>
        Your letters live on a <strong>texture atlas</strong>: a single image with many glyphs. The XML says <em>where</em> each character sits on that
        image (<strong>atlas X/Y/width/height</strong>) and <em>how</em> it is drawn relative to the text cursor (<strong>offsets</strong> and{' '}
        <strong>advance</strong>). If letters look cut off, wrong position, or too tight/loose, you usually change those numbers—or fix the source export
        from Shoebox / TexturePacker / your pipeline and re-upload.
      </p>
      <p style={p}>
        The <strong>Texture</strong> panel shows your atlas with optional <strong>glyph outlines</strong>. You can drag a glyph rectangle to move it on
        the atlas; the character table updates accordingly. Use <strong>Preview text</strong> to type sample copy (including line breaks) and check
        real-world strings.
      </p>

      <h2 style={h2}>For developers</h2>
      <p style={p}>
        Pixi matches glyphs by <strong>Unicode code point</strong> (<code style={codeStyle}>char id=&quot;…&quot;</code>). The <strong>face</strong> string
        becomes <code style={codeStyle}>fontName</code> in a Pixi style object, for example{' '}
        <code style={codeStyle}>{`{ fontName: 'myFont' }`}</code> passed to <code style={codeStyle}>BitmapText</code>. <strong>lineHeight</strong> drives
        multi-line layout; <strong>scaleW</strong> / <strong>scaleH</strong> must match how UVs were authored for the atlas dimensions.{' '}
        <strong>page file</strong> is the filename embedded in XML for loading the texture at runtime—keep it consistent with how your build copies assets.
      </p>
      <p style={p}>
        This editor re-serializes XML from its internal model. Known BMFont fields on <code style={codeStyle}>&lt;info&gt;</code>, <code style={codeStyle}>&lt;common&gt;</code>,{' '}
        <code style={codeStyle}>&lt;page&gt;</code>, <code style={codeStyle}>&lt;char&gt;</code>, and <code style={codeStyle}>&lt;kerning&gt;</code> are preserved;
        additional <strong>attributes</strong> on those same tags round-trip as opaque strings. Custom <strong>child elements</strong> under{' '}
        <code style={codeStyle}>&lt;font&gt;</code> are not preserved—reintroduce them in your pipeline if you rely on them.
      </p>

      <h2 style={h2}>Toolbar controls</h2>
      <ul style={ul}>
        <li>
          <strong>Download XML</strong> — Exports the current BMFont XML and marks the in-memory snapshot as saved.
        </li>
        <li>
          <strong>Download ZIP</strong> — Packages the current XML plus each atlas page image that can be read from this session (same folder layout as{' '}
          <code style={codeStyle}>&lt;page file=&quot;…&quot;&gt;</code> names).
        </li>
        <li>
          <strong>Download .fnt</strong> — BMFont ASCII text format with the same metrics as the XML export.
        </li>
        <li>
          <strong>Download binary .fnt</strong> — AngelCode BMF version 3 binary; use when your runtime expects binary BMFont instead of ASCII lines.
        </li>
        <li>
          <strong>Verify XML round-trip</strong> — In Diagnostics, checks parse → serialize → parse for structural drift (glyph ids, counts, kernings, common scale fields).
        </li>
        <li>
          <strong>Undo / Redo</strong> — <kbd style={codeStyle}>⌘</kbd>/<kbd style={codeStyle}>Ctrl</kbd>+<kbd style={codeStyle}>Z</kbd> undo,{' '}
          <kbd style={codeStyle}>⇧⌘Z</kbd> / <kbd style={codeStyle}>⌘Y</kbd> redo (disabled while typing in inputs).
        </li>
        <li>
          <strong>Session restore</strong> — The app may offer to restore a previous session from browser storage (includes your font data locally — treat as sensitive).
        </li>
        <li>
          <strong>Baseline</strong> — Draws a red guide at an approximate first-line baseline in the Pixi preview (uses bounds + <code style={codeStyle}>
            lineHeight
          </code>
          ).
        </li>
        <li>
          <strong>Anchor Y (0.5)</strong> — Cyan line at <code style={codeStyle}>BitmapText.y</code>; the preview uses <code style={codeStyle}>anchor.y = 0.5</code>{' '}
          and centers vertically in the panel so you can judge vertical balance.
        </li>
        <li>
          <strong>Auto center Y</strong> — Adds the same <code style={codeStyle}>yoffset</code> delta to <em>every</em> glyph so the preview string’s bounding
          box centers on that anchor line (good for batch nudging; re-run after big edits if needed).
        </li>
        <li>
          <strong>Glyph outlines</strong> — Overlays rectangles from the character table on the atlas view.
        </li>
        <li>
          <strong>Export name</strong> — Suggested filename for the download; does not change XML contents.
        </li>
      </ul>

      <h2 style={h2}>Global fields (top grid)</h2>
      <dl style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
        <dt style={{ fontWeight: 600, marginTop: 8 }}>face</dt>
        <dd style={{ margin: '4px 0 0', color: textMuted }}>Font family name in BMFont; Pixi uses it as the installed font key.</dd>
        <dt style={{ fontWeight: 600, marginTop: 8 }}>size</dt>
        <dd style={{ margin: '4px 0 0', color: textMuted }}>Nominal font size in pixels from the descriptor; used with BitmapText scaling.</dd>
        <dt style={{ fontWeight: 600, marginTop: 8 }}>lineHeight</dt>
        <dd style={{ margin: '4px 0 0', color: textMuted }}>Vertical distance between lines for multi-line text.</dd>
        <dt style={{ fontWeight: 600, marginTop: 8 }}>scaleW / scaleH</dt>
        <dd style={{ margin: '4px 0 0', color: textMuted }}>Atlas pixel dimensions; must align with glyph UV rectangles.</dd>
        <dt style={{ fontWeight: 600, marginTop: 8 }}>page file</dt>
        <dd style={{ margin: '4px 0 0', color: textMuted }}>
          Value written to <code style={codeStyle}>&lt;page file=&quot;…&quot;&gt;</code>. Your game loader should resolve this to the actual image path.
        </dd>
      </dl>

      <h2 style={h2}>Character table</h2>
      <p style={p}>
        Lists every glyph in the font. Rows are virtualized for performance on large fonts. Use <strong>Filter</strong> to narrow by code point,{' '}
        <code style={codeStyle}>U+…</code>, or glyph label. <strong>Select filtered</strong> selects all visible rows; click rows with{' '}
        <kbd style={codeStyle}>⇧</kbd> for a range or <kbd style={codeStyle}>⌘</kbd>/<kbd style={codeStyle}>Ctrl</kbd> to toggle. <strong>Bulk Δ</strong> adds the
        typed deltas to every selected glyph’s atlas position and offsets; preset buttons set <strong>adv = width</strong> or <strong>adv = max(w,h)</strong> in one undo step. Click the grid background (below headers) to focus the table, then use <kbd style={codeStyle}>↑</kbd>/<kbd style={codeStyle}>↓</kbd>, Home/End, and Enter (opens atlas X) for keyboard navigation. Click a row’s char code to highlight that glyph on the atlas when <strong>Glyph outlines</strong> is on.
      </p>
      <ul style={ul}>
        <li>
          <strong>Char code</strong> — Unicode scalar value (<code style={codeStyle}>id</code> in XML).
        </li>
        <li>
          <strong>Atlas X / Y / Width / Height</strong> — Pixel rectangle in the atlas image for that glyph’s texture region.
        </li>
        <li>
          <strong>Offset X / Y</strong> — Pixel offset from the pen when drawing the glyph; use Y to nudge vertically relative to the line.
        </li>
        <li>
          <strong>Advance X</strong> — How far to advance the pen after the glyph (horizontal stride).
        </li>
      </ul>

      <h2 style={h2}>Kerning</h2>
      <p style={p}>
        Pairs <code style={codeStyle}>(first, second)</code> add extra horizontal spacing (can be negative) when <code style={codeStyle}>second</code> follows{' '}
        <code style={codeStyle}>first</code> immediately. Use the small preview inputs to pick two characters and read the matching <strong>amount</strong> from
        the table. <strong>Estimate kernings from font…</strong> runs a canvas-based heuristic (best on proportional Latin fonts); merge results are de-duplicated by pair.
      </p>

      <h2 style={h2}>Preview text &amp; Pixi panel</h2>
      <p style={p}>
        <strong>Preview text</strong> drives the string in the <strong>Pixi preview</strong> (multi-line supported). Change it to stress-test punctuation,
        numbers, currency symbols, or languages you ship. The preview uses your live XML and atlas; when you edit the character table or kernings, the
        canvas updates on the next sync.
      </p>

      <h2 style={h2}>Hover tooltips</h2>
      <p style={p}>
        Many labels and inputs show a short explanation when you hover. You can move the pointer onto the tooltip to read longer text before leaving the
        control.
      </p>

      <h2 style={h2}>Page file vs. uploaded PNG</h2>
      <p style={p}>
        The editor always previews with the image you uploaded, even if the <strong>page file</strong> string in XML still points at a different filename
        from your DCC export. If you see a hint that names do not match, fix <strong>page file</strong> before export so your runtime loader can find the
        atlas on disk or CDN.
      </p>

      <h2 style={h2}>Multi-page fonts</h2>
      <p style={p}>
        If the XML declares more than one atlas page, the app shows a warning: only <strong>one uploaded image</strong> is wired for preview. Full multi-page
        editing is not the focus here—split workflows or merge atlases if you hit this.
      </p>

      <h2 style={h2}>Dark UI</h2>
      <p style={{ ...p, marginBottom: 0 }}>
        Toggle is stored in <code style={codeStyle}>localStorage</code> under <code style={codeStyle}>pixi-bitmap-font-toolkit-dark-ui</code> (<code style={codeStyle}>1</code>{' '}
        / <code style={codeStyle}>0</code>) so your preference returns on the next visit.
      </p>
    </section>
  )
}
