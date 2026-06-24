import * as vscode from 'vscode';
import * as http from 'http';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let ttsServer: http.Server | null = null;
let serverPort = 18765;
let statusBarItem: vscode.StatusBarItem | null = null;
let audioPanel: vscode.WebviewPanel | null = null;
let outputChannel: vscode.OutputChannel;
let audioFiles = new Map<string, Buffer>();

// ─── gTTS ────────────────────────────────────────────────────────────────────

function checkGttsInstalled(): boolean {
  try {
    execSync('python3 -c "from gtts import gTTS; print(1)"', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function generateSpeechGtts(text: string): Promise<Buffer> {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpScript = `/tmp/gtts-${ts}.py`;
  const tmpMp3 = `/tmp/gtts-${ts}.mp3`;
  const pyCode = `# -*- coding: utf-8 -*-
import sys
sys.stdin.reconfigure(encoding='utf-8')
text = sys.stdin.read()
from gtts import gTTS
tts = gTTS(text, lang='de', slow=False)
tts.save('${tmpMp3}')
print('OK', flush=True)
`;
  await fs.promises.writeFile(tmpScript, pyCode, 'utf-8');
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [tmpScript]);
    let stderr = '';
    proc.stdout.on('data', () => {});
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', async (code) => {
      fs.promises.unlink(tmpScript).catch(() => {});
      if (code !== 0) {
        reject(new Error(`gTTS Fehler (Exit ${code}): ${stderr.trim()}`));
        return;
      }
      try {
        const data = await fs.promises.readFile(tmpMp3);
        fs.promises.unlink(tmpMp3).catch(() => {});
        resolve(data);
      } catch (e) {
        reject(new Error(`MP3 nicht lesbar: ${e}`));
      }
    });
    proc.on('error', (e) => { fs.promises.unlink(tmpScript).catch(() => {}); reject(e); });
    proc.stdin.end(text);
  });
}

// ─── Audio Panel (persistent webview with Web Audio) ────────────────────────

function createAudioPanel(): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'zeroTokenAudio',
    '🔊 TTS',
    vscode.ViewColumn.Nine,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = getAudioPanelHtml();
  panel.onDidDispose(() => { audioPanel = null; });
  return panel;
}

function getAudioPanelHtml(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, sans-serif;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    display: flex; align-items: center; justify-content: center;
    height: 100vh; padding: 1rem; text-align: center;
  }
  button { padding: 1rem 2rem; font-size: 1.2rem; cursor: pointer; }
  .status { font-size: 0.9rem; margin-top: 1rem; opacity: 0.7; }
  .hidden { display: none; }
</style>
</head>
<body>
<div>
  <button id="activate">🔊 Aktivieren (Enter)</button>
  <div class="status" id="status">Bereit</div>
