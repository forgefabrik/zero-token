import { afterEach, describe, expect, it } from "vitest";
import { createDiscoveryRoutes } from "../src/zero-token/discovery/discovery-routes.js";

const previousCdp = process.env.NOVA_CDP_URL;
const previousView = process.env.NOVA_REMOTE_LOGIN_VIEW_URL;

afterEach(() => {
  if (previousCdp === undefined) delete process.env.NOVA_CDP_URL;
  else process.env.NOVA_CDP_URL = previousCdp;
  if (previousView === undefined) delete process.env.NOVA_REMOTE_LOGIN_VIEW_URL;
  else process.env.NOVA_REMOTE_LOGIN_VIEW_URL = previousView;
});

describe("server login configuration", () => {
  it("does not attempt a local browser when remote login is unconfigured", async () => {
    delete process.env.NOVA_CDP_URL;
    delete process.env.NOVA_REMOTE_LOGIN_VIEW_URL;

    const response = await createDiscoveryRoutes().request("/logins");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ configured: false, jobs: [] });
  });

  it("reports a configured remote login view", async () => {
    process.env.NOVA_CDP_URL = "http://127.0.0.1:9222";
    process.env.NOVA_REMOTE_LOGIN_VIEW_URL = "https://nova.example.test/remote-browser/";

    const response = await createDiscoveryRoutes().request("/logins");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ configured: true, jobs: [] });
  });
});
