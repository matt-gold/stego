export type WebviewApi = {
  postMessage(message: unknown): void;
  getState<TState = unknown>(): TState;
  setState<TState = unknown>(state: TState): void;
};

function createFallbackApi(): WebviewApi {
  let memoryState: unknown = undefined;
  return {
    postMessage: () => {
      // no-op for browser preview/tests
    },
    getState: <TState = unknown>() => memoryState as TState,
    setState: <TState = unknown>(state: TState) => {
      memoryState = state;
    }
  };
}

let cachedApi: WebviewApi | undefined;

export function getWebviewApi(): WebviewApi {
  if (cachedApi) {
    return cachedApi;
  }

  const acquireFromGlobal = (globalThis as { acquireVsCodeApi?: (() => WebviewApi) }).acquireVsCodeApi;
  const acquireFromScope = (() => {
    try {
      return typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi : undefined;
    } catch {
      return undefined;
    }
  })();
  const acquire = acquireFromGlobal ?? acquireFromScope;

  if (typeof acquire === 'function') {
    cachedApi = acquire();
    return cachedApi;
  }

  cachedApi = createFallbackApi();
  return cachedApi;
}

export function setWebviewApiForTest(api: WebviewApi | undefined): void {
  cachedApi = api;
}
