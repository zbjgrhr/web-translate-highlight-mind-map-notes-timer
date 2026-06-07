const WTP_SETTINGS_KEY = 'wtpSettings';
const WTP_TIMER_KEY = 'wtpTimer';
const WTP_NOTES_KEY = 'wtpNotes';
const WTP_VOCAB_KEY = 'wtpVocab';
const WTP_SENTENCES_KEY = 'wtpSentences';

const WTP_HIGHLIGHTS_KEY = 'wtpPageHighlights';
const WTP_SITE_MINDMAPS_KEY = 'wtpSiteMindMaps';
const WTP_SAVED_MINDMAPS_KEY = 'wtpSavedMindMaps';

const WTP_DEFAULT_SETTINGS = {
  uiLocale: 'zh',
  targetLang: 'en',
  sourceLang: 'auto',
  provider: 'free',
  apiKey: '',
  deeplPro: false,
  libreUrl: 'https://libretranslate.com',
  closeTabOnExpire: false
};

async function wtpGetSettings() {
  const data = await browser.storage.sync.get(WTP_SETTINGS_KEY);
  return { ...WTP_DEFAULT_SETTINGS, ...(data[WTP_SETTINGS_KEY] || {}) };
}

async function wtpSaveSettings(partial) {
  const current = await wtpGetSettings();
  const next = { ...current, ...partial };
  await browser.storage.sync.set({ [WTP_SETTINGS_KEY]: next });
  return next;
}

async function wtpGetTimer() {
  const data = await browser.storage.local.get(WTP_TIMER_KEY);
  return data[WTP_TIMER_KEY] || null;
}

async function wtpSaveTimer(state) {
  if (state) {
    await browser.storage.local.set({ [WTP_TIMER_KEY]: state });
  } else {
    await browser.storage.local.remove(WTP_TIMER_KEY);
  }
}

async function wtpClearTimer() {
  await browser.alarms.clear('timer-expire');
  await wtpSaveTimer(null);
}

async function wtpGetNotes() {
  const data = await browser.storage.local.get(WTP_NOTES_KEY);
  return data[WTP_NOTES_KEY] || [];
}

async function wtpSaveNotes(notes) {
  await browser.storage.local.set({ [WTP_NOTES_KEY]: notes });
}

async function wtpAddNote(note) {
  const notes = await wtpGetNotes();
  notes.unshift(note);
  await wtpSaveNotes(notes);
  return notes;
}

async function wtpDeleteNote(id) {
  const notes = (await wtpGetNotes()).filter((n) => n.id !== id);
  await wtpSaveNotes(notes);
  return notes;
}

async function wtpUpdateNote(id, partial) {
  const notes = await wtpGetNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) return notes;
  notes[idx] = { ...notes[idx], ...partial, updatedAt: new Date().toISOString() };
  await wtpSaveNotes(notes);
  return notes;
}

async function wtpGetSiteMindMap(pageKey) {
  const data = await browser.storage.local.get(WTP_SITE_MINDMAPS_KEY);
  const all = data[WTP_SITE_MINDMAPS_KEY] || {};
  const map = all[pageKey];
  if (!map) {
    return { rootId: null, nodes: [], viewport: { panX: 0, panY: 0, zoom: 1 } };
  }
  return {
    rootId: map.rootId || null,
    nodes: map.nodes || [],
    viewport: map.viewport || { panX: 0, panY: 0, zoom: 1 }
  };
}

async function wtpSaveSiteMindMap(pageKey, mapData) {
  const data = await browser.storage.local.get(WTP_SITE_MINDMAPS_KEY);
  const all = data[WTP_SITE_MINDMAPS_KEY] || {};
  all[pageKey] = { ...mapData, draftUpdatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [WTP_SITE_MINDMAPS_KEY]: all });
  return all[pageKey];
}

