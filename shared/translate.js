const WTP_LANG_MAP = {
  en: 'en',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  fr: 'fr',
  de: 'de',
  es: 'es',
  ru: 'ru',
  ar: 'ar'
};

function wtpMapLang(code) {
  return WTP_LANG_MAP[code] || code;
}

function wtpDetectSourceLang(text) {
  if (!text || !text.trim()) return 'en';
  const cjk =
    (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = text.length;
  if (cjk / total > 0.2) return 'zh-CN';
  if (latin / total > 0.25) return 'en';
  return 'en';
}

function wtpMyMemoryCode(code) {
  const mapped = wtpMapLang(code);
  const base = String(mapped || code || 'en')
    .split('-')[0]
    .toLowerCase();
  return base === 'zh' ? 'zh-CN' : base;
}

/** Resolve source/target; auto-pick opposite target when pair would be identical (e.g. en|en). */
function wtpResolveTranslateLangs(text, sourceLang, targetLang) {
  const trimmed = text.trim();
  const autoSource = !sourceLang || sourceLang === 'auto';
  const srcResolved = autoSource
    ? wtpDetectSourceLang(trimmed)
    : wtpMapLang(sourceLang);
  let tgt = wtpMapLang(targetLang || 'zh');
  const srcNorm = wtpMyMemoryCode(srcResolved);
  const tgtNorm = wtpMyMemoryCode(tgt);
  let autoFixedTarget = false;
  if (srcNorm === tgtNorm) {
    autoFixedTarget = true;
    tgt = srcNorm === 'en' || String(srcNorm).startsWith('en') ? 'zh' : 'en';
  }
  const forcedSame =
    !autoFixedTarget &&
    !autoSource &&
    sourceLang &&
    targetLang &&
    sourceLang === targetLang;
  return {
    sourceLang: srcResolved,
    targetLang: tgt,
    detectedSourceLang: autoSource ? srcResolved : null,
    autoFixedTarget,
    forcedSame
  };
}

async function wtpTranslate(text, settings) {
  const { provider, apiKey, targetLang, deeplPro, libreUrl, sourceLang } = settings;
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty text');
  const resolved = wtpResolveTranslateLangs(trimmed, sourceLang, targetLang);
  if (resolved.forcedSame) {
    throw new Error(
      'Source and target language must differ. / 源语言与目标语言不能相同。'
    );
  }
  const src = resolved.sourceLang;
  const target = resolved.targetLang;

  if (provider === 'free') {
    const out = await wtpTranslateMyMemory(trimmed, target, src);
    return { ...out, detectedSourceLang: resolved.detectedSourceLang || out.detectedSourceLang };
  }
  if (provider === 'libre') {
    const out = await wtpTranslateLibre(
      trimmed,
      target,
      libreUrl || 'https://libretranslate.com',
      src
    );
    return { ...out, detectedSourceLang: resolved.detectedSourceLang || out.detectedSourceLang };
  }

  if (!apiKey || !apiKey.trim()) {
    throw new Error('API key not configured');
  }

  if (provider === 'deepl') {
    return wtpTranslateDeepL(trimmed, target, apiKey.trim(), deeplPro);
  }
  return wtpTranslateGoogle(trimmed, target, apiKey.trim());
}

async function wtpTranslateMyMemory(text, target, source) {
  const src = wtpMapLang(source?.split('-')[0] === 'zh' ? 'zh' : source) || 'en';
  const tgt = wtpMapLang(target);
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${src}|${tgt}`);

  const res = await fetch(url.toString(), { method: 'GET' });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.responseDetails || res.statusText);
  }
  const data = json?.responseData;
  if (!data?.translatedText) {
    throw new Error(json?.responseDetails || 'Translation failed');
  }
  if (json.responseStatus && json.responseStatus !== 200) {
    const warn = json?.responseDetails || '';
    if (warn.toLowerCase().includes('quota') || warn.toLowerCase().includes('limit')) {
      throw new Error(warn);
    }
  }
  return {
    translatedText: data.translatedText,
    detectedSourceLang: data.detectedSourceLanguage || src
  };
}

async function wtpTranslateLibre(text, target, baseUrl, source) {
  const base = (baseUrl || 'https://libretranslate.com').replace(/\/$/, '');
  const tgt = wtpMapLang(target).split('-')[0];
  const srcCode = (source || 'en').split('-')[0];

  const res = await fetch(`${base}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: srcCode,
      target: tgt,
      format: 'text'
    })
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || json?.message || res.statusText);
  }
  return {
    translatedText: json?.translatedText || '',
    detectedSourceLang: json?.detectedLanguage?.language || srcCode
  };
}

async function wtpTranslateGoogle(text, target, apiKey) {
  const url = new URL('https://translation.googleapis.com/language/translate/v2');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', text);
  url.searchParams.set('target', target);
  url.searchParams.set('format', 'text');

  const res = await fetch(url.toString(), { method: 'GET' });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw new Error(msg);
  }
  const t = json?.data?.translations?.[0];
  return {
    translatedText: t?.translatedText || '',
    detectedSourceLang: t?.detectedSourceLanguage
  };
}

const WTP_DEEPL_TARGET = {
  en: 'EN-US',
  zh: 'ZH',
  ja: 'JA',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  ru: 'RU'
};

async function wtpTranslateDeepL(text, target, apiKey, deeplPro) {
  const base = deeplPro
    ? 'https://api.deepl.com/v2/translate'
    : 'https://api-free.deepl.com/v2/translate';
  const targetUpper = WTP_DEEPL_TARGET[target] || target.toUpperCase();
  const body = new URLSearchParams({ text, target_lang: targetUpper });

  const res = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.message || res.statusText;
    throw new Error(msg);
  }
  const t = json?.translations?.[0];
  return {
    translatedText: t?.text || '',
    detectedSourceLang: t?.detected_source_language
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.wtpTranslate = wtpTranslate;
  globalThis.wtpDetectSourceLang = wtpDetectSourceLang;
  globalThis.wtpResolveTranslateLangs = wtpResolveTranslateLangs;
}
