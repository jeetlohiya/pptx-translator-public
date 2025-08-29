// public/app.js
const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const originBase = window.location.origin;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Uploading…';
  const fd = new FormData(form);

  try {
    // 1) start translation, get requestId
    const start = await fetch(`${originBase}/api/translate`, { method: 'POST', body: fd });
    if (!start.ok) {
      const err = await start.json().catch(()=>({}));
      throw new Error(err.error || start.statusText);
    }
    const { requestId } = await start.json();
    if (!requestId) throw new Error('No requestId');

    // 2) poll status
    statusEl.textContent = 'Translating…';
    let tries = 0;
    while (tries++ < 600) { // ~20 minutes max (2s * 600)
      const s = await fetch(`${originBase}/api/status?requestId=${encodeURIComponent(requestId)}`);
      if (!s.ok) throw new Error('Status check failed');
      const js = await s.json();
      const st = js?.data?.status || js?.status;
      if (st === 'COMPLETE') break;
      if (st === 'FAILED') throw new Error('Translation failed');
      await sleep(2000);
    }

    // 3) download
    statusEl.textContent = 'Downloading…';
    const d = await fetch(`${originBase}/api/download?requestId=${encodeURIComponent(requestId)}`);
    if (!d.ok) throw new Error('Download failed');
    const blob = await d.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'translated.pptx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = 'Done! File downloaded.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Error: ' + err.message;
    alert('Error: ' + err.message);
  }
});
