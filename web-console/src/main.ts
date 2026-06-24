import App from "./App.svelte";
import TerminalDock from "./components/TerminalDock.svelte";
import "./responsive.css";
import { mount } from "svelte";
import { installRemoteLoginInterceptor } from "./lib/remote-login-interceptor";

installRemoteLoginInterceptor();

const app = mount(App, {
  target: document.getElementById("app")!,
});

const terminalStyle = document.createElement("style");
terminalStyle.textContent = `
  #terminal-dock-root {
    position: fixed;
    left: 248px;
    right: 0;
    bottom: 0;
    z-index: 75;
    pointer-events: none;
  }
  #terminal-dock-root > * { pointer-events: auto; }
  @media (max-width: 900px) {
    #terminal-dock-root { left: 0; }
  }
`;
document.head.appendChild(terminalStyle);

const terminalTarget = document.createElement("div");
terminalTarget.id = "terminal-dock-root";
document.body.appendChild(terminalTarget);
mount(TerminalDock, { target: terminalTarget });

export default app;
