const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
  'manifest.json',
  'libs/browser-polyfill.min.js',
  'background/service-worker.js',
  'popup/popup.html',
  'popup/popup.js',
  'options/options.html',
  'options/options.js',
  'content/content.js',
  'content/content.css',
  'content/side-panel.js',
  'content/side-panel.css',
  'content/highlight-persist.js',
  'content/timer-ui.js',
  'content/mind-map-tree.js',
  'content/floating-panels.js',
  'content/floating-panels.css',
  'shared/floating-shell.js',
  'shared/list-render.js',
  'shared/storage.js',
  'shared/translate.js',
  'shared/i18n-ui.js',
  'shared/page-key.js',
  'shared/viewer-storage.js',
  'shared/panel-app.js',
  'viewer/reader.html',
  'viewer/reader-init.js',
  'viewer/reader-boot.js',
  'viewer/reader-module.js',
  'viewer/reader.css',
  'libs/pdfjs/pdf.min.mjs',
  'libs/pdfjs/pdf.worker.min.mjs',
  'libs/mammoth/mammoth.browser.min.js',
  'libs/LICENSE-THIRD-PARTY.md',
  'assets/bell.wav',
  '_locales/en/messages.json',
  '_locales/zh_CN/messages.json'
];

let failed = 0;
for (const f of required) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) {
    console.error('MISSING:', f);
    failed++;
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) {
  console.error('Expected manifest_version 3');
  failed++;
}
if (manifest.action?.default_popup) {
  console.error('manifest should not have default_popup (use in-page side panel)');
  failed++;
}
if (!manifest.browser_specific_settings?.gecko?.id) {
  console.error('Missing Firefox gecko id');
  failed++;
}

const contentJs = fs.readFileSync(path.join(root, 'content/content.js'), 'utf8');
const hlJs = fs.readFileSync(path.join(root, 'content/highlight-persist.js'), 'utf8');
const timerJs = fs.readFileSync(path.join(root, 'content/timer-ui.js'), 'utf8');
const swJs = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const i18nJs = fs.readFileSync(path.join(root, 'shared/i18n-ui.js'), 'utf8');
const sidePanelJs = fs.readFileSync(path.join(root, 'content/side-panel.js'), 'utf8');
const translateJs = fs.readFileSync(path.join(root, 'shared/translate.js'), 'utf8');
const contentCss = fs.readFileSync(path.join(root, 'content/content.css'), 'utf8');
const panelAppJs = fs.readFileSync(path.join(root, 'shared/panel-app.js'), 'utf8');
const floatJs = fs.readFileSync(path.join(root, 'content/floating-panels.js'), 'utf8');
const treeJs = fs.readFileSync(path.join(root, 'content/mind-map-tree.js'), 'utf8');
const floatShellJs = fs.readFileSync(path.join(root, 'shared/floating-shell.js'), 'utf8');
const listRenderJs = fs.readFileSync(path.join(root, 'shared/list-render.js'), 'utf8');
const floatCss = fs.readFileSync(path.join(root, 'content/floating-panels.css'), 'utf8');
const readerCss = fs.readFileSync(path.join(root, 'viewer/reader.css'), 'utf8');
const storageJs = fs.readFileSync(path.join(root, 'shared/storage.js'), 'utf8');
const pageKeyJs = fs.readFileSync(path.join(root, 'shared/page-key.js'), 'utf8');
const viewerStorageJs = fs.readFileSync(path.join(root, 'shared/viewer-storage.js'), 'utf8');
const readerHtml = fs.readFileSync(path.join(root, 'viewer/reader.html'), 'utf8');
const readerBootJs = fs.readFileSync(path.join(root, 'viewer/reader-boot.js'), 'utf8');
const readerModuleJs = fs.readFileSync(path.join(root, 'viewer/reader-module.js'), 'utf8');
const optionsHtml = fs.readFileSync(path.join(root, 'options/options.html'), 'utf8');

