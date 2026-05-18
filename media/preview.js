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
    log('error', 'viewer-static.min.js が読み込まれていません');
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
    // slot 自体に position:relative を保証
    slot.style.position = slot.style.position || 'relative';

    // viewer 描画先 div
    const mxgraphDiv = document.createElement('div');
    mxgraphDiv.className = 'drawio-slot-host';
    slot.appendChild(mxgraphDiv);

    // オーバーレイ（タイトル + 拡大 + 編集）
    const overlay = document.createElement('div');
    overlay.className = 'drawio-overlay';

    const title = document.createElement('span');
    title.className = 'drawio-overlay-title';
    title.textContent = diagramId;
    overlay.appendChild(title);

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'drawio-overlay-button';
    zoomBtn.textContent = '🔍 拡大';
    zoomBtn.title = '拡大表示／縮小';
    zoomBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const isOn = slot.classList.toggle('drawio-fullscreen');
      zoomBtn.textContent = isOn ? '✕ 縮小' : '🔍 拡大';
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
    editBtn.textContent = '✏️ 編集';
    editBtn.title = '別タブで編集';
    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      vscode.postMessage({ type: 'openEditor', diagramId });
    });
    overlay.appendChild(editBtn);

    slot.appendChild(overlay);

    const entry = { slot, mxgraphDiv, xml: '', zoomBtn, resizeTimer: null };
    slots.set(diagramId, entry);

    // ResizeObserver で container 幅変化に追随
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

  function renderViewer(entry, xml) {
    entry.mxgraphDiv.innerHTML = '';
    if (!xml || !xml.trim()) {
      const empty = document.createElement('div');
      empty.className = 'drawio-empty';
      empty.textContent = '（空の図）';
      entry.mxgraphDiv.appendChild(empty);
      return;
    }
    const div = document.createElement('div');
    // 'drawio-rendered' は拡張描画である目印。
    // previewHtmlBuilder の CSS `.mxgraph:not(.drawio-rendered)` で
    // ユーザ自前の .mxgraph と確実に分離する。
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
        'auto-crop': true,
        center: true,
        border: computeBorder(entry.mxgraphDiv),
        editable: false,
        'check-visible-state': false,
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
              `SVGが生成されていません diagram-id=${entry.slot.dataset.diagramId}`
            );
          }
        }, 500);
      } else {
        log('error', 'GraphViewer.createViewerForElement が存在しません');
      }
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'drawio-empty';
      err.textContent = '描画エラー: ' + (e && e.message ? e.message : String(e));
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

  // 全体 ESC で fullscreen 解除
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const fs = document.querySelector('.drawio-slot.drawio-fullscreen');
    if (!fs) return;
    fs.classList.remove('drawio-fullscreen');
    document.body.classList.remove('drawio-has-fullscreen');
    const entry = slots.get(fs.dataset.diagramId);
    if (entry) {
      entry.zoomBtn.textContent = '🔍 拡大';
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

  // DOMContentLoaded を待ってから slot を検出する
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
