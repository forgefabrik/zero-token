import * as vscode from 'vscode';
import * as http from 'http';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

let ttsServer: http.Server | null = null;
let serverPort = 18765;
let statusBarItem: vscode.StatusBarItem | null = null;
let clipboardPollTimer: ReturnType<typeof setInterval> | null = null;
let lastClipboardText = '';
let ttsPanel: vscode.WebviewPanel | null = null;
let outputChannel: vscode.OutputChannel;

// ─── gTTS helpers ────────────────────────────────────────────────────────────

function checkGttsInstalled(): boolean {
  try {
    execSync('python3 -c "from gtts import gTTS; print(1)"', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function generateSpeechGtts(text: string, lang: string): Promise<Buffer> {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpScript = `/tmp/gtts-${ts}.py`;
  const tmpMp3 = `/tmp/gtts-${ts}.mp3`;
  const pyCode = `# -*- coding: utf-8 -*-
import sys
sys.stdin.reconfigure(encoding='utf-8')
text = sys.stdin.read()
from gtts import gTTS
tts = gTTS(text, lang='${lang}', slow=False)
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
        reject(new Error(`gTTS Fehler (Exit ${code}): ${stderr.trim() || 'Unbekannter Fehler'}`));
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

// ─── OpenAI-compatible TTS server ────────────────────────────────────────────

function startTtsServer(port: number, serverLang: string) {
  stopTtsServer();

  ttsServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port, lang: serverLang }));
      return;
    }

    if (req.method === 'POST' && (req.url?.endsWith('/audio/speech') || req.url?.endsWith('/v1/audio/speech'))) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const params = JSON.parse(body);
          const text = params.input || '';

          if (!text.trim()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'input text is required' }));
            return;
          }

          outputChannel.appendLine(`[TTS] Speaking: "${text.slice(0, 80)}..." (lang=${serverLang})`);

          const audioBuffer = await generateSpeechGtts(text, serverLang);

          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
          });
          res.end(audioBuffer);
        } catch (e: any) {
          outputChannel.appendLine(`[TTS] Error: ${e.message}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // OpenAI TTS API also uses GET for list voices
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'tts-1' }, { id: 'tts-1-hd' }] }));
      return;
    }

    if (req.method === 'GET' && req.url?.includes('/audio/voices')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'nova' }, { id: 'alloy' }, { id: 'echo' }, { id: 'fable' }, { id: 'onyx' }, { id: 'shimmer' }] }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  ttsServer.listen(port, '0.0.0.0', () => {
    outputChannel.appendLine(`[TTS] gTTS Server läuft auf http://localhost:${port}`);
    outputChannel.appendLine(`[TTS] OpenAI-kompatibler Endpunkt: http://localhost:${port}/v1/audio/speech`);
    updateStatusBar(true);
  });

  ttsServer.on('error', (e: any) => {
    outputChannel.appendLine(`[TTS] Server-Fehler: ${e.message}`);
    updateStatusBar(false);
  });
}