const checks = [
  ['content', /getActiveRange/, contentJs],
  ['content', /wtpHighlight/, contentJs],
  ['content', /wtp-toast/, contentJs],
  ['content', /wtp-color-row/, contentJs],
  ['content', /wtp-note-panel/, contentJs],
  ['content', /wtp-note-resize-top/, contentJs],
  ['content', /bindCaptureDrag/, contentJs],
  ['content', /translateSettings|wtp-toolbar-lang-row/, contentJs],
  ['content', /clearAllHighlights/, contentJs],
  ['content', /savedVocab|savedMindMaps|wtp-toolbar-saved-row/, contentJs],
  ['content', /openSavedFloatingPanel|wtpOpenSavedFloatingPanel/, contentJs],
  ['content', /siteRemarks|openSiteRemarksPanel/, contentJs],
  ['content', /wtp-toolbar-lang-header/, contentJs],
  ['content', /wtpNotePanelWidth/, contentJs],
  ['content', /wtpNotePanelTop/, contentJs],
  ['content', /applyHighlightColorFromToolbar/, contentJs],
  ['content', /removeSentenceHighlightFromToolbar/, contentJs],
  ['content', /wtp-color-row-label/, contentJs],
  ['content', /isToolbarFormControl/, contentJs],
  ['content', /bindToolbarFormFocus/, contentJs],
  ['highlight', /getTextNodesInRange/, hlJs],
  ['highlight', /hasHighlightMarks/, hlJs],
  ['i18n', /highlightSuccess/, i18nJs],
  ['highlight', /wtpPageKey|wtpPageKey\(\)/, hlJs],
  ['floating', /wtpPageKey/, floatJs],
  ['page-key', /wtpPageKey|wtpExtViewerPageKey|ext-viewer:/, pageKeyJs],
  ['viewer-storage', /wtpViewerSaveFile|wtpViewerRecent/, viewerStorageJs],
  ['viewer-html', /reader-init\.js|reader-module\.js/, readerHtml],
  ['viewer-init', /wtpViewerMode\s*=\s*true/, fs.readFileSync(path.join(root, 'viewer/reader-init.js'), 'utf8')],
  ['content-toolbar-rect', /getSelectionClientRect|bindViewerSelectionHooks/, contentJs],
  ['css-viewer-select', /user-select:\s*text/, readerCss],
  ['viewer-boot', /wtpViewerOpenById|wtpViewerEngine/, readerBootJs],
  ['viewer-module', /pdf\.min\.mjs|renderPdfToContainer/, readerModuleJs],
  ['highlight', /wtpPageHighlights/, hlJs],
  ['highlight', /wrapTextNodesInRange|getTextNodesInRange/, hlJs],
  ['highlight', /removeHighlightsInRange/, hlJs],
  ['timer-ui', /wtp-timer-fab/, timerJs],
  ['timer-ui', /wtp-timer-badge/, timerJs],
  ['timer-ui', /wtp-timer-expired-overlay/, timerJs],
  ['side-panel', /TOGGLE_SIDE_PANEL/, sidePanelJs],
  ['side-panel', /OPEN_SIDE_PANEL_TAB/, sidePanelJs],
  ['side-panel', /wtpOpenSidePanelTab/, sidePanelJs],
  ['side-panel', /attachShadow/, sidePanelJs],
  ['side-panel', /wtp-side-panel-host/, sidePanelJs],
  ['service-worker', /action\.onClicked/, swJs],
  ['service-worker', /OPEN_SIDE_PANEL_TAB/, swJs],
  ['service-worker', /closeTabOnExpire/, swJs],
  ['translate', /wtpDetectSourceLang/, translateJs],
  ['translate', /wtpResolveTranslateLangs/, translateJs],
  ['translate', /langpair/, translateJs],
  ['i18n', /timerFab/, i18nJs],
  ['i18n', /removeHighlight/, i18nJs],
  ['panel-app', /wtpInitPanelApp/, panelAppJs],
  ['panel-app', /switchToTab/, panelAppJs],
  ['panel-app', /wtpTimerUi/, panelAppJs],
  ['css', /#wtp-toolbar[\s\S]*position:\s*fixed/, contentCss],
  ['css', /wtp-highlight-yellow/, contentCss],
  ['css', /#wtp-note-panel/, contentCss],
  ['css', /wtp-note-resize-top/, contentCss],
  ['css', /wtp-note-resize-left/, contentCss],
  ['css', /#wtp-timer-expired-overlay/, contentCss],
  ['i18n', /removeSentenceHighlight/, i18nJs],
  ['i18n', /timerExpiredTitle/, i18nJs],
  ['i18n', /translateSettings/, i18nJs],
  ['i18n', /clearAllHighlights/, i18nJs],
  ['i18n', /savedVocab/, i18nJs],
  ['css', /wtp-toolbar-saved-row/, contentCss],
  ['floating', /wtpOpenSavedFloatingPanel/, floatJs],
  ['floating', /wtp-float-vocab|wtp-float-mindmaps|createMindMapListPanel/, floatJs],
  ['floating', /wtpCreateTreeMindMapPanel/, floatJs],
  ['floating', /rootId:\s*mindMapState\.rootId/, floatJs],
  ['mind-tree', /wtp-mind-canvas/, treeJs],
  ['mind-tree', /layoutTree|renderLinks|migrateMapData/, treeJs],
  ['mind-tree', /wtp-mind-tree-node|wtp-mind-tree-link/, treeJs],
  ['mind-tree', /data-action="branch-left"/, treeJs],
  ['mind-tree', /wtpCreateTreeMindMapPanel/, treeJs],
  ['mind-tree', /ensureMindMapState/, treeJs],
  ['mind-tree', /setMindToolbarDisabled\(false\)/, treeJs],
  ['mind-tree', /loadGeneration|mindMapDirty/, treeJs],
  ['mind-tree', /wtp-mind-world/, treeJs],
  ['mind-tree', /wtp-mind-nodes-layer/, treeJs],
  ['mind-tree', /fillColor|branchColor/, treeJs],
  ['mind-tree', /showContextMenu|showCanvasContextMenu|mindMapClearAll/, treeJs],
  ['mind-tree', /blockPanOnEl|maxWidthRatio|saveSnapshotNew|saveSnapshotUpdate|syncSaveToolbar/, treeJs],
  ['mind-tree', /updateNodeSelection|applySnapshot/, treeJs],
  ['floating', /wtpLoadMindMapSnapshot|activeSnapshotId/, floatJs],
  ['content', /btnRemarks,\s*savedRow/, contentJs],
  ['content', /wtpIsExtensionUi|isMindMapPanelOpen|wtpMarkToolbarInteraction/, contentJs],
  ['content', /wtp-float-remarks|WTP_EXTENSION_UI/, contentJs],
  ['content-viewer-ui', /\.wtp-viewer-header/, contentJs],
  ['mind-tree', /wtpSkipDraftLoadOnce/, treeJs],
  ['floating', /wtpSkipDraftLoadOnce/, floatJs],
  ['floating-shell', /maxWidthRatio|maxHeightRatio/, floatShellJs],
  ['floating-shell', /wtpCreateFloatingPanel/, floatShellJs],
  ['list-render', /wtpSortStudyItems/, listRenderJs],
  ['list-render', /wtpGetListSort/, listRenderJs],
  ['storage', /wtpSiteMindMaps|WTP_SITE_MINDMAPS_KEY/, storageJs],
  ['storage', /wtpGetSiteMindMap/, storageJs],
  ['storage', /rootId:\s*map\.rootId/, storageJs],
  ['storage', /wtpGetSavedMindMaps|wtpDeleteSavedMindMap|WTP_SAVED_MINDMAPS_KEY/, storageJs],
  ['service-worker', /GET_SITE_MINDMAP/, swJs],
  ['service-worker', /GET_SAVED_MINDMAPS|SAVE_SAVED_MINDMAP|UPDATE_SAVED_MINDMAP/, swJs],
  ['service-worker', /GET_ALL_SITE_MINDMAPS|DELETE_SAVED_MINDMAP/, swJs],
  ['service-worker', /SAVE_SITE_MINDMAP/, swJs],
  ['service-worker', /UPDATE_NOTE/, swJs],
  ['service-worker', /OPEN_FLOATING_PANEL/, swJs],
  ['service-worker-cmd', /browser\.commands\.onCommand/, swJs],
  ['manifest-cmd', /open-mind-map|open-saved-mindmaps/, JSON.stringify(manifest)],
  ['options-shortcuts', /optionsShortcutsTitle|optionsShortcutsMindMap/, optionsHtml],
  ['options-file', /optionsFileAccessTitle|fileAccessHint/, optionsHtml],
  ['i18n-viewer', /viewerTitle|openLocalFile|fileAccessHint/, i18nJs],
  ['content-file-hint', /fileAccessHint|wtpFileHintShown/, contentJs],
  ['sw-viewer', /OPEN_VIEWER|wtpOpenViewerTab/, swJs],
  ['manifest-viewer', /viewer\/reader\.html|open-local-viewer/, JSON.stringify(manifest)],
  ['manifest-page-key', /shared\/page-key\.js/, JSON.stringify(manifest)],
  ['i18n-shortcuts', /optionsShortcutsMindMap/, i18nJs],
  ['css-mind-hidden', /wtp-mind-toolbar button\.hidden/, floatCss],
  ['mind-tree-focus', /shell\.panel\.focus\(\{ preventScroll: true \}\)/, treeJs],
  ['i18n', /siteRemarks/, i18nJs],
  ['i18n', /思维导图\/备注/, i18nJs],
  ['floating', /wtpMindUuid/, floatJs],
  ['floating', /dismissToolbar|wtpRemoveToolbar/, floatJs],
  ['content', /wtpRemoveToolbar/, contentJs],
  ['float-shell', /WTP_Z_FLOAT_PANEL/, floatShellJs],
  ['i18n', /mindMapFillColor/, i18nJs],
  ['i18n', /mindMapClearAll/, i18nJs],
  ['i18n', /mindMapTreeHint|mindMapAddBranchLeft/, i18nJs],
  ['i18n', /mindMapRootLabel|mindMapBranchColor/, i18nJs],
  ['i18n', /savedMindMaps|floatMindMapsTitle|mindMapSaveSnapshot/, i18nJs],
  ['css-float', /wtp-mind-toolbar[\s\S]*z-index:\s*10/, floatCss],
  ['css-float', /pointer-events:\s*none/, floatCss],
  ['css-float', /wtp-mind-tree-node/, floatCss],
  ['css-float', /wtp-mind-tree-link/, floatCss],
  ['css-float', /overflow:\s*visible/, floatCss],
  ['css-float', /wtp-float-panel/, floatCss],
  ['panel-app', /wtpSortStudyItems/, panelAppJs]
];

if (/<script>window\.wtpViewerMode/.test(readerHtml)) {
  console.error('viewer/reader.html must not use inline wtpViewerMode (use reader-init.js)');
  failed++;
}
const uiSel = contentJs.match(/const WTP_EXTENSION_UI\s*=\s*'([^']+)'/);
if (uiSel && /#wtp-viewer-app|#wtp-reader-document|#wtp-viewer-main/.test(uiSel[1])) {
  console.error('WTP_EXTENSION_UI must not treat reader document/main/body as extension chrome');
  failed++;
}
if (/#wtp-note-overlay[\s\S]*inset:\s*0/i.test(contentCss)) {
  console.error('content.css must not use full-screen #wtp-note-overlay inset:0');
  failed++;
}
if (/wtp-note-overlay/.test(contentJs)) {
  console.error('content.js must not use wtp-note-overlay modal');
  failed++;
}
if (/id:\s*crypto\.randomUUID|push\(\{\s*id:\s*crypto\.randomUUID/.test(floatJs)) {
  console.error('floating-panels.js must use wtpMindUuid(), not crypto.randomUUID()');
  failed++;
}
if (!/typeof crypto\.randomUUID === 'function'/.test(storageJs)) {
  console.error('storage.js wtpUuid must fallback when randomUUID unavailable');
  failed++;
}

for (const [name, pattern, content] of checks) {
  if (!pattern.test(content)) {
    console.error(`CHECK FAILED (${name}):`, pattern);
    failed++;
  }
}

if (/langpair.*auto|auto\|/i.test(translateJs)) {
  console.error('translate.js must not use langpair with auto');
  failed++;
}

if (/tabs\.remove\s*\(/.test(swJs) && !/closeTabOnExpire/.test(swJs)) {
  console.error('service-worker must gate tabs.remove behind closeTabOnExpire');
  failed++;
}

const war = manifest.web_accessible_resources?.[0]?.resources || [];
if (!war.includes('content/side-panel.css')) {
  console.error('web_accessible_resources missing content/side-panel.css');
  failed++;
}

const csJs = manifest.content_scripts?.[0]?.js || [];
const requiredScripts = [
  'shared/page-key.js',
  'shared/list-render.js',
  'shared/floating-shell.js',
  'shared/panel-app.js',
  'content/highlight-persist.js',
  'content/timer-ui.js',
  'content/side-panel.js',
  'content/mind-map-tree.js',
  'content/floating-panels.js'
];
for (const s of requiredScripts) {
  if (!csJs.includes(s)) {
    console.error('content_scripts missing', s);
    failed++;
  }
}

console.log(failed ? `FAILED (${failed} issues)` : 'OK: all required files and feature checks passed');
process.exit(failed ? 1 : 0);
