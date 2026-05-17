(function () {
  const vscode = acquireVsCodeApi();
  const diagramsContainer = document.getElementById('diagrams');
  const warningsContainer = document.getElementById('warnings');

  function log(level, message) {
    try {
      vscode.postMessage({ type: 'log', level, message });
    } catch {}
  }
  window.addEventListener('error', (e) => {
    log('error', `window.onerror: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    log('error', `unhandledrejection: ${e.reason && e.reason.message ? e.reason.message : String(e.reason)}`);
  });
  if (typeof window.GraphViewer === 'undefined') {
    log('error', 'viewer-static.min.js が読み込まれていません');
  }

  // diagramId -> { card, viewerHost, xml, zoomBtn }
  const cards = new Map();

  function ensureCard(diagramId) {
    let entry = cards.get(diagramId);
    if (entry) {
      return entry;
    }
    const card = document.createElement('section');
    card.className = 'diagram-card';
    card.dataset.diagramId = diagramId;

    const viewerHost = document.createElement('div');
    viewerHost.className = 'viewer-host';

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = diagramId;
    overlay.appendChild(title);

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'overlay-button';
    zoomBtn.textContent = '🔍 拡大';
    zoomBtn.title = '拡大表示／縮小';
    zoomBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const isOn = card.classList.toggle('fullscreen');
      zoomBtn.textContent = isOn ? '✕ 縮小' : '🔍 拡大';
      document.body.classList.toggle('has-fullscreen', isOn);
      // fullscreen 時のみ高さをビューポート全体に固定、戻すときは figure 追随に戻す
      viewerHost.style.height = isOn ? '100vh' : '';
      if (entry.xml) {
        renderViewer(entry, entry.xml);
      }
    });
    overlay.appendChild(zoomBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'overlay-button';
    editBtn.textContent = '✏️ 編集';
    editBtn.title = '別タブで編集';
    editBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      vscode.postMessage({ type: 'openEditor', diagramId });
    });
    overlay.appendChild(editBtn);

    card.appendChild(viewerHost);
    card.appendChild(overlay);
    diagramsContainer.appendChild(card);

    // ESC で fullscreen 解除
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && card.classList.contains('fullscreen')) {
        card.classList.remove('fullscreen');
        document.body.classList.remove('has-fullscreen');
        zoomBtn.textContent = '🔍 拡大';
        viewerHost.style.height = '';
        if (entry && entry.xml) {
          renderViewer(entry, entry.xml);
        }
      }
    });

    entry = { card, viewerHost, xml: '', zoomBtn, resizeTimer: null };
    cards.set(diagramId, entry);

    // container サイズ変化に追随して再フィット（debounce 200ms）
    let lastW = viewerHost.clientWidth;
    let lastH = viewerHost.clientHeight;
    const ro = new ResizeObserver(() => {
      const w = viewerHost.clientWidth;
      const h = viewerHost.clientHeight;
      // 5px 未満の変動は無視
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
    ro.observe(viewerHost);

    return entry;
  }

  function computeBorder(hostEl) {
    // container幅の約2%を四方の余白に。最小8px、最大32pxでクランプ
    const w = hostEl.clientWidth || 800;
    return Math.max(8, Math.min(32, Math.round(w * 0.02)));
  }

  function renderViewer(entry, xml) {
    entry.viewerHost.innerHTML = '';
    if (!xml || !xml.trim()) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '（空の図）';
      entry.viewerHost.appendChild(empty);
      return;
    }
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.setAttribute(
      'data-mxgraph',
      JSON.stringify({
        xml,
        toolbar: null,
        lightbox: false,
        nav: false,
        // viewer の updateContainerHeight に container 高さを figure 高さへ追随させる
        // （ユーザ要望：縦余白を出さず figure サイズに合わせて縮む）
        resize: true,
        'auto-fit': true,
        // ページの空き余白（pageWidth/pageHeight の空き領域）を切り捨てて要素bbox基準で表示
        'auto-crop': true,
        // container 内で図を中央寄せ。forceCenter:true は crop() を抑止してしまうので使わない
        center: true,
        // container 幅に応じた動的な外周余白
        border: computeBorder(entry.viewerHost),
        editable: false,
        // VSCode WebView では可視性判定が機能せず描画スキップが起きるためバイパス
        'check-visible-state': false,
      })
    );
    entry.viewerHost.appendChild(div);
    try {
      if (window.GraphViewer && window.GraphViewer.createViewerForElement) {
        window.GraphViewer.createViewerForElement(div);
        setTimeout(() => {
          if (div.querySelectorAll('svg').length === 0) {
            log('warn', `SVGが生成されていません diagram-id=${entry.card.dataset.diagramId}`);
          }
        }, 500);
      } else {
        const err = document.createElement('div');
        err.className = 'empty';
        err.textContent = 'ビューアーJSが読み込めていません';
        entry.viewerHost.appendChild(err);
        log('error', 'GraphViewer.createViewerForElement が存在しません');
      }
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'empty';
      err.textContent = '描画エラー: ' + (e && e.message ? e.message : String(e));
      entry.viewerHost.appendChild(err);
      log(
        'error',
        `createViewerForElement throw: ${e && e.message ? e.message : String(e)} stack=${
          e && e.stack ? e.stack.slice(0, 500) : ''
        }`
      );
    }
  }

  function renderBlocks(blocks) {
    const seen = new Set();
    for (const b of blocks) {
      seen.add(b.diagramId);
      const entry = ensureCard(b.diagramId);
      if (entry.xml !== b.xml) {
        entry.xml = b.xml;
        renderViewer(entry, b.xml);
      }
    }
    for (const [id, entry] of Array.from(cards.entries())) {
      if (!seen.has(id)) {
        entry.card.remove();
        cards.delete(id);
      }
    }
  }

  function handleFromHost(msg) {
    if (msg.type === 'load') {
      renderBlocks(msg.blocks || []);
      if (msg.missingId) {
        warningsContainer.classList.add('show');
        warningsContainer.textContent =
          '警告: data-diagram-id を持たない <script type="application/drawio+xml"> が含まれています。これらは表示・編集対象外です。各 <script> タグに data-diagram-id="ユニークなID" を付けてください。';
      } else {
        warningsContainer.classList.remove('show');
        warningsContainer.textContent = '';
      }
      return;
    }
  }

  // 全体 ESC で fullscreen 解除
  window.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') {
      return;
    }
    const fs = document.querySelector('.diagram-card.fullscreen');
    if (fs) {
      fs.classList.remove('fullscreen');
      document.body.classList.remove('has-fullscreen');
      const entry = cards.get(fs.dataset.diagramId);
      if (entry) {
        entry.zoomBtn.textContent = '🔍 拡大';
        entry.viewerHost.style.height = '';
        if (entry.xml) {
          renderViewer(entry, entry.xml);
        }
      }
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && typeof data === 'object' && data.type) {
      handleFromHost(data);
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