function stopTtsServer() {
  if (ttsServer) {
    ttsServer.close();
    ttsServer = null;
    outputChannel.appendLine('[TTS] Server gestoppt');
  }
  updateStatusBar(false);
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function updateStatusBar(running: boolean) {
  if (!statusBarItem) return;
  statusBarItem.text = running ? '$(megaphone) TTS' : '$(megaphone) TTS (off)';
  statusBarItem.tooltip = running
    ? `Zero-Token TTS Server läuft auf Port ${serverPort}\nIn OpenChamber einstellen: openaiCompatibleUrl = http://localhost:${serverPort}`
    : 'TTS Server gestoppt';
  statusBarItem.backgroundColor = running ? undefined : new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
}

// ─── Webview Panel (Read Aloud) ──────────────────────────────────────────────

function getWebviewContent(text: string): string {
  const safeText = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/"/g, '\\"');
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, sans-serif; padding: 1rem; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
  .text { margin: 1rem 0; padding: 1rem; border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; }
  button { padding: 0.5rem 1rem; cursor: pointer; font-size: 1rem; margin: 0.25rem; }
  .status { margin-top: 0.5rem; font-style: italic; color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<h2>Sprachausgabe</h2>
<div class="text" id="text">${safeText}</div>
<button id="playBtn">▶ Abspielen</button>
<button id="stopBtn">■ Stop</button>
<div class="status" id="status"></div>
<script>
  const text = document.getElementById('text').textContent;
  const status = document.getElementById('status');
  let utterance = null;

  document.getElementById('playBtn').onclick = () => {
    window.speechSynthesis.cancel();
    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.9;
    utterance.onstart = () => status.textContent = '🔊 Wiedergabe läuft...';
    utterance.onend = () => status.textContent = '✅ Fertig';
    utterance.onerror = (e) => status.textContent = '❌ Fehler: ' + e.error;
    window.speechSynthesis.speak(utterance);
  };

  document.getElementById('stopBtn').onclick = () => {
    window.speechSynthesis.cancel();
    status.textContent = '⏹ Gestoppt';
  };

  // Auto-play on load
  setTimeout(() => document.getElementById('playBtn').click(), 500);
</script>
</body>
</html>`;
}

function showTtsPanel(text: string) {
  if (ttsPanel) {
    ttsPanel.reveal();
  } else {
    ttsPanel = vscode.window.createWebviewPanel(
      'zeroTokenTts',
      'Zero-Token TTS',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    ttsPanel.onDidDispose(() => { ttsPanel = null; });
  }
  ttsPanel.webview.html = getWebviewContent(text);
}

// ─── Clipboard reading ───────────────────────────────────────────────────────

async function readClipboard(): Promise<string> {
  try {
    return await vscode.env.clipboard.readText();
  } catch {
    return '';
  }
}

function startClipboardPolling() {
  stopClipboardPolling();
  lastClipboardText = '';
  clipboardPollTimer = setInterval(async () => {
    try {
      const text = await readClipboard();
      if (text && text !== lastClipboardText && text.length > 3) {
        lastClipboardText = text;
        outputChannel.appendLine(`[Auto-Read] Neue Zwischenablage: "${text.slice(0, 60)}..."`);
        showTtsPanel(text);
      }
    } catch {}
  }, 2000);
}

function stopClipboardPolling() {
  if (clipboardPollTimer) {
    clearInterval(clipboardPollTimer);
    clipboardPollTimer = null;
  }
}

// ─── Activation ──────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Zero-Token TTS');
  outputChannel.appendLine('[TTS] Extension aktiviert');

  const config = vscode.workspace.getConfiguration('zero-token-tts');
  serverPort = config.get<number>('serverPort', 18765);
  const language = config.get<string>('language', 'de');
  const serverEnabled = config.get<boolean>('serverEnabled', true);
  const autoReadClipboard = config.get<boolean>('autoReadClipboard', false);

  // Check gTTS
  const gttsOk = checkGttsInstalled();
  if (!gttsOk) {
    vscode.window.showWarningMessage(
      'gTTS ist nicht installiert. Bitte führe aus: pip install gtts',
      'Installieren'
    ).then(selection => {
      if (selection === 'Installieren') {
        const terminal = vscode.window.createTerminal('gTTS Install');
        terminal.sendText('pip install gtts');
        terminal.show();
      }
    });
  }

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'zero-token-tts.showStatus';
  context.subscriptions.push(statusBarItem);

  // Start server
  if (serverEnabled && gttsOk) {
    startTtsServer(serverPort, language);
  } else {
    updateStatusBar(false);
  }

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('zero-token-tts.readClipboard', async () => {
      const text = await readClipboard();
      if (!text.trim()) {
        vscode.window.showInformationMessage('Zwischenablage ist leer');
        return;
      }
      showTtsPanel(text);
    }),

    vscode.commands.registerCommand('zero-token-tts.readSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('Kein Editor geöffnet');
        return;
      }
      const text = editor.document.getText(editor.selection);
      if (!text.trim()) {
        vscode.window.showInformationMessage('Kein Text ausgewählt');
        return;
      }
      showTtsPanel(text);
    }),

    vscode.commands.registerCommand('zero-token-tts.openViewer', () => {
      showTtsPanel('Gib hier deinen Text ein... (verwende "Zwischenablage vorlesen" oder "Auswahl vorlesen")');
    }),

    vscode.commands.registerCommand('zero-token-tts.showStatus', () => {
      const active = ttsServer?.listening;
      const msg = active
        ? `✅ TTS Server läuft auf Port ${serverPort}\n\n` +
          `In OpenChamber einstellen:\n` +
          `• voiceProvider: "openai-compatible"\n` +
          `• openaiCompatibleUrl: "http://localhost:${serverPort}"\n` +
          `• openaiCompatibleApiKey: "not-required"\n` +
          `• showMessageTTSButtons: true`
        : '❌ TTS Server läuft nicht';
      const autoMsg = autoReadClipboard ? '\n\n📋 Auto-Read: aktiviert' : '';
      vscode.window.showInformationMessage(msg + autoMsg);
    })
  );

  // Config change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('zero-token-tts')) return;
      const newConfig = vscode.workspace.getConfiguration('zero-token-tts');
      const newPort = newConfig.get<number>('serverPort', 18765);
      const newLang = newConfig.get<string>('language', 'de');
      const newServerEnabled = newConfig.get<boolean>('serverEnabled', true);

      if (newPort !== serverPort || newServerEnabled !== serverEnabled) {
        serverPort = newPort;
        if (newServerEnabled && gttsOk) {
          startTtsServer(serverPort, newLang);
        } else {
          stopTtsServer();
        }
      }

      const newAutoRead = newConfig.get<boolean>('autoReadClipboard', false);
      if (newAutoRead !== autoReadClipboard) {
        if (newAutoRead) startClipboardPolling();
        else stopClipboardPolling();
      }
    })
  );

  // Auto-read clipboard
  if (autoReadClipboard) {
    startClipboardPolling();
  }

  outputChannel.appendLine('[TTS] Extension bereit');
}

export function deactivate() {
  stopTtsServer();
  stopClipboardPolling();
  if (ttsPanel) {
    ttsPanel.dispose();
    ttsPanel = null;
  }
  outputChannel.dispose();
}
