import { env } from "../env";
import { jitsiLiveProvider } from "./jitsi";
import { livekitProvider } from "./livekit";
import { mockLiveProvider } from "./mock";
import type { LiveProvider } from "./provider";

export function getLiveProvider(): LiveProvider {
  if (env.liveProvider === "livekit") return livekitProvider;
  if (env.liveProvider === "jitsi") return jitsiLiveProvider;
  return mockLiveProvider;
}

export * from "./provider";
