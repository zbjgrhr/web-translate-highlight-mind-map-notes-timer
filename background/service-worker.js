importScripts(
  '../libs/browser-polyfill.min.js',
  '../shared/storage.js',
  '../shared/translate.js'
);

const BELL_URL = 'assets/bell.wav';
const VIEWER_PAGE = 'viewer/reader.html';

async function wtpOpenViewerTab(query = '') {
  const base = browser.runtime.getURL(VIEWER_PAGE);
  const url = query ? `${base}${query.startsWith('?') ? query : `?${query}`}` : base;
  await browser.tabs.create({ url });
}

browser.runtime.onInstalled.addListener(() => {
  try {
    browser.contextMenus.create({
      id: 'wtp-open-viewer',
      title: 'Open local file reader (Study Plugin)',
      contexts: ['page']
    });
  } catch {
    /* ignore duplicate */
  }
});

browser.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'wtp-open-viewer') {
    wtpOpenViewerTab();
  }
});

async function wtpGetActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function wtpPlayBell(tabId) {
  const bellUrl = browser.runtime.getURL(BELL_URL);
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: (url) => {
        const audio = new Audio(url);
        audio.volume = 1;
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      },
      args: [bellUrl]
    });
  } catch {
    try {
      await browser.notifications.create('wtp-timer-done', {
        type: 'basic',
        title: 'Timer',
        message: "Time's up!",
        requireInteraction: true
      });
    } catch {
      /* ignore */
    }
  }
}

async function wtpOnTimerExpire() {
  const timer = await wtpGetTimer();
  if (!timer || timer.status !== 'running') return;

  const tabId = timer.tabId;
  const settings = await wtpGetSettings();
  if (tabId) {
    try {
      await wtpPlayBell(tabId);
      await browser.tabs.sendMessage(tabId, { type: 'TIMER_EXPIRED' }).catch(() => {});
    } catch {
      /* tab may be gone */
    }
    if (settings.closeTabOnExpire) {
      await new Promise((r) => setTimeout(r, 2800));
      try {
        await browser.tabs.get(tabId);
        await browser.tabs.remove(tabId);
      } catch {
        /* already closed */
      }
    } else {
      try {
        await browser.notifications.create('wtp-timer-done', {
          type: 'basic',
          title: 'Timer',
          message: "Time's up!",
          requireInteraction: false
        });
      } catch {
        /* ignore */
      }
    }
  }

  await wtpClearTimer();
}

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timer-expire') {
    wtpOnTimerExpire();
  }
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  const timer = await wtpGetTimer();
  if (timer && timer.tabId === tabId) {
    await wtpClearTimer();
  }
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'open-local-viewer') {
    const data = await browser.storage.local.get('wtpViewerRecent');
    const recent = data.wtpViewerRecent || [];
    const id = recent[0]?.id;
    await wtpOpenViewerTab(id ? `?id=${encodeURIComponent(id)}` : '');
    return;
  }
  const tab = await wtpGetActiveTab();
  if (!tab?.id) return;
  let kind = null;
  if (command === 'open-mind-map') kind = 'remarks';
  else if (command === 'open-saved-mindmaps') kind = 'mindmaps';
  if (!kind) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'OPEN_FLOATING_PANEL', kind });
  } catch {
    /* content script not injected on this page */
  }
});