async function wtpGetSavedMindMaps() {
  await wtpMigrateLegacyMindMapsToSnapshots();
  const data = await browser.storage.local.get(WTP_SAVED_MINDMAPS_KEY);
  const list = data[WTP_SAVED_MINDMAPS_KEY] || [];
  return list
    .map((item) => {
      const nodes = item?.mapData?.nodes || [];
      const root =
        nodes.find((n) => n.id === item?.mapData?.rootId) ||
        nodes.find((n) => n.parentId == null);
      return {
        id: item.id,
        label: item.label || '',
        pageKey: item.pageKey || '',
        url: item.url || item.pageKey || '',
        title: item.title || '',
        rootText: (root?.text || '').trim(),
        nodeCount: nodes.length,
        mapData: item.mapData,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    })
    .filter((item) => item.nodeCount > 0)
    .sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return tb - ta;
    });
}

async function wtpGetSavedMindMap(id) {
  await wtpMigrateLegacyMindMapsToSnapshots();
  const list = await wtpGetSavedMindMapsRaw();
  return list.find((s) => s.id === id) || null;
}

async function wtpGetSavedMindMapsRaw() {
  const data = await browser.storage.local.get(WTP_SAVED_MINDMAPS_KEY);
  return data[WTP_SAVED_MINDMAPS_KEY] || [];
}

async function wtpAddSavedMindMap(entry) {
  await wtpMigrateLegacyMindMapsToSnapshots();
  const list = await wtpGetSavedMindMapsRaw();
  const now = new Date().toISOString();
  const item = {
    id: wtpUuid(),
    label: (entry.label || '').trim(),
    pageKey: entry.pageKey || '',
    url: entry.url || entry.pageKey || '',
    title: entry.title || '',
    mapData: entry.mapData || {},
    createdAt: now,
    updatedAt: now
  };
  list.unshift(item);
  await browser.storage.local.set({ [WTP_SAVED_MINDMAPS_KEY]: list });
  return item;
}

async function wtpUpdateSavedMindMap(id, partial) {
  const list = await wtpGetSavedMindMapsRaw();
  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...partial, updatedAt: new Date().toISOString() };
  await browser.storage.local.set({ [WTP_SAVED_MINDMAPS_KEY]: list });
  return list[idx];
}

async function wtpDeleteSavedMindMap(id) {
  const list = (await wtpGetSavedMindMapsRaw()).filter((s) => s.id !== id);
  await browser.storage.local.set({ [WTP_SAVED_MINDMAPS_KEY]: list });
  return list;
}

