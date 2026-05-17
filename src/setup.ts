/**
 * Local HTTP server shown on first run to display the WhatsApp QR code.
 * Opens automatically in the user's browser. Closes once connected.
 */
import http from 'http';
import open from 'open';

let currentQr: string | null = null;
let statusText = 'Waiting for QR code…';
let server: http.Server | null = null;
const SSE_CLIENTS: http.ServerResponse[] = [];

function page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WhatsApp MCP — Connect</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: #fff; font-family: system-ui, sans-serif;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 24px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px;
            padding: 40px; max-width: 420px; width: 100%; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    p  { color: #888; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    #qr img { border-radius: 12px; background: #fff; padding: 12px; }
    #status { margin-top: 16px; font-size: 13px; color: #25D366; }
    .spinner { font-size: 32px; margin-bottom: 12px; animation: spin 1s linear infinite; display:inline-block; }
    @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px;margin-bottom:12px">💬</div>
    <h1>Connect WhatsApp</h1>
    <p>Open WhatsApp on your phone →<br>
       <b>Settings → Linked Devices → Link a Device</b><br>
       then scan the QR code below.</p>
    <div id="qr"><div class="spinner">⏳</div></div>
    <div id="status">${statusText}</div>
  </div>
  <script>
    const evts = new EventSource('/events');
    evts.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.qr) {
        document.getElementById('qr').innerHTML =
          '<img src="' + d.qr + '" width="240" height="240" alt="QR">';
        document.getElementById('status').textContent = 'Waiting for scan…';
      }
      if (d.connected) {
        document.getElementById('qr').innerHTML = '<div style="font-size:64px">✅</div>';
        document.getElementById('status').textContent =
          'Connected as +' + d.phone + '! You can close this tab.';
        evts.close();
      }
    };
  </script>
</body>
</html>`;
}

export function startSetupServer(): void {
  server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      SSE_CLIENTS.push(res);
      // Send current QR immediately if we have one
      if (currentQr) pushEvent({ qr: currentQr });
      req.on('close', () => {
        const idx = SSE_CLIENTS.indexOf(res);
        if (idx >= 0) SSE_CLIENTS.splice(idx, 1);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page());
  });

  server.listen(3000, () => {
    console.error('[whatsapp-mcp] Opening setup page at http://localhost:3000');
    open('http://localhost:3000').catch(() => {
      console.error('[whatsapp-mcp] Could not open browser — visit http://localhost:3000 manually');
    });
  });
}

export function pushQR(qrDataUrl: string): void {
  currentQr = qrDataUrl;
  statusText = 'Waiting for scan…';
  pushEvent({ qr: qrDataUrl });
}

export function pushConnected(phone: string): void {
  pushEvent({ connected: true, phone });
  // Close server after a short delay
  setTimeout(() => {
    server?.close();
    server = null;
    SSE_CLIENTS.length = 0;
  }, 3000);
}

function pushEvent(data: object): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of SSE_CLIENTS) {
    try { client.write(payload); } catch { /* ignore closed */ }
  }
}
