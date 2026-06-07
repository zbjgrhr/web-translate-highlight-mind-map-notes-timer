let uiLocale = 'zh';

function setStatus(text, kind) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status' + (kind ? ` ${kind}` : '');
}

function fillLangSelect() {
  const sel = document.getElementById('target-lang');
  sel.innerHTML = '';
  WTP_LANG_OPTIONS.forEach((opt) => {
    const o = document.createElement('option');
    o.value = opt.code;
    o.textContent = opt.name;
    sel.appendChild(o);
  });
}

function updateProviderUi() {
  const provider = document.getElementById('provider').value;
  const needsKey = provider === 'google' || provider === 'deepl';
  document.getElementById('wrap-api-key').classList.toggle('hidden', !needsKey);
  document.getElementById('wrap-libre-url').classList.toggle('hidden', provider !== 'libre');
  document.getElementById('wrap-deepl-pro').classList.toggle('hidden', provider !== 'deepl');
}

async function load() {
  const res = await browser.runtime.sendMessage({ type: 'GET_SETTINGS' });
  const s = res?.settings || {};
  uiLocale = s.uiLocale || 'zh';
  document.getElementById('ui-locale').value = uiLocale;
  document.getElementById('provider').value = s.provider || 'free';
  document.getElementById('api-key').value = s.apiKey || '';
  document.getElementById('libre-url').value = s.libreUrl || 'https://libretranslate.com';
  document.getElementById('deepl-pro').checked = !!s.deeplPro;
  document.getElementById('target-lang').value = s.targetLang || 'en';
  document.getElementById('source-lang').value = s.sourceLang || 'auto';
  document.getElementById('close-tab-on-expire').checked = !!s.closeTabOnExpire;
  updateProviderUi();
  wtpApplyI18n(document.body, uiLocale);
}

async function save() {
  const settings = {
    uiLocale: document.getElementById('ui-locale').value,
    provider: document.getElementById('provider').value,
    apiKey: document.getElementById('api-key').value,
    libreUrl: document.getElementById('libre-url').value.trim() || 'https://libretranslate.com',
    deeplPro: document.getElementById('deepl-pro').checked,
    targetLang: document.getElementById('target-lang').value,
    sourceLang: document.getElementById('source-lang').value,
    closeTabOnExpire: document.getElementById('close-tab-on-expire').checked
  };
  await browser.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  uiLocale = settings.uiLocale;
  wtpApplyI18n(document.body, uiLocale);
  setStatus(wtpGetStrings(uiLocale).saved, 'ok');
}

document.getElementById('btn-save').addEventListener('click', save);

document.getElementById('provider').addEventListener('change', updateProviderUi);

document.getElementById('ui-locale').addEventListener('change', async () => {
  uiLocale = document.getElementById('ui-locale').value;
  wtpApplyI18n(document.body, uiLocale);
});

document.getElementById('btn-test').addEventListener('click', async () => {
  const strings = wtpGetStrings(uiLocale);
  setStatus('…');
  await save();
  try {
    const res = await browser.runtime.sendMessage({
      type: 'TRANSLATE',
      text: strings.testSample,
      targetLang: document.getElementById('target-lang').value
    });
    if (!res?.ok) throw new Error(res?.error || strings.testFail);
    setStatus(`${strings.testSuccess}: ${res.translatedText}`, 'ok');
  } catch (e) {
    setStatus(`${strings.testFail}: ${e.message}`, 'err');
  }
});

fillLangSelect();
load();
