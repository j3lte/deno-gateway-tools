import { assertEquals, assertNotEquals } from "../dev_deps.ts";

import { gateway4, gateway6 } from "../src/mod.ts";
import { env } from "node:process";
import { isIPv4, isIPv6 } from "node:net";
import { platform } from "node:os";

// only Darwin has IPv6 on GitHub Actions
const canTestV6 = env.CI ? platform() === "darwin" : false;

Deno.test("gateway4", async () => {
  const result = await gateway4();
  assertEquals(isIPv4(result.gateway), true);
  assertEquals(result.version, 4);
  assertNotEquals(result.int, null);
});

Deno.test("gateway6", async () => {
  if (!canTestV6) return;
  const result = await gateway6();
  assertEquals(isIPv6(result.gateway), true);
  assertEquals(result.version, 6);
  assertNotEquals(result.int, null);
});