</div>
<script>
(function() {
  const btn = document.getElementById('activate');
  const statusEl = document.getElementById('status');
  let audioCtx = null;
  let isActive = false;

  function log(msg) { statusEl.textContent = msg; }

  async function unlock() {
    if (isActive) return true;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const buf = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = buf; src.connect(audioCtx.destination); src.start(0);
      isActive = true;
      btn.classList.add('hidden');
      log('✅ Audio aktiviert');
      return true;
    } catch(e) { log('❌ ' + e.message); return false; }
  }

  // Unlock on ANY user interaction in this panel (keypress, click, etc.)
  btn.onclick = unlock;
  document.addEventListener('keydown', () => { if (!isActive) unlock(); });
  document.addEventListener('click', () => { if (!isActive) unlock(); });

  // Try immediately (might work if AudioContext is already allowed)
  setTimeout(unlock, 300);

  // Receive and play audio
  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (msg.type !== 'speakAudio' || !msg.audioBase64) return;
    if (!isActive && !(await unlock())) { log('❌ Bitte erst aktivieren'); return; }
    try {
      const data = Uint8Array.from(atob(msg.audioBase64), c => c.charCodeAt(0));
      const audioBuf = await audioCtx.decodeAudioData(data.buffer);
      const src = audioCtx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(audioCtx.destination);
      src.start(0);
      log('🔊 Wiedergabe...');
      src.onended = () => log('✅ Fertig');
    } catch(e) { log('❌ Fehler: ' + e.message); }
  });
})();
</script>
</body>
</html>`;
}

function ensureAudioPanel(): vscode.WebviewPanel {
  if (!audioPanel) {
    audioPanel = createAudioPanel();
  }
  return audioPanel;
}

function speakToPanel(text: string) {
  const panel = ensureAudioPanel();
  generateSpeechGtts(text).then((buffer) => {
    const base64 = buffer.toString('base64');
    panel.webview.postMessage({ type: 'speakAudio', audioBase64: base64 });
  }).catch((e) => {
    outputChannel.appendLine(`[TTS] gTTS Fehler: ${e.message}`);
  });
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

function startTtsServer(port: number) {
  stopTtsServer();
  ttsServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // Health
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port }));
      return;
    }

    // OpenAI-compatible TTS
    if (req.method === 'POST' && (req.url?.endsWith('/audio/speech') || req.url?.endsWith('/v1/audio/speech'))) {
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          const text = params.input || '';
          if (!text.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: 'input required' })); return; }
          const audioBuffer = await generateSpeechGtts(text);
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audioBuffer.length });
          res.end(audioBuffer);
        } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    // Direct speak endpoint (used by assistant after each response)
    if (req.method === 'POST' && req.url === '/speak') {
      let body = '';
      req.on('data', (c) => body += c);
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          const text = params.text || '';
          if (!text.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: 'text required' })); return; }
          outputChannel.appendLine(`[TTS] Speak: "${text.slice(0, 80)}..."`);
          // Non-blocking: start playback, return immediately
          speakToPanel(text);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'speaking' }));
        } catch (e: any) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    // Serve generated audio files
    if (req.method === 'GET' && req.url?.startsWith('/audio/') && req.url.endsWith('.mp3')) {
      const id = req.url.slice(7, -4);
      const data = audioFiles.get(id);
      if (data) {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': data.length });
        res.end(data);
        audioFiles.delete(id);
      } else { res.writeHead(404); res.end('not found'); }
      return;
    }

    res.writeHead(404); res.end('not found');
  });

  ttsServer.listen(port, '0.0.0.0', () => {
    outputChannel.appendLine(`[TTS] Server läuft auf Port ${port}`);
    updateStatusBar(true);
  });
  ttsServer.on('error', (e: any) => { outputChannel.appendLine(`[TTS] Server-Fehler: ${e.message}`); updateStatusBar(false); });
}

function stopTtsServer() {
  if (ttsServer) { ttsServer.close(); ttsServer = null; }
  updateStatusBar(false);
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function updateStatusBar(running: boolean) {
  if (!statusBarItem) return;
  statusBarItem.text = running ? '$(megaphone) TTS' : '$(megaphone) TTS (off)';
  statusBarItem.tooltip = running ? `Zero-Token TTS auf Port ${serverPort}` : 'TTS Server gestoppt';
  statusBarItem.backgroundColor = running ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
}

// ─── OpenChamber config ──────────────────────────────────────────────────────

async function configureOpenChamber(port: number) {
  const sp = path.join(os.homedir(), '.config', 'openchamber', 'settings.json');
  const settings = {
    voiceProvider: 'openai-compatible',
    openaiCompatibleUrl: `http://localhost:${port}`,
    openaiCompatibleApiKey: 'not-required',
    showMessageTTSButtons: true,
  };
  try {
    await fs.promises.mkdir(path.dirname(sp), { recursive: true });
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse(await fs.promises.readFile(sp, 'utf8')); } catch {}
    const merged = { ...existing, ...settings };
    const tmp = `${sp}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(tmp, JSON.stringify(merged, null, 2), 'utf8');
    await fs.promises.rename(tmp, sp);
    return true;
  } catch { return false; }
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Zero-Token TTS');
  outputChannel.appendLine('[TTS] Aktiviert');

  const config = vscode.workspace.getConfiguration('zero-token-tts');
  serverPort = config.get<number>('serverPort', 18765);
  const serverEnabled = config.get<boolean>('serverEnabled', true);

  const gttsOk = checkGttsInstalled();
  if (!gttsOk) {
    vscode.window.showWarningMessage('gTTS nicht installiert. Bitte: pip install gtts', 'Installieren')
      .then(s => { if (s === 'Installieren') { const t = vscode.window.createTerminal('gTTS'); t.sendText('pip install gtts'); t.show(); }});
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'zero-token-tts.showStatus';
  context.subscriptions.push(statusBarItem);

  // Create audio panel early so it's ready
  if (gttsOk) audioPanel = createAudioPanel();

  if (serverEnabled && gttsOk) startTtsServer(serverPort);
  else updateStatusBar(false);

  context.subscriptions.push(
    vscode.commands.registerCommand('zero-token-tts.readClipboard', async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text.trim()) { vscode.window.showInformationMessage('Zwischenablage leer'); return; }
      speakToPanel(text);
    }),
    vscode.commands.registerCommand('zero-token-tts.configureOpenChamber', async () => {
      if (!ttsServer?.listening) { vscode.window.showWarningMessage('Server läuft nicht'); return; }
      if (await configureOpenChamber(serverPort))
        vscode.window.showInformationMessage('✅ OpenChamber konfiguriert! Webview neu laden für TTS-Buttons.');
      else vscode.window.showErrorMessage('Fehler');
    }),
    vscode.commands.registerCommand('zero-token-tts.showStatus', () => {
      const active = ttsServer?.listening;
      vscode.window.showInformationMessage(
        active
          ? `✅ TTS Server läuft auf Port ${serverPort}\nTTS-Panel bereit`
          : '❌ TTS Server läuft nicht'
      );
    })
  );

  outputChannel.appendLine('[TTS] Bereit');
}

export function deactivate() {
  stopTtsServer();
  if (audioPanel) audioPanel.dispose();
  outputChannel.dispose();
}
