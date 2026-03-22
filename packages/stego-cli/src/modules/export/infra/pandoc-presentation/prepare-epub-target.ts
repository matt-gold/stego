import type { PandocPresentationBackendDocument } from "@stego-labs/engine";
import type { PreparedRenderedExport } from "./types.ts";

export function prepareEpubTarget(
  backendDocument: PandocPresentationBackendDocument,
): PreparedRenderedExport {
  return {
    inputFormat: backendDocument.source.inputFormat,
    resourcePaths: backendDocument.source.resourcePaths,
    requiredFilters: backendDocument.source.requiredFilters,
    cleanup: () => {},
  };
}
