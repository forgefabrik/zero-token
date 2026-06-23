#!/usr/bin/env node

import {
  getDiscoveredModelCandidates,
  getDiscoverySnapshot,
  runProviderDiscovery,
} from "./zero-token/discovery/discovery-service.js";

const command = process.argv[2] ?? "list";

if (command === "scan") {
  const snapshot = await runProviderDiscovery();
  console.log(JSON.stringify(snapshot, null, 2));
  process.exitCode = snapshot.errors.length > 0 ? 1 : 0;
} else if (command === "models") {
  console.log(JSON.stringify(await getDiscoveredModelCandidates(), null, 2));
} else {
  const snapshot = await getDiscoverySnapshot();
  for (const provider of snapshot.providers) {
    console.log(
      `${provider.id.padEnd(24)} ${provider.status.padEnd(10)} ${provider.label} (${provider.models.length} Modelle)`,
    );
  }
}
