import type { WebviewToHostMessage } from '../../src/shared/protocol';

interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}

let cached: VsCodeApi | undefined;

export function vscodeApi(): VsCodeApi {
  cached ??= acquireVsCodeApi();
  return cached;
}
