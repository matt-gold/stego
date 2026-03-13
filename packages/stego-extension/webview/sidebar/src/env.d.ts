declare function acquireVsCodeApi<TState = unknown>(): {
  postMessage(message: unknown): void;
  getState(): TState;
  setState(state: TState): void;
};
