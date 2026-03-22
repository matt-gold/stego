import type { PandocPresentationBackendDocument } from "@stego-labs/engine";
import type { PreparedRenderedExport } from "./types.ts";
import { prepareLatexTarget } from "./prepare-latex-target.ts";

export function preparePdfTarget(
  backendDocument: PandocPresentationBackendDocument,
): PreparedRenderedExport {
  const preparedLatex = prepareLatexTarget(backendDocument);
  return {
    ...preparedLatex,
    postprocess: {
      ...preparedLatex.postprocess,
      pdf: {
        requiresXelatex: backendDocument.presentation.features.requiresNamedFontEngine,
      },
    },
  };
}
