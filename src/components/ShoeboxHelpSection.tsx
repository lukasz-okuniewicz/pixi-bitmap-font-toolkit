'use client'

import React, { useEffect, useRef, useState } from 'react'

import { withBasePath } from '@/lib/withBasePath'

type DeferredHelpVideoProps = {
  src: string
  ariaLabel: string
  openLinkLabel: string
  videoStyle: React.CSSProperties
  videoFallbackStyle: React.CSSProperties
  linkStyle: React.CSSProperties
  text: string
  textMuted: string
  panelBorder: string
  darkTheme: boolean
}

function DeferredHelpVideo({
  src,
  ariaLabel,
  openLinkLabel,
  videoStyle,
  videoFallbackStyle,
  linkStyle,
  text,
  textMuted,
  panelBorder,
  darkTheme,
}: DeferredHelpVideoProps) {
  const [active, setActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!active) return
    const el = videoRef.current
    if (!el) return
    void el.play().catch(() => {})
  }, [active])

  const buttonBg = darkTheme ? '#334155' : '#e5e7eb'
  const placeholderStyle: React.CSSProperties = {
    ...videoStyle,
    boxSizing: 'border-box',
    minHeight: 200,
    aspectRatio: '16 / 9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: 600,
    color: text,
    background: buttonBg,
    border: `1px solid ${panelBorder}`,
  }

  if (!active) {
    return (
      <button
        type="button"
        style={placeholderStyle}
        onClick={() => setActive(true)}
        aria-label={`Load and play walkthrough: ${ariaLabel}`}
      >
        <span style={{ textAlign: 'center', lineHeight: 1.45, padding: '0 12px' }}>
          Play walkthrough
          <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: textMuted, marginTop: 6 }}>
            Loads the video when you choose (saves bandwidth).
          </span>
        </span>
      </button>
    )
  }

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      preload="none"
      style={videoStyle}
      src={src}
      aria-label={ariaLabel}
    >
      <span style={videoFallbackStyle}>
        This browser cannot play the embedded video.{' '}
        <a href={src} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {openLinkLabel}
        </a>
        .
      </span>
    </video>
  )
}

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
  const inspectTutorialMp4 = withBasePath('/inspect-modify.mp4')
  const createFromPngMp4 = withBasePath('/create-from-png.mp4')

  const codeBg = darkTheme ? '#1e293b' : '#f3f4f6'
  const codeStyle = { ...code, background: codeBg, border: `1px solid ${inputBorder}` }

  const figcaptionStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    margin: '0 0 8px',
    color: text,
  }
  const videoStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    display: 'block',
    borderRadius: 8,
    border: `1px solid ${panelBorder}`,
    background: darkTheme ? '#0f172a' : '#f8fafc',
  }
  const figureVideoStyle: React.CSSProperties = { margin: '0 0 20px', padding: 0, width: '100%', minWidth: 0 }
  const videoFallbackStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
    padding: '10px 12px',
    color: textMuted,
    borderTop: `1px solid ${inputBorder}`,
  }
  const linkStyle: React.CSSProperties = {
    color: text,
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  }

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

      <h2 style={{ ...h2, marginTop: 0 }}>Video walkthroughs</h2>
      <p style={{ ...p, color: textMuted, fontSize: 12, marginBottom: 14 }}>
        Screen recordings hosted with the app (nothing leaves your machine when you watch them). If playback does not start, use the link under each player to
        open the <code style={codeStyle}>.mp4</code> directly.
      </p>
      <figure style={figureVideoStyle}>
        <figcaption style={figcaptionStyle}>Inspect and modify an existing bitmap font (BMFont XML + atlas)</figcaption>
        <DeferredHelpVideo
          src={inspectTutorialMp4}
          ariaLabel="Screencast: inspect and modify an existing bitmap font"
          openLinkLabel="Open inspect-modify.mp4 in a new tab"
          videoStyle={videoStyle}
          videoFallbackStyle={videoFallbackStyle}
          linkStyle={linkStyle}
          text={text}
          textMuted={textMuted}
          panelBorder={panelBorder}
          darkTheme={darkTheme}
        />
      </figure>
      <figure style={figureVideoStyle}>
        <figcaption style={figcaptionStyle}>Create new BMFont XML from a styled charset PNG</figcaption>
        <DeferredHelpVideo
          src={createFromPngMp4}
          ariaLabel="Screencast: create BMFont XML from a PNG"
          openLinkLabel="Open create-from-png.mp4 in a new tab"
          videoStyle={videoStyle}
          videoFallbackStyle={videoFallbackStyle}
          linkStyle={linkStyle}
          text={text}
          textMuted={textMuted}
          panelBorder={panelBorder}
          darkTheme={darkTheme}
        />
      </figure>

      <h2 style={h2}>What this tool is</h2>
      <p style={p}>
        <strong>Bitmap Font Toolkit</strong> is a browser-based <strong>bitmap font multitool</strong> for the BMFont XML format. On each visit it loads a small{' '}
        <strong>bundled example</strong> BMFont (XML + PNG from the site) so you can explore the UI immediately; use <strong>Upload font files</strong> (or the
        other import tabs) to replace it for the current browser session. You can upload an existing <strong>font descriptor</strong> (BMFont XML, ASCII{' '}
        <code style={codeStyle}>.fnt</code>, or binary AngelCode BMF v3) plus an <strong>atlas image</strong> (usually PNG), <em>or</em> generate a starter descriptor from a{' '}
        <strong>styled charset image</strong> (Shoebox-style) or by <strong>rasterizing a browser-loadable font</strong> (<code style={codeStyle}>.ttf</code>,{' '}
        <code style={codeStyle}>.otf</code>, <code style={codeStyle}>.woff</code>, <code style={codeStyle}>.woff2</code>) in the browser. The app parses or builds the model,
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
          rectangles in the texture editor afterward. If your charset does not include <strong>space</strong> (U+0020), one is appended automatically so the XML
          always has a space glyph. <strong>Space</strong> is never sliced from ink: it uses a 1×1 atlas anchor and the <strong>space xadvance</strong> value you set.
          Optional <strong>Detect comma vs period from ink</strong> swaps comma (U+002C) and period (U+002E) when glyph ink shape disagrees with charset order.
        </li>
        <li style={{ marginBottom: 8 }}>
          <strong>Raster from font file</strong> — Pick a <code style={codeStyle}>.ttf</code>, <code style={codeStyle}>.otf</code>, <code style={codeStyle}>.woff</code>, or{' '}
          <code style={codeStyle}>.woff2</code> the browser can load via <code style={codeStyle}>FontFace</code>, enter a charset and size, then{' '}
          <strong>Generate atlas + XML</strong>. A new PNG atlas is packed in rows
          (max width you choose). Duplicate characters in the charset are deduplicated (one glyph per code point). Respect the font&apos;s license; complex
          scripts (Arabic shaping, etc.) are not targeted—Latin-style glyphs work best.
        </li>
      </ul>
      <p style={p}>
        The <strong>styled strip</strong> and <strong>raster</strong> generators do not embed kerning tables in the BMFont they build. After import, add
        kerning pairs manually in the kerning table. You can still tweak <strong>face</strong>, <strong>lineHeight</strong>, offsets, and download XML as before.
      </p>

      <h2 style={h2}>Typical workflow</h2>
      <ol style={{ ...ul, listStyleType: 'decimal' }}>
        <li style={{ marginBottom: 6 }}>
          Each visit starts by loading the <strong>bundled example</strong> font so the UI is never empty. If a <strong>Previous session found</strong> banner
          appears, <strong>Restore</strong> replaces that example with your auto-saved work (which can include several fonts under <strong>Open fonts</strong>).
          <strong> Dismiss</strong> keeps the example for now and hides that snapshot until a newer auto-save; <strong>Clear stored session</strong> deletes the
          saved data from this browser. Under <strong>BMFont files (default)</strong>, click <strong>Upload font files</strong> for your own XML, text .fnt, or binary BMF plus
          atlas (multi-select or one at a time).
        </li>
        <li style={{ marginBottom: 6 }}>
          When more than one font is kept, use the <strong>Open fonts</strong> control under <strong>Load font</strong> to switch the active slot. A{' '}
          <code style={codeStyle}>*</code> next to a name marks unsaved edits for that slot (relative to the last download or saved baseline for that font).
        </li>
        <li style={{ marginBottom: 6 }}>Confirm the texture and Live previews look correct.</li>
        <li style={{ marginBottom: 6 }}>Adjust <strong>Font metadata</strong> (<code style={codeStyle}>face</code>, <code style={codeStyle}>lineHeight</code>, etc.) and glyph rows as needed.</li>
        <li style={{ marginBottom: 6 }}>Use <strong>Download XML</strong> to save. Until you download, edits are only in memory (&quot;Unsaved edits&quot;).</li>
      </ol>

      <h2 style={h2}>Multiple open fonts</h2>
      <p style={p}>
        Starting another full import or generator run <strong>archives</strong> the font you were editing and opens a <strong>new slot</strong> for the new
        result—for example uploading a different BMFont (first descriptor in the selection triggers archive once), running{' '}
        <strong>Build BMFont from styled image</strong>, or <strong>Generate atlas + XML</strong> from the raster tab. Previous slots stay in memory (and in
        auto-saved session data) with their own undo history, baseline snapshot, export names, and atlas images. Use <strong>Open fonts</strong> to switch between
        them; use <strong>Clear stored session</strong> on the restore banner when you want to drop every saved slot from this browser.
      </p>

      <h2 style={h2}>For designers</h2>
      <p style={p}>
        Your letters live on a <strong>texture atlas</strong>: a single image with many glyphs. The XML says <em>where</em> each character sits on that
        image (<strong>atlas X/Y/width/height</strong>) and <em>how</em> it is drawn relative to the text cursor (<strong>offsets</strong> and{' '}
        <strong>advance</strong>). If letters look cut off, wrong position, or too tight/loose, you usually change those numbers—or fix the source export
        from Shoebox / TexturePacker / your pipeline and re-upload.
      </p>
      <p style={p}>
        The <strong>Texture</strong> panel shows your atlas with optional <strong>glyph outlines</strong>. You can drag a glyph rectangle to move it on
        the atlas; the character table updates accordingly. <strong>Click</strong> a glyph (without dragging) to open a quick editor for offsets and
        advance (atlas X/Y, width, and height appear there when you enable <strong>Show atlas X/Y, width &amp; height</strong> under Glyphs). Use{' '}
        <strong>Preview text</strong> to type sample copy (including line breaks) and check real-world strings.
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

      <h2 style={h2}>Save, export &amp; editor shortcuts</h2>
      <p style={p}>
        <strong>Download XML</strong>, <strong>Download ZIP</strong>, <strong>Download .fnt</strong>, <strong>Download binary .fnt</strong>, and{' '}
        <strong>Export name</strong> live in the bottom <strong>Save &amp; export</strong> section (labeled <strong>unsaved edits</strong> when the model differs
        from your last download or import baseline). ZIP bundles the XML plus each atlas page image readable from this session (paths match{' '}
        <code style={codeStyle}>&lt;page file=&quot;…&quot;&gt;</code> names). Binary export is AngelCode BMF v3 for runtimes that expect binary BMFont.
      </p>
      <p style={p}>
        Preview overlays—<strong>Baseline</strong>, <strong>Anchor Y (0.5)</strong>, <strong>Glyph outlines</strong>, <strong>Advance bars</strong>,{' '}
        <strong>Compare to loaded</strong>, <strong>Compare with another open font</strong>, and <strong>Auto center Y</strong>—are under{' '}
        <strong>Preview guides &amp; metrics assist</strong> (above the Live preview panels).
      </p>
      <ul style={ul}>
        <li>
          <strong>Undo / Redo</strong> — <kbd style={codeStyle}>⌘</kbd>/<kbd style={codeStyle}>Ctrl</kbd>+<kbd style={codeStyle}>Z</kbd> undo,{' '}
          <kbd style={codeStyle}>⇧⌘Z</kbd> / <kbd style={codeStyle}>⌘Y</kbd> redo (disabled while typing in inputs). Numeric fields support{' '}
          <strong>click-drag left/right</strong> to scrub values (a small movement still allows normal typing). A <strong>↺</strong> control on a field restores
          that field to the value from the <strong>last import or generator</strong> (not the same as undo).
        </li>
        <li>
          <strong>Session restore</strong> — After a short debounce, the app auto-saves the whole workspace to <strong>IndexedDB</strong> in this browser
          (every <strong>Open fonts</strong> slot, atlases, undo stacks). On the next visit, a <strong>Previous session found</strong> banner may list how many
          fonts were stored; <strong>Restore</strong> loads them all, <strong>Clear stored session</strong> wipes that database entry, and <strong>Dismiss</strong>{' '}
          hides that particular save until timestamps change (e.g. after more editing auto-saves again). Treat stored font data as sensitive.
        </li>
      </ul>

      <h2 style={h2}>Diagnostics</h2>
      <p style={p}>
        The collapsible <strong>Diagnostics</strong> panel lists validation issues for the active font—duplicate character ids, glyphs outside{' '}
        <code style={codeStyle}>scaleW</code>×<code style={codeStyle}>scaleH</code>, zero-size rectangles, unknown kerning character ids, page count mismatches,
        and similar—sorted by severity (<strong>Fix next</strong> summarizes errors, warnings, and info). Rows with a target offer <strong>Jump</strong> to
        scroll the character or kerning table to that glyph or pair. At the bottom, <strong>Verify XML round-trip</strong> serializes the current model to XML,
        parses it back, and reports structural drift (glyph ids, counts, kernings, common scale fields) without changing your font.
      </p>

      <h2 style={h2}>Font metadata</h2>
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
        typed deltas to every selected glyph’s atlas position and offsets; preset buttons set effective advance to <strong>glyph width</strong> or{' '}
        <strong>max(w,h)</strong> (accounting for <strong>Global advance X</strong>) in one undo step. Click the grid background (below headers) to focus the table, then use <kbd style={codeStyle}>↑</kbd>/<kbd style={codeStyle}>↓</kbd>, Home/End, and Enter (opens atlas X) for keyboard navigation. Click a row’s char code to highlight that glyph on the atlas when <strong>Glyph outlines</strong> is on.
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
          <strong>Global advance X</strong> — Horizontal spacing added to every glyph (stored on <code style={codeStyle}>&lt;common globalXAdvance=&quot;…&quot;&gt;</code>{' '}
          when non-zero). The character table’s per-glyph value is added on top; the exported file still uses a single combined <code style={codeStyle}>xadvance</code> per{' '}
          <code style={codeStyle}>&lt;char&gt;</code> for BMFont compatibility.
        </li>
        <li>
          <strong>+Advance X</strong> — Per-glyph advance added on top of Global advance X; exported <code style={codeStyle}>xadvance</code> is the sum (horizontal stride after the glyph).
        </li>
      </ul>
      <p style={p}>
        <strong>Adding glyphs:</strong> type a code point in the <strong>Add glyph</strong> field above the table — decimal (65), hex (U+41 / 0x41), or a single character (A) — then press Enter or click <strong>Add glyph</strong>. A new row is appended with zeroed atlas rect and metrics; set the atlas X/Y/Width/Height in the table or by dragging on the texture. The exported{' '}
        <code style={codeStyle}>&lt;chars count=&quot;…&quot;&gt;</code> updates automatically.
      </p>
      <p style={p}>
        <strong>Removing glyphs:</strong> click <strong>✕</strong> on any row to remove a single glyph, or select multiple rows and click <strong>Remove selected</strong>. A confirmation dialog lists what will be removed; related kerning pairs are dropped with the glyph.
      </p>

      <h2 style={h2}>Kerning</h2>
      <p style={p}>
        Pairs <code style={codeStyle}>(first, second)</code> add extra horizontal spacing (can be negative) when <code style={codeStyle}>second</code> follows{' '}
        <code style={codeStyle}>first</code> immediately. Edit <strong>first</strong>, <strong>second</strong>, and <strong>amount</strong> in the table.
      </p>

      <h2 style={h2}>Preview text &amp; Pixi panel</h2>
      <p style={p}>
        <strong>Preview text</strong> drives the string in the <strong>Live preview</strong> (multi-line supported). Change it to stress-test punctuation,
        numbers, currency symbols, or languages you ship. The preview uses your live XML and atlas; when you edit the character table or kernings, the
        canvas updates on the next sync. When preview text is non-empty, the section lists <strong>Missing</strong> code points (not in the font) and{' '}
        <strong>Zero-size</strong> glyphs (present but with a zero-width or zero-height atlas rectangle), each with a readable label. Use{' '}
        <strong>Filter first missing in character table</strong> or <strong>Add first missing glyph</strong> to jump to or create the first missing character.
      </p>
      <p style={p}>
        <strong>Compare to loaded</strong> (under Preview guides) shows a second Pixi panel with the font metrics from the last import or generator run next to
        your current edits, using the same preview text and uploaded atlas. If the loaded snapshot expected a different atlas pixel size than your PNG, that
        panel shows a short message instead of rendering.
      </p>
      <p style={p}>
        <strong>Compare with another open font</strong> appears when you have at least two entries in <strong>Open fonts</strong>. It is mutually exclusive
        with <strong>Compare to loaded</strong>: the side panel renders another slot&apos;s font using the <strong>last stored snapshot</strong> for that slot
        (updated when you switch away from it or when auto-save runs), not live edits while that font sits in the background. Pick which open font to compare in
        the companion dropdown.
      </p>

      <h2 style={h2}>Semantic diff</h2>
      <p style={p}>
        When <strong>Compare to loaded</strong> or <strong>Compare with another open font</strong> is on, a <strong>Semantic diff</strong> section appears below
        Preview guides. It compares <strong>current edits</strong> to a <strong>reference</strong>—usually the loaded baseline (last import or generator), or
        another open font&apos;s stored snapshot when that compare mode is selected (not live background edits). <strong>Compare to loaded</strong> only adds the
        extra Pixi column; it does not change this reference. The diff covers glyph metrics (
        <code style={codeStyle}>xoffset</code>, <code style={codeStyle}>yoffset</code>, <code style={codeStyle}>xadvance</code>,{' '}
        <code style={codeStyle}>width</code>, <code style={codeStyle}>height</code>) and kerning rows added, removed, or with changed amounts—<em>not</em> atlas X/Y
        moves. Expand <strong>Show detail lists</strong> for per-glyph and per-pair changes (values are <strong>reference → current</strong>). <strong>Jump</strong>{' '}
        focuses the matching row in the character or kerning table.
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
        If the XML declares more than one <code style={codeStyle}>&lt;page&gt;</code>, upload one atlas image per page (filenames should match each{' '}
        <strong>page file</strong> in the descriptor—you can multi-select images together with the font XML). Use the <strong>page tabs</strong> above the texture
        view to switch atlases and edit glyphs on each page. The Live preview uses whatever page images are loaded in this session; keep{' '}
        <code style={codeStyle}>scaleW</code> / <code style={codeStyle}>scaleH</code> aligned with each atlas you upload.
      </p>

      <h2 style={h2}>Dark UI &amp; preferences</h2>
      <p style={{ ...p, marginBottom: 0 }}>
        The <strong>Dark UI</strong> toggle is stored in <code style={codeStyle}>localStorage</code> under{' '}
        <code style={codeStyle}>pixi-bitmap-font-toolkit-dark-ui</code> (<code style={codeStyle}>1</code> / <code style={codeStyle}>0</code>).{' '}
        <strong>Show atlas X/Y, width &amp; height</strong> (under Glyphs) is stored under{' '}
        <code style={codeStyle}>pixi-bitmap-font-toolkit-show-atlas-rect-cols</code> the same way.
      </p>
    </section>
  )
}
