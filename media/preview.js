(function () {
  const vscode = acquireVsCodeApi();

  function log(level, message) {
    try {
      vscode.postMessage({ type: 'log', level, message });
    } catch {}
  }
  window.addEventListener('error', (e) => {
    log('error', `window.onerror: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    log(
      'error',
      `unhandledrejection: ${e.reason && e.reason.message ? e.reason.message : String(e.reason)}`
    );
  });
  if (typeof window.GraphViewer === 'undefined') {
    log('error', 'viewer-static.min.js was not loaded');
  }

  // diagramId -> { slot, mxgraphDiv, xml, zoomBtn }
  const slots = new Map();

  function computeBorder(hostEl) {
    const w = hostEl.clientWidth || 800;
    return Math.max(8, Math.min(32, Math.round(w * 0.02)));
  }

  function discoverSlots() {
    const elements = document.querySelectorAll('.drawio-slot[data-diagram-id]');
    for (const slot of elements) {
      const diagramId = slot.dataset.diagramId;
      if (!diagramId) continue;
      if (slots.has(diagramId)) continue;
      setupSlot(slot, diagramId);
    }
  }

  function setupSlot(slot, diagramId) {
    // Make sure the slot itself is position:relative.
    slot.style.position = slot.style.position || 'relative';

    // Viewer render target.
    const mxgraphDiv = document.createElement('div');
    mxgraphDiv.className = 'drawio-slot-host';
    slot.appendChild(mxgraphDiv);

    // Overlay (title + zoom + edit).
    const overlay = document.createElement('div');
    overlay.className = 'drawio-overlay';

    const title = document.createElement('span');
    title.className = 'drawio-overlay-title';
    title.textContent = diagramId;
    overlay.appendChild(title);

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'drawio-overlay-button';
    zoomBtn.textContent = '🔍';
    zoomBtn.title = 'Toggle fullscreen';
    zoomBtn.setAttribute('aria-label', 'Toggle fullscreen');
    zoomBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const isOn = slot.classList.toggle('drawio-fullscreen');
      zoomBtn.textContent = isOn ? '✕' : '🔍';
      zoomBtn.title = isOn ? 'Exit fullscreen' : 'Toggle fullscreen';
      zoomBtn.setAttribute('aria-label', zoomBtn.title);
      document.body.classList.toggle('drawio-has-fullscreen', isOn);
      mxgraphDiv.style.height = isOn ? '100vh' : '';
      const entry = slots.get(diagramId);
      if (entry && entry.xml) {
        renderViewer(entry, entry.xml);
      }
    });
    overlay.appendChild(zoomBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'drawio-overlay-button';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit in a side tab';
    editBtn.setAttribute('aria-label', 'Edit in a side tab');
    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      vscode.postMessage({ type: 'openEditor', diagramId });
    });
    overlay.appendChild(editBtn);

    slot.appendChild(overlay);

    const entry = { slot, mxgraphDiv, xml: '', zoomBtn, resizeTimer: null };
    slots.set(diagramId, entry);

    // ResizeObserver — react to container width changes.
    let lastW = mxgraphDiv.clientWidth;
    let lastH = mxgraphDiv.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = mxgraphDiv.clientWidth;
      const h = mxgraphDiv.clientHeight;
      if (Math.abs(w - lastW) < 5 && Math.abs(h - lastH) < 5) {
        return;
      }
      lastW = w;
      lastH = h;
      if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
      entry.resizeTimer = setTimeout(() => {
        if (entry.xml) {
          renderViewer(entry, entry.xml);
        }
      }, 200);
    });
    ro.observe(mxgraphDiv);
  }

  // Dark mode detection:
  // - When the user HTML did not set a background, the WebView already follows the VSCode theme.
  // - If prefers-color-scheme: dark, pass dark-mode to the viewer so the SVG background turns dark too.
  function isDarkMode() {
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  }

  function renderViewer(entry, xml) {
    entry.mxgraphDiv.innerHTML = '';
    if (!xml || !xml.trim()) {
      const empty = document.createElement('div');
      empty.className = 'drawio-empty';
      empty.textContent = '(empty diagram)';
      entry.mxgraphDiv.appendChild(empty);
      return;
    }
    const div = document.createElement('div');
    // The 'drawio-rendered' class marks an extension-rendered node.
    // previewHtmlBuilder's CSS `.mxgraph:not(.drawio-rendered)` uses it
    // to cleanly separate extension renders from the user's own .mxgraph nodes.
    div.className = 'mxgraph drawio-rendered';
    div.setAttribute(
      'data-mxgraph',
      JSON.stringify({
        xml,
        toolbar: null,
        lightbox: false,
        nav: false,
        resize: true,
        'auto-fit': true,
        // Crop tightly to the element bbox (drop the page-size whitespace).
        'auto-crop': true,
        center: true,
        border: computeBorder(entry.mxgraphDiv),
        editable: false,
        'check-visible-state': false,
        // Theme follow-through: passing dark-mode to the viewer darkens the SVG background.
        'dark-mode': isDarkMode(),
      })
    );
    entry.mxgraphDiv.appendChild(div);
    try {
      if (window.GraphViewer && window.GraphViewer.createViewerForElement) {
        window.GraphViewer.createViewerForElement(div);
        setTimeout(() => {
          if (div.querySelectorAll('svg').length === 0) {
            log(
              'warn',
              `No SVG was produced for diagram-id=${entry.slot.dataset.diagramId}`
            );
          }
        }, 500);
      } else {
        log('error', 'GraphViewer.createViewerForElement is missing');
      }
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'drawio-empty';
      err.textContent = 'Render error: ' + (e && e.message ? e.message : String(e));
      entry.mxgraphDiv.appendChild(err);
      log(
        'error',
        `createViewerForElement throw: ${e && e.message ? e.message : String(e)} stack=${
          e && e.stack ? e.stack.slice(0, 500) : ''
        }`
      );
    }
  }

  function applyBlocks(blocks) {
    discoverSlots();
    for (const b of blocks) {
      const entry = slots.get(b.diagramId);
      if (!entry) continue;
      if (entry.xml !== b.xml) {
        entry.xml = b.xml;
        renderViewer(entry, b.xml);
      }
    }
  }

  function handleFromHost(msg) {
    if (msg.type === 'load') {
      applyBlocks(msg.blocks || []);
      return;
    }
  }

  // Global ESC: exit fullscreen.
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const fs = document.querySelector('.drawio-slot.drawio-fullscreen');
    if (!fs) return;
    fs.classList.remove('drawio-fullscreen');
    document.body.classList.remove('drawio-has-fullscreen');
    const entry = slots.get(fs.dataset.diagramId);
    if (entry) {
      entry.zoomBtn.textContent = '🔍';
      entry.zoomBtn.title = 'Toggle fullscreen';
      entry.zoomBtn.setAttribute('aria-label', 'Toggle fullscreen');
      entry.mxgraphDiv.style.height = '';
      if (entry.xml) renderViewer(entry, entry.xml);
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && typeof data === 'object' && data.type) {
      handleFromHost(data);
    }
  });

  // Wait for DOMContentLoaded before discovering slots.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      discoverSlots();
      vscode.postMessage({ type: 'ready' });
    });
  } else {
    discoverSlots();
    vscode.postMessage({ type: 'ready' });
  }
})();