browser.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
  } catch {
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          'libs/browser-polyfill.min.js',
          'shared/i18n-ui.js',
          'shared/panel-app.js',
          'content/highlight-persist.js',
          'content/timer-ui.js',
          'content/side-panel.js',
          'content/content.js'
        ]
      });
      await browser.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDE_PANEL' });
    } catch {
      /* restricted page e.g. chrome:// */
    }
  }
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handle = async () => {
    switch (message.type) {
      case 'TIMER_START': {
        const tab = message.tabId
          ? await browser.tabs.get(message.tabId).catch(() => null)
          : await wtpGetActiveTab();
        if (!tab) throw new Error('No active tab');
        const totalMs = message.durationMs;
        if (!totalMs || totalMs < 1000) throw new Error('Duration too short');

        const endTime = Date.now() + totalMs;
        const state = {
          status: 'running',
          endTime,
          remainingMs: totalMs,
          tabId: tab.id,
          windowId: tab.windowId,
          startedAt: Date.now()
        };
        await wtpSaveTimer(state);
        await browser.alarms.clear('timer-expire');
        await browser.alarms.create('timer-expire', { when: endTime });
        return { ok: true, state };
      }
      case 'TIMER_PAUSE': {
        const timer = await wtpGetTimer();
        if (!timer || timer.status !== 'running') return { ok: false };
        const remainingMs = Math.max(0, timer.endTime - Date.now());
        await browser.alarms.clear('timer-expire');
        const state = { ...timer, status: 'paused', remainingMs, endTime: null };
        await wtpSaveTimer(state);
        return { ok: true, state };
      }
      case 'TIMER_RESUME': {
        const timer = await wtpGetTimer();
        if (!timer || timer.status !== 'paused') return { ok: false };
        const remainingMs = timer.remainingMs || 0;
        if (remainingMs < 1000) throw new Error('Nothing to resume');
        const endTime = Date.now() + remainingMs;
        const state = { ...timer, status: 'running', endTime, remainingMs };
        await wtpSaveTimer(state);
        await browser.alarms.clear('timer-expire');
        await browser.alarms.create('timer-expire', { when: endTime });
        return { ok: true, state };
      }
      case 'TIMER_RESET': {
        await wtpClearTimer();
        return { ok: true, state: null };
      }
      case 'TIMER_GET': {
        const timer = await wtpGetTimer();
        return { ok: true, state: timer };
      }
      case 'TRANSLATE': {
        const settings = await wtpGetSettings();
        if (message.targetLang) settings.targetLang = message.targetLang;
        if (message.sourceLang) settings.sourceLang = message.sourceLang;
        const result = await wtpTranslate(message.text, settings);
        return { ok: true, ...result };
      }
      case 'GET_SETTINGS': {
        return { ok: true, settings: await wtpGetSettings() };
      }
      case 'SAVE_SETTINGS': {
        const settings = await wtpSaveSettings(message.settings || {});
        return { ok: true, settings };
      }
      case 'ADD_NOTE': {
        const note = {
          id: wtpUuid(),
          label: (message.label || '').trim() || 'default',
          body: (message.body || '').trim(),
          url: message.url || '',
          title: message.title || '',
          createdAt: new Date().toISOString()
        };
        await wtpAddNote(note);
        return { ok: true, note };
      }
      case 'GET_NOTES': {
        return { ok: true, notes: await wtpGetNotes() };
      }
      case 'DELETE_NOTE': {
        await wtpDeleteNote(message.id);
        return { ok: true, notes: await wtpGetNotes() };
      }
      case 'UPDATE_NOTE': {
        await wtpUpdateNote(message.id, message.partial || {});
        return { ok: true, notes: await wtpGetNotes() };
      }
      case 'GET_SITE_MINDMAP': {
        const key = message.pageKey || '';
        return { ok: true, mapData: await wtpGetSiteMindMap(key) };
      }
      case 'SAVE_SITE_MINDMAP': {
        const key = message.pageKey || '';
        const mapData = await wtpSaveSiteMindMap(key, message.mapData || {});
        return { ok: true, mapData };
      }
      case 'GET_ALL_SITE_MINDMAPS':
      case 'GET_SAVED_MINDMAPS': {
        return { ok: true, items: await wtpGetSavedMindMaps() };
      }
      case 'GET_SAVED_MINDMAP': {
        const item = await wtpGetSavedMindMap(message.id || '');
        return { ok: true, item };
      }
      case 'SAVE_SAVED_MINDMAP': {
        const item = await wtpAddSavedMindMap({
          label: message.label,
          pageKey: message.pageKey,
          url: message.url,
          title: message.title,
          mapData: message.mapData
        });
        return { ok: true, item };
      }
      case 'UPDATE_SAVED_MINDMAP': {
        const item = await wtpUpdateSavedMindMap(message.id, message.partial || {});
        return { ok: true, item };
      }
      case 'DELETE_SITE_MINDMAP':
      case 'DELETE_SAVED_MINDMAP': {
        await wtpDeleteSavedMindMap(message.id || message.snapshotId || '');
        return { ok: true, items: await wtpGetSavedMindMaps() };
      }
      case 'OPEN_VIEWER':
        await wtpOpenViewerTab('');
        return { ok: true };
      case 'OPEN_VIEWER_FILE': {
        const id = message.id || '';
        await wtpOpenViewerTab(id ? `?id=${encodeURIComponent(id)}` : '');
        return { ok: true };
      }
      case 'OPEN_VIEWER_LAST': {
        const data = await browser.storage.local.get('wtpViewerRecent');
        const recent = data.wtpViewerRecent || [];
        const lid = recent[0]?.id;
        await wtpOpenViewerTab(lid ? `?id=${encodeURIComponent(lid)}` : '');
        return { ok: true };
      }
      case 'OPEN_FLOATING_PANEL': {
        const tabId = message.tabId || sender.tab?.id;
        if (!tabId) throw new Error('No tab');
        await browser.tabs.sendMessage(tabId, {
          type: 'OPEN_FLOATING_PANEL',
          kind: message.kind
        });
        return { ok: true };
      }
      case 'OPEN_NOTE_MODAL': {
        const tabId = message.tabId || sender.tab?.id;
        if (!tabId) throw new Error('No tab');
        await browser.tabs.sendMessage(tabId, { type: 'SHOW_NOTE_MODAL' });
        return { ok: true };
      }
      case 'ADD_VOCAB': {
        const entry = wtpMakeStudyEntry(message);
        if (!entry.original) throw new Error('Empty text');
        await wtpAddVocab(entry);
        return { ok: true, entry };
      }
      case 'ADD_SENTENCE': {
        const entry = wtpMakeStudyEntry(message);
        if (!entry.original) throw new Error('Empty text');
        await wtpAddSentence(entry);
        return { ok: true, entry };
      }
      case 'GET_VOCAB': {
        return { ok: true, items: await wtpGetVocab() };
      }
      case 'GET_SENTENCES': {
        return { ok: true, items: await wtpGetSentences() };
      }
      case 'DELETE_VOCAB': {
        await wtpDeleteVocab(message.id);
        return { ok: true, items: await wtpGetVocab() };
      }
      case 'DELETE_SENTENCE': {
        await wtpDeleteSentence(message.id);
        return { ok: true, items: await wtpGetSentences() };
      }
      case 'UPDATE_VOCAB': {
        await wtpUpdateVocab(message.id, message.partial || {});
        return { ok: true, items: await wtpGetVocab() };
      }
      case 'UPDATE_SENTENCE': {
        await wtpUpdateSentence(message.id, message.partial || {});
        return { ok: true, items: await wtpGetSentences() };
      }
      case 'OPEN_SIDE_PANEL_TAB': {
        const tabId = message.tabId || sender.tab?.id;
        if (!tabId) throw new Error('No tab');
        await browser.tabs.sendMessage(tabId, {
          type: 'OPEN_SIDE_PANEL_TAB',
          tab: message.tab
        });
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown message' };
    }
  };

  handle()
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});