async function wtpMigrateLegacyMindMapsToSnapshots() {
  const data = await browser.storage.local.get([
    WTP_SITE_MINDMAPS_KEY,
    WTP_SAVED_MINDMAPS_KEY,
    'wtpMindMapsMigrated'
  ]);
  if (data.wtpMindMapsMigrated) return;
  let saved = data[WTP_SAVED_MINDMAPS_KEY] || [];
  const all = data[WTP_SITE_MINDMAPS_KEY] || {};
  const existingKeys = new Set(saved.map((s) => `${s.pageKey}:${s.label}`));
  Object.entries(all).forEach(([pageKey, map]) => {
    const nodes = map?.nodes || [];
    if (nodes.length <= 1) return;
    const root = nodes.find((n) => n.id === map?.rootId) || nodes.find((n) => !n.parentId);
    const label = (root?.text || '').trim() || pageKey.slice(0, 48);
    const key = `${pageKey}:${label}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    const now = map.updatedAt || map.draftUpdatedAt || new Date().toISOString();
    saved.unshift({
      id: wtpUuid(),
      label,
      pageKey,
      url: pageKey,
      title: '',
      mapData: {
        rootId: map.rootId,
        nodes: map.nodes,
        viewport: map.viewport || { panX: 0, panY: 0, zoom: 1 }
      },
      createdAt: now,
      updatedAt: now
    });
  });
  await browser.storage.local.set({
    [WTP_SAVED_MINDMAPS_KEY]: saved,
    wtpMindMapsMigrated: true
  });
}

async function wtpGetVocab() {
  const data = await browser.storage.local.get(WTP_VOCAB_KEY);
  return data[WTP_VOCAB_KEY] || [];
}

async function wtpSaveVocab(items) {
  await browser.storage.local.set({ [WTP_VOCAB_KEY]: items });
}

async function wtpAddVocab(entry) {
  const items = await wtpGetVocab();
  items.unshift(entry);
  await wtpSaveVocab(items);
  return items;
}

async function wtpDeleteVocab(id) {
  const items = (await wtpGetVocab()).filter((n) => n.id !== id);
  await wtpSaveVocab(items);
  return items;
}

async function wtpUpdateVocab(id, partial) {
  const items = await wtpGetVocab();
  const idx = items.findIndex((n) => n.id === id);
  if (idx < 0) return items;
  items[idx] = { ...items[idx], ...partial, updatedAt: new Date().toISOString() };
  await wtpSaveVocab(items);
  return items;
}

async function wtpGetSentences() {
  const data = await browser.storage.local.get(WTP_SENTENCES_KEY);
  return data[WTP_SENTENCES_KEY] || [];
}

async function wtpSaveSentences(items) {
  await browser.storage.local.set({ [WTP_SENTENCES_KEY]: items });
}

async function wtpAddSentence(entry) {
  const items = await wtpGetSentences();
  items.unshift(entry);
  await wtpSaveSentences(items);
  return items;
}

async function wtpDeleteSentence(id) {
  const items = (await wtpGetSentences()).filter((n) => n.id !== id);
  await wtpSaveSentences(items);
  return items;
}

async function wtpUpdateSentence(id, partial) {
  const items = await wtpGetSentences();
  const idx = items.findIndex((n) => n.id === id);
  if (idx < 0) return items;
  items[idx] = { ...items[idx], ...partial, updatedAt: new Date().toISOString() };
  await wtpSaveSentences(items);
  return items;
}

function wtpUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wtp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function wtpGetPageHighlights(pageUrl) {
  const data = await browser.storage.local.get(WTP_HIGHLIGHTS_KEY);
  const all = data[WTP_HIGHLIGHTS_KEY] || {};
  return all[pageUrl] || [];
}

async function wtpSavePageHighlights(pageUrl, items) {
  const data = await browser.storage.local.get(WTP_HIGHLIGHTS_KEY);
  const all = data[WTP_HIGHLIGHTS_KEY] || {};
  if (items?.length) {
    all[pageUrl] = items;
  } else {
    delete all[pageUrl];
  }
  await browser.storage.local.set({ [WTP_HIGHLIGHTS_KEY]: all });
}

function wtpMakeStudyEntry(message) {
  return {
    id: wtpUuid(),
    original: (message.original || '').trim(),
    translation: (message.translation || '').trim(),
    label: (message.label || '').trim() || 'default',
    remark: (message.remark || '').trim(),
    url: message.url || '',
    title: message.title || '',
    createdAt: new Date().toISOString()
  };
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    WTP_SETTINGS_KEY,
    WTP_TIMER_KEY,
    WTP_NOTES_KEY,
    WTP_VOCAB_KEY,
    WTP_SENTENCES_KEY,
    WTP_HIGHLIGHTS_KEY,
    WTP_SITE_MINDMAPS_KEY,
    WTP_SAVED_MINDMAPS_KEY,
    WTP_DEFAULT_SETTINGS,
    wtpGetSettings,
    wtpSaveSettings,
    wtpGetTimer,
    wtpSaveTimer,
    wtpClearTimer,
    wtpGetNotes,
    wtpSaveNotes,
    wtpAddNote,
    wtpDeleteNote,
    wtpUpdateNote,
    wtpGetSiteMindMap,
    wtpSaveSiteMindMap,
    wtpGetSavedMindMaps,
    wtpGetSavedMindMap,
    wtpAddSavedMindMap,
    wtpUpdateSavedMindMap,
    wtpDeleteSavedMindMap,
    wtpGetVocab,
    wtpSaveVocab,
    wtpAddVocab,
    wtpDeleteVocab,
    wtpUpdateVocab,
    wtpGetSentences,
    wtpSaveSentences,
    wtpAddSentence,
    wtpDeleteSentence,
    wtpUpdateSentence,
    wtpMakeStudyEntry,
    wtpGetPageHighlights,
    wtpSavePageHighlights,
    wtpUuid
  });
}
