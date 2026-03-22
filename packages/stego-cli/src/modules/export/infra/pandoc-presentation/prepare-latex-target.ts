import type { PandocPresentationBackendDocument } from "@stego-labs/engine";
import type { PreparedRenderedExport } from "./types.ts";
import { prepareLatexMetadata } from "./prepare-latex-metadata.ts";
import { writeTempMetadataFile } from "./write-temp-metadata-file.ts";

export function prepareLatexTarget(
  backendDocument: PandocPresentationBackendDocument,
): PreparedRenderedExport {
  const metadata = prepareLatexMetadata(
    backendDocument.presentation.page,
    backendDocument.presentation.features,
  );
  const tempMetadata = Object.keys(metadata).length > 0
    ? writeTempMetadataFile(metadata)
    : null;

  return {
    inputFormat: backendDocument.source.inputFormat,
    resourcePaths: backendDocument.source.resourcePaths,
    requiredFilters: backendDocument.source.requiredFilters,
    extraArgs: tempMetadata ? ["--metadata-file", tempMetadata.path] : [],
    cleanup: () => {
      tempMetadata?.cleanup();
    },
  };
}
