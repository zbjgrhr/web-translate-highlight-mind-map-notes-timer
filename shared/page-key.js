/**
 * Unified page identity for highlights, mind-map drafts, and notes.
 * http(s): origin + pathname + search (no hash)
 * file://: full href without hash
 * extension viewer: ext-viewer:{stableId} via wtpViewerPageKeyOverride
 */
(function (global) {
  function wtpStripHash(href) {
    const i = href.indexOf('#');
    return i >= 0 ? href.slice(0, i) : href;
  }

  function wtpPageKey(loc) {
    const locationRef = loc || (typeof global.location !== 'undefined' ? global.location : null);
    if (global.wtpViewerPageKeyOverride) return global.wtpViewerPageKeyOverride;
    if (!locationRef || !locationRef.href) return '';
    const href = wtpStripHash(locationRef.href);
    if (locationRef.protocol === 'file:') return href;
    if (locationRef.protocol === 'http:' || locationRef.protocol === 'https:') {
      return `${locationRef.origin}${locationRef.pathname}${locationRef.search || ''}`;
    }
    return href;
  }

  function wtpExtViewerPageKey(stableId) {
    return `ext-viewer:${stableId}`;
  }

  async function wtpStableFileId(file) {
    const name = file?.name || 'file';
    const size = file?.size ?? 0;
    const head = file.slice ? file.slice(0, Math.min(file.size || 0, 65536)) : file;
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && head?.arrayBuffer) {
        const buf = await head.arrayBuffer();
        const payload = new Uint8Array(buf.byteLength + 64);
        payload.set(new Uint8Array(buf), 0);
        const meta = new TextEncoder().encode(`${name}\0${size}`);
        payload.set(meta, buf.byteLength);
        const hash = await crypto.subtle.digest('SHA-256', payload);
        const hex = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        return hex.slice(0, 16);
      }
    } catch {
      /* fallback */
    }
    return `${name}-${size}`.replace(/[^\w.-]+/g, '_').slice(0, 48);
  }

  global.wtpPageKey = wtpPageKey;
  global.wtpExtViewerPageKey = wtpExtViewerPageKey;
  global.wtpStableFileId = wtpStableFileId;
})(typeof globalThis !== 'undefined' ? globalThis : window);
