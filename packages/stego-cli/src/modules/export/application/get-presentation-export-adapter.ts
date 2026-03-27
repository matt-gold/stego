import { CliError } from "@stego-labs/shared/contracts/cli";
import type { RenderDocumentResult } from "@stego-labs/engine";
import type { PresentationExportAdapter } from "../domain/presentation-adapter.ts";
import { pandocPresentationExportAdapter } from "../infra/pandoc-presentation/adapter.ts";

const presentationExportAdapters: Record<RenderDocumentResult["backend"], PresentationExportAdapter> = {
  "pandoc-presentation": pandocPresentationExportAdapter,
};

export function getPresentationExportAdapter(
  backend: RenderDocumentResult["backend"],
): PresentationExportAdapter {
  const adapter = presentationExportAdapters[backend];
  if (adapter) {
    return adapter;
  }

  throw new CliError("INTERNAL_ERROR", `No presentation export adapter is registered for backend '${backend}'.`);
}
