# Web Timer + Translate + Notes / 网页计时 · 翻译 · 笔记 · 生词本

Cross-browser extension (Chrome / Edge / Firefox MV3) with:

- **Timer** — red **Timer / 计时** FAB; countdown badge top-right; flashes at **3 / 2 / 1 minutes**; on expire: **bell chime** + full-page overlay **时间到！ / Time's up!** (close button only); tab stays open by default
- **Translate** — select text, highlight (multi-color, per-page persistence), translate (free MyMemory with detected source language, LibreTranslate, or Google/DeepL)
- **Vocabulary & Sentences (生词本 / 生句本)** — save words/sentences with label, remark, bilingual text, and source page URL
- **Notes** — **Note / 笔记** FAB opens a **right-side panel** (below the timer badge, non-modal); drag title to move; drag **edges/corners** to resize; **↺** or double-click title to reset layout; page stays selectable for copy/paste
- **In-page panel** — click the extension icon to open a **Shadow DOM** panel fixed at the **top-right** (immune to site CSS on `.tab`, `.panel`, etc.)
- **Bilingual buttons** — all action buttons show 中文 / English together

## Install / 安装

### Chrome / Edge

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`网页计时插件`)
4. After code updates, click **Reload** on the extension card

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → choose `manifest.json` in this folder

## Open the extension / 打开扩展

Click the extension icon in the browser toolbar. A panel appears at the **top-right of the webpage** (not a separate popup window).

- **最小化 / Minimize** — collapses to a small strip; click again to expand
- Tabs: Timer, Notes, 生词本 (Vocab), 生句本 (Sentences), Settings

## Timer / 计时

| Item | Behavior |
|------|----------|
| **Timer FAB** | Red button above the blue Note FAB (bottom-right) |
| **Timer dialog** | Set hours/minutes/seconds → Start; close dialog — timer keeps running in background |
| **Badge** | Large countdown at **top-right** (`#wtp-timer-badge`) while running or paused |
| **3 / 2 / 1 min** | Badge **pulses** briefly when crossing those minute marks |
| **Time up** | Bell sound; optional browser notification; **page is not closed** unless you enable it in Options |
| **Side panel** | Timer tab shares the same timer state as FAB + badge |

Options → **Close tab when timer ends** (default off).

## Highlight & translate / 高亮与翻译

