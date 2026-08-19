import { env } from "../env";
import { livekitProvider } from "./livekit";
import { mockLiveProvider } from "./mock";
import type { LiveProvider } from "./provider";

export function getLiveProvider(): LiveProvider {
  return env.liveProvider === "livekit" ? livekitProvider : mockLiveProvider;
}

export * from "./provider";
