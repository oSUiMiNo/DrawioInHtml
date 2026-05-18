(function () {
  const vscode = acquireVsCodeApi();
  const iframe = document.getElementById('drawio');

  let pendingXml = '';
  let isReady = false;

  function sendToDrawio(payload) {
    if (!iframe.contentWindow) {
      return;
    }
    iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
  }

  function handleDrawioMessage(data) {
    let msg;
    try {
      msg = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || !msg.event) {
      return;
    }
    switch (msg.event) {
      case 'init':
        isReady = true;
        sendToDrawio({ action: 'load', xml: pendingXml, autosave: 0 });
        break;
      case 'save':
        if (typeof msg.xml === 'string') {
          vscode.postMessage({ type: 'save', xml: msg.xml });
        }
        break;
      case 'exit':
        vscode.postMessage({ type: 'exit' });
        break;
      default:
        break;
    }
  }

  function handleFromHost(msg) {
    if (msg.type === 'load') {
      pendingXml = msg.xml || '';
      if (isReady) {
        sendToDrawio({ action: 'load', xml: pendingXml, autosave: 0 });
      }
      return;
    }
    if (msg.type === 'saved') {
      // Reserved for a status indicator if needed in the future.
      return;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source === iframe.contentWindow) {
      handleDrawioMessage(event.data);
      return;
    }
    const data = event.data;
    if (data && typeof data === 'object' && data.type) {
      handleFromHost(data);
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
