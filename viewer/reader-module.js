import * as pdfjsLib from '../libs/pdfjs/pdf.min.mjs';

const workerUrl =
  typeof browser !== 'undefined' && browser.runtime?.getURL
    ? browser.runtime.getURL('libs/pdfjs/pdf.worker.min.mjs')
    : new URL('../libs/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

async function renderPdfToContainer(arrayBuffer, container) {
  container.innerHTML = '';
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const scale = 1.25;

  for (let num = 1; num <= pdf.numPages; num++) {
    const page = await pdf.getPage(num);
    const viewport = page.getViewport({ scale });
    const pageWrap = document.createElement('div');
    pageWrap.className = 'wtp-pdf-page';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageWrap.appendChild(canvas);

    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    pageWrap.appendChild(textLayerDiv);
    container.appendChild(pageWrap);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const textContent = await page.getTextContent();
    const TextLayerClass = pdfjsLib.TextLayer || (await import('../libs/pdfjs/pdf.min.mjs')).TextLayer;
    if (TextLayerClass) {
      const textLayer = new TextLayerClass({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });
      await textLayer.render();
    } else if (pdfjsLib.renderTextLayer) {
      await pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport,
        textDivs: []
      });
    }
  }
}

async function renderDocxToContainer(arrayBuffer, container) {
  if (typeof mammoth === 'undefined') {
    throw new Error('MAMMOTH_MISSING');
  }
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const wrap = document.createElement('div');
  wrap.className = 'wtp-viewer-html';
  wrap.innerHTML = result.value || '';
  container.innerHTML = '';
  container.appendChild(wrap);
}

function renderHtmlTextToContainer(text, container, asHtml) {
  container.innerHTML = '';
  const wrap = document.createElement(asHtml ? 'div' : 'pre');
  wrap.className = asHtml ? 'wtp-viewer-html' : 'wtp-viewer-txt';
  if (asHtml) wrap.innerHTML = text;
  else wrap.textContent = text;
  container.appendChild(wrap);
}

globalThis.wtpViewerEngine = {
  renderPdfToContainer,
  renderDocxToContainer,
  renderHtmlTextToContainer
};
