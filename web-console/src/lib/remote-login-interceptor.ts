interface RemoteLoginResponse {
  id?: string;
  providerId?: string;
  viewUrl?: string;
  error?: string;
}

function showToast(message: string, isError = false): void {
  const existing = document.getElementById("nova-remote-login-toast");
  existing?.remove();

  const toast = document.createElement("div");
  toast.id = "nova-remote-login-toast";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    zIndex: "9999",
    maxWidth: "420px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: `1px solid ${isError ? "rgba(255,111,133,.55)" : "rgba(67,217,163,.45)"}`,
    background: "rgba(9,14,25,.96)",
    color: isError ? "#ff8ca0" : "#dffaf0",
    boxShadow: "0 18px 50px rgba(0,0,0,.35)",
    font: "13px/1.45 system-ui, sans-serif",
  });
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 6500);
}

function renderPopupMessage(popup: Window, title: string, message: string): void {
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="de"><meta charset="utf-8"><title>${title}</title><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#080d18;color:#edf1f8;font:16px system-ui"><main style="max-width:560px;padding:32px"><h1 style="font-size:24px">${title}</h1><p style="color:#91a0b8;line-height:1.6">${message}</p></main></body></html>`);
  popup.document.close();
}

async function startRemoteLogin(providerId: string, popup: Window): Promise<void> {
  renderPopupMessage(
    popup,
    "Nova Remote Login",
    "Der Remote-Browser auf dem Server wird vorbereitet …",
  );

  const response = await fetch("/api/discovery/logins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
  const payload = (await response.json().catch(() => ({}))) as RemoteLoginResponse;

  if (!response.ok || !payload.viewUrl) {
    const message = payload.error ?? `Remote-Login konnte nicht gestartet werden (HTTP ${response.status}).`;
    renderPopupMessage(popup, "Remote-Login nicht verfügbar", message);
    showToast(message, true);
    return;
  }

  popup.opener = null;
  popup.location.replace(payload.viewUrl);
  showToast("Remote-Login wurde in einem neuen Tab geöffnet.");
}

export function installRemoteLoginInterceptor(): void {
  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button.primary-action");
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;

      const card = button.closest("article.provider-card");
      const providerId = card?.querySelector(".provider-title code")?.textContent?.trim();
      if (!providerId) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const popup = window.open("about:blank", "_blank");
      if (!popup) {
        showToast("Der neue Login-Tab wurde blockiert. Erlaube Pop-ups für Nova.", true);
        return;
      }

      void startRemoteLogin(providerId, popup).catch((error) => {
        const message = error instanceof Error ? error.message : "Remote-Login ist fehlgeschlagen.";
        renderPopupMessage(popup, "Remote-Login fehlgeschlagen", message);
        showToast(message, true);
      });
    },
    true,
  );
}
