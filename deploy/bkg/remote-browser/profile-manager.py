#!/usr/bin/env python3
import json
import os
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

DISPLAY = os.environ.get("DISPLAY", ":99")
WIDTH = int(os.environ.get("NOVA_BROWSER_WIDTH", "1280"))
HEIGHT = int(os.environ.get("NOVA_BROWSER_HEIGHT", "900"))
DATA_ROOT = Path("/data/chromium/profiles")
MANAGER_PORT = int(os.environ.get("NOVA_BROWSER_MANAGER_PORT", "9221"))

PROFILE_PORTS = {
    "chatgpt": 9301,
    "claude": 9302,
    "gemini": 9303,
    "deepseek": 9304,
    "grok": 9305,
    "perplexity": 9306,
    "qwen": 9307,
    "qwen-cn": 9308,
    "kimi": 9309,
    "doubao": 9310,
    "glm": 9311,
    "glm-intl": 9312,
    "xiaomimo": 9313,
}

DEFAULT_URLS = {
    "chatgpt": "https://chatgpt.com",
    "claude": "https://claude.ai/new",
    "gemini": "https://gemini.google.com",
    "deepseek": "https://chat.deepseek.com",
    "grok": "https://grok.com",
    "perplexity": "https://www.perplexity.ai",
    "qwen": "https://chat.qwen.ai",
    "qwen-cn": "https://www.qianwen.com",
    "kimi": "https://kimi.moonshot.cn",
    "doubao": "https://www.doubao.com",
    "glm": "https://chatglm.cn",
    "glm-intl": "https://chat.z.ai",
    "xiaomimo": "https://xiaomimo.com",
}

lock = threading.RLock()
processes = {}


def safe_profile(value: str) -> str:
    if value not in PROFILE_PORTS:
        raise ValueError(f"unknown provider profile: {value}")
    return value


def profile_dir(profile: str) -> Path:
    return DATA_ROOT / safe_profile(profile)


def remove_singletons(path: Path) -> None:
    for name in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            (path / name).unlink()
        except FileNotFoundError:
            pass


def is_running(proc) -> bool:
    return proc is not None and proc.poll() is None


def stop_profile(profile: str) -> None:
    with lock:
        state = processes.pop(profile, None)
    if not state:
        return
    for key in ("chromium", "socat"):
        proc = state.get(key)
        if not is_running(proc):
            continue
        proc.terminate()
        try:
            proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)


def wait_for_cdp(port: int, timeout: float = 20.0) -> bool:
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1.0) as response:
                if response.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def start_profile(profile: str, target_url: str = "") -> dict:
    profile = safe_profile(profile)
    with lock:
        current = processes.get(profile)
        if current and is_running(current.get("chromium")) and is_running(current.get("socat")):
            return status(profile)

    path = profile_dir(profile)
    path.mkdir(parents=True, exist_ok=True)
    remove_singletons(path)

    external_port = PROFILE_PORTS[profile]
    internal_port = external_port + 100
    index = list(PROFILE_PORTS).index(profile)
    window_width = max(900, WIDTH - 80)
    window_height = max(650, HEIGHT - 100)
    x_pos = 20 + (index % 4) * 24
    y_pos = 20 + (index % 4) * 24
    url = target_url or DEFAULT_URLS[profile]

    socat_log = open(f"/tmp/socat-{profile}.log", "ab", buffering=0)
    chromium_log = open(f"/tmp/chromium-{profile}.log", "ab", buffering=0)

    socat = subprocess.Popen(
        [
            "socat",
            f"TCP-LISTEN:{external_port},bind=0.0.0.0,reuseaddr,fork",
            f"TCP:127.0.0.1:{internal_port}",
        ],
        stdout=socat_log,
        stderr=subprocess.STDOUT,
    )
    chromium = subprocess.Popen(
        [
            "chromium",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--remote-debugging-address=127.0.0.1",
            f"--remote-debugging-port={internal_port}",
            "--remote-allow-origins=*",
            f"--user-data-dir={path}",
            f"--window-size={window_width},{window_height}",
            f"--window-position={x_pos},{y_pos}",
            f"--class=Nova-{profile}",
            "--new-window",
            url,
        ],
        env={**os.environ, "DISPLAY": DISPLAY},
        stdout=chromium_log,
        stderr=subprocess.STDOUT,
    )

    with lock:
        processes[profile] = {
            "chromium": chromium,
            "socat": socat,
            "external_port": external_port,
            "internal_port": internal_port,
            "profile_dir": str(path),
            "url": url,
        }

    if not wait_for_cdp(internal_port):
        stop_profile(profile)
        raise RuntimeError(f"Chromium CDP did not become ready for {profile}")
    return status(profile)


def reset_profile(profile: str, target_url: str = "") -> dict:
    profile = safe_profile(profile)
    stop_profile(profile)
    path = profile_dir(profile)
    if path.exists():
        shutil.rmtree(path)
    return start_profile(profile, target_url)


def status(profile: str) -> dict:
    profile = safe_profile(profile)
    with lock:
        state = processes.get(profile)
    running = bool(state and is_running(state.get("chromium")) and is_running(state.get("socat")))
    return {
        "profile": profile,
        "running": running,
        "cdpPort": PROFILE_PORTS[profile],
        "profileDir": str(profile_dir(profile)),
        "url": state.get("url") if state else DEFAULT_URLS[profile],
    }


def all_status() -> list:
    return [status(profile) for profile in PROFILE_PORTS]


class Handler(BaseHTTPRequestHandler):
    def send_json(self, code: int, payload) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_json(200, {"status": "ok", "profiles": all_status()})
            return
        if parsed.path == "/profiles":
            self.send_json(200, all_status())
            return
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "profiles":
            try:
                self.send_json(200, status(parts[1]))
            except ValueError as error:
                self.send_json(404, {"error": str(error)})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        parts = self.path.strip("/").split("/")
        if len(parts) != 3 or parts[0] != "profiles":
            self.send_json(404, {"error": "not found"})
            return
        profile, action = parts[1], parts[2]
        try:
            body = self.read_json()
            url = str(body.get("url") or "")
            if action == "start":
                result = start_profile(profile, url)
            elif action == "reset":
                result = reset_profile(profile, url)
            elif action == "stop":
                stop_profile(profile)
                result = status(profile)
            else:
                self.send_json(404, {"error": "unknown action"})
                return
            self.send_json(200, result)
        except ValueError as error:
            self.send_json(404, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": str(error)})

    def log_message(self, fmt, *args):
        print(f"[profile-manager] {self.address_string()} {fmt % args}", flush=True)


def shutdown(*_args):
    for profile in list(PROFILE_PORTS):
        stop_profile(profile)
    raise SystemExit(0)


if __name__ == "__main__":
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server = ThreadingHTTPServer(("0.0.0.0", MANAGER_PORT), Handler)
    print(f"[profile-manager] listening on 0.0.0.0:{MANAGER_PORT}", flush=True)
    server.serve_forever()
