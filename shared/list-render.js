/** Shared list sort/filter/render for floating panels and side panel. */

const WTP_SORT_KEYS = {
  vocab: 'wtpVocabListSort',
  sentences: 'wtpSentencesListSort',
  notes: 'wtpNotesListSort'
};

const WTP_SORT_OPTIONS = ['timeDesc', 'timeAsc', 'labelAsc', 'originalAsc', 'domainGroup'];

function wtpGetListSort(kind) {
  const key = WTP_SORT_KEYS[kind];
  const v = localStorage.getItem(key);
  return WTP_SORT_OPTIONS.includes(v) ? v : 'timeDesc';
}

function wtpSetListSort(kind, sortKey) {
  if (!WTP_SORT_OPTIONS.includes(sortKey)) return;
  localStorage.setItem(WTP_SORT_KEYS[kind], sortKey);
}

function wtpDomainFromUrl(url) {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

function wtpSortStudyItems(items, sortKey) {
  const list = [...items];
  if (sortKey === 'timeAsc') {
    return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (sortKey === 'labelAsc') {
    return list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }
  if (sortKey === 'originalAsc') {
    return list.sort((a, b) => (a.original || '').localeCompare(b.original || ''));
  }
  if (sortKey === 'domainGroup') {
    return list.sort((a, b) => {
      const da = wtpDomainFromUrl(a.url);
      const db = wtpDomainFromUrl(b.url);
      if (da !== db) return da.localeCompare(db);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function wtpSortNotes(notes, sortKey) {
  const list = [...notes];
  if (sortKey === 'timeAsc') {
    return list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (sortKey === 'labelAsc') {
    return list.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }
  if (sortKey === 'originalAsc') {
    return list.sort((a, b) => (a.body || '').localeCompare(b.body || ''));
  }
  if (sortKey === 'domainGroup') {
    return list.sort((a, b) => {
      const da = wtpDomainFromUrl(a.url);
      const db = wtpDomainFromUrl(b.url);
      if (da !== db) return da.localeCompare(db);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function wtpBuildLabelOptions(items, current) {
  const labels = [...new Set(items.map((n) => n.label).filter(Boolean))].sort();
  const opts = [{ value: '', label: wtpBilingual('allLabels') }];
  labels.forEach((l) => opts.push({ value: l, label: l }));
  return { opts, current };
}

function wtpTruncate(text, max = 48) {
  const s = (text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function wtpFillSortSelect(select, kind) {
  const s = wtpGetStrings(typeof wtpUiLocale === 'string' ? wtpUiLocale : 'zh');
  const map = {
    timeDesc: s.sortTimeDesc,
    timeAsc: s.sortTimeAsc,
    labelAsc: s.sortByLabel,
    originalAsc: s.sortByOriginal,
    domainGroup: s.sortByDomain
  };
  select.innerHTML = '';
  WTP_SORT_OPTIONS.forEach((key) => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = map[key] || key;
    select.appendChild(o);
  });
  select.value = wtpGetListSort(kind);
}

function wtpRenderStudyListItem(item, { compact, selected, onSelect }) {
  const li = document.createElement('li');
  li.className = 'wtp-list-item';
  if (selected) li.classList.add('active');
  li.dataset.id = item.id;
  const date = new Date(item.createdAt).toLocaleString();
  const domain = wtpDomainFromUrl(item.url);
  li.innerHTML = `
    <span class="wtp-list-label"></span>
    <span class="wtp-list-preview"></span>
    <span class="wtp-list-meta"></span>
    <span class="wtp-list-domain hidden"></span>
  `;
  li.querySelector('.wtp-list-label').textContent = item.label || '—';
  li.querySelector('.wtp-list-preview').textContent = wtpTruncate(item.original, compact ? 36 : 60);
  li.querySelector('.wtp-list-meta').textContent = date;
  const domEl = li.querySelector('.wtp-list-domain');
  if (domain) {
    domEl.textContent = domain;
    domEl.classList.remove('hidden');
  }
  li.addEventListener('click', () => onSelect?.(item, li));
  return li;
}

function wtpRenderNoteListItem(note, { selected, onSelect }) {
  const li = document.createElement('li');
  li.className = 'wtp-list-item';
  if (selected) li.classList.add('active');
  li.dataset.id = note.id;
  const date = new Date(note.createdAt).toLocaleString();
  li.innerHTML = `
    <span class="wtp-list-label"></span>
    <span class="wtp-list-preview"></span>
    <span class="wtp-list-meta"></span>
    <span class="wtp-list-domain hidden"></span>
  `;
  li.querySelector('.wtp-list-label').textContent = note.label || '—';
  li.querySelector('.wtp-list-preview').textContent = wtpTruncate(note.body, 60) || '(empty)';
  li.querySelector('.wtp-list-meta').textContent = `${note.title || ''} · ${date}`.trim();
  const domain = wtpDomainFromUrl(note.url);
  const domEl = li.querySelector('.wtp-list-domain');
  if (domain) {
    domEl.textContent = domain;
    domEl.classList.remove('hidden');
  }
  li.addEventListener('click', () => onSelect?.(note, li));
  return li;
}

function wtpGroupByDomain(items) {
  const groups = new Map();
  items.forEach((item) => {
    const d = wtpDomainFromUrl(item.url) || '—';
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(item);
  });
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

if (typeof globalThis !== 'undefined') {
  Object.assign(globalThis, {
    WTP_SORT_KEYS,
    WTP_SORT_OPTIONS,
    wtpGetListSort,
    wtpSetListSort,
    wtpSortStudyItems,
    wtpSortNotes,
    wtpBuildLabelOptions,
    wtpTruncate,
    wtpFillSortSelect,
    wtpRenderStudyListItem,
    wtpRenderNoteListItem,
    wtpGroupByDomain,
    wtpDomainFromUrl
  });
}
