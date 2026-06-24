import App from "./App.svelte";
import { mount } from "svelte";
import { installRemoteLoginInterceptor } from "./lib/remote-login-interceptor";

installRemoteLoginInterceptor();

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