1. **Select** word or sentence on any normal webpage (https://…)
2. A dark **fixed** toolbar appears near the selection (above the side panel z-index)
3. Use **高亮 / Highlight** label + **color dots** to apply highlight (persists per URL)
4. **取消此句高光 / Remove highlight** — removes highlight on current selection only
5. Another color dot → replaces highlight color on selection
6. **清除全部高亮 / Clear all highlights** — removes all highlights on **this page only**
7. **翻译设置 / Translation settings** — source & target language dropdowns always visible on toolbar; then **翻译 / Translate**

Extension does not run on `chrome://` or `edge://` pages.

## Local & offline files / 本地与离线文件

| Phase | What | How |
|-------|------|-----|
| **A — file:// HTML** | Highlights, mind map draft on disk HTML | Extension settings → enable **Allow access to file URLs** → open `.html` in browser → reload page |
| **B — Reader** | PDF, HTML, TXT in extension tab | Popup **打开本地文件** / command **open-local-viewer** → drop or pick file |
| **C — Word** | `.docx` in same reader | Converted to HTML via Mammoth (layout simplified) |
| **D — Recent** | Reopen cached files | Sidebar **最近打开** (IndexedDB, max **8** files × **20 MB** each) |

- **Not supported:** desktop Word, Acrobat, or other native apps (extension cannot inject into them).
- **pageKey:** `http(s)` → origin+path+query; `file://` → full URL; reader → `ext-viewer:{hash}`.
- **Third-party:** PDF.js (Apache-2.0), Mammoth (BSD-2-Clause) — see `libs/LICENSE-THIRD-PARTY.md`.

## Translation / 翻译

### Free (default) / 免费（默认）

1. Side panel → Settings tab, or **Options** (right-click extension → Options)
2. Provider: **Free (MyMemory)** — no API key; source language auto-detected or set manually
3. Or **LibreTranslate** — set server URL (e.g. `https://libretranslate.com`)

### Paid APIs / 付费 API

- **Google**: [Cloud Translation API](https://cloud.google.com/translate/docs/setup)
- **DeepL**: [DeepL API plan](https://www.deepl.com/pro-api)

## 生词本 & 生句本

1. Select text → toolbar → save to vocab or sentences
2. View lists: toolbar **已保存生词 / 生句 / 笔记 / 思维导图** opens **draggable, resizable floating windows**. **网站备注 / Site remarks** opens the per-page **radial tree** mind map (draft per URL). **已保存思维导图** opens named snapshots. Extension icon → side panel is a secondary view
3. Each list entry can be opened for full detail; sort by time, label, text, or domain (persisted)

## Usage / 使用

| Feature | How |
|--------|-----|
| Open panel | Click extension icon → top-right panel |
| Minimize | **最小化 / Minimize** in panel header |
| Timer (quick) | Red **Timer / 计时** FAB → set time → Start |
| Timer (panel) | Panel → Timer tab → Start |
| Translate | Select text → toolbar → set **翻译设置** languages → **翻译 / Translate** |
| Highlight | Select text → color dot; **Remove highlight** for one sentence |
| Vocab / Sentences | Select text → toolbar → Add to Vocab / Sentences |
| View saved lists | Toolbar **已保存生词/生句/笔记** → floating list windows |
| Site remarks | Toolbar **网站备注** → tree mind map (draft per page URL) |
| Saved mind maps | Toolbar **已保存思维导图** → open/update snapshots |
| Extension shortcuts | Browser → **Manage extension shortcuts**: `open-mind-map`, `open-saved-mindmaps`, `open-local-viewer` |
| Local file reader | Popup **打开本地文件** or shortcut **open-local-viewer** |
| Notes | Blue **Note / 笔记** FAB → right panel (resizable); or floating/side panel lists |

## Files

- `background/service-worker.js` — icon click, alarms, translate proxy, optional tab close on expire
- `content/content.js` — selection toolbar, note FAB
- `content/highlight-persist.js` — per-page highlights, restore, colors
- `content/timer-ui.js` — timer FAB, dialog, top-right badge
- `content/side-panel.js` — Shadow DOM in-page panel
- `shared/page-key.js` — unified pageKey for highlights, drafts, viewer
- `shared/viewer-storage.js` — IndexedDB cache for recent local files
- `viewer/reader.html` — local PDF / DOCX / HTML / TXT reader
- `libs/pdfjs/`, `libs/mammoth/` — third-party renderers (see `libs/LICENSE-THIRD-PARTY.md`)
- `content/mind-map-tree.js` — radial tree mind map (auto layout, branch curves)
- `content/floating-panels.js` — floating vocab/sentence/note lists + mind map save bridge
- `shared/floating-shell.js` — draggable/resizable panel chrome
- `shared/list-render.js` — shared sort/filter/list row helpers
- `shared/panel-app.js` — shared timer/notes/vocab UI logic
- `shared/translate.js` — MyMemory (no `auto` langpair), LibreTranslate, Google, DeepL
- `assets/bell.wav` — alert chime (regenerate: `node scripts/gen-bell.js`)

## Troubleshooting / 排错

- **Local reader — no selection toolbar / CSP** — Open `extension://…/viewer/reader.html`, select text; a dark `#wtp-toolbar` should appear (not the browser’s small icon menu). If Console shows **CSP inline script** errors, reload the extension (reader uses `viewer/reader-init.js`, not inline scripts). If selection works but no toolbar, check Console for errors; ensure text is inside `#wtp-reader-document`. / **本地阅读器无划词条或 CSP 报错**：重载扩展；划词后应出现深色工具栏；勿与浏览器自带选区菜单混淆。
- **Mind map (tree)** — **网站备注** opens a **center-out tree**; **已保存思维导图** lists snapshots (`wtpSavedMindMaps`). Toolbar: branch left/right, subtopic, leaf, **Save** / **Save as** (when editing a snapshot). **Clear** resets branches (keeps center). Pan: drag empty canvas; zoom: wheel. Draft auto-saves per page URL (`wtpSiteMindMaps`); explicit save creates/updates snapshots. **Panel shortcuts** (click the map panel first so it has focus): Ctrl+S save, Ctrl+Shift+S save as, Ctrl+Alt+←/→ branches, Ctrl+Enter subtopic, Ctrl+Shift+L leaf, Delete node, Esc deselect — see Options page. **Browser shortcuts**: assign `open-mind-map` and `open-saved-mindmaps` under extension shortcut settings. Reload the extension and hard-refresh after updates.
- **`mdb.min.js` … `Utilities`** — comes from the **host website** (MDB), not this extension; safe to ignore unless the site itself breaks.

## Verify install

```bash
node scripts/verify-extension.js
```

No `npm install` required — this project has no `package.json`.

## Privacy

Translation requests go to the provider you choose. Notes, vocab, sentences, highlights, and settings stay in the browser (`chrome.storage` / `browser.storage`).
