import type { PresentationExportAdapter } from "../../domain/presentation-adapter.ts";
import { prepareDocxTarget } from "./prepare-docx-target.ts";
import { prepareEpubTarget } from "./prepare-epub-target.ts";
import { prepareLatexTarget } from "./prepare-latex-target.ts";
import { preparePdfTarget } from "./prepare-pdf-target.ts";

export const pandocPresentationExportAdapter: PresentationExportAdapter = {
  backend: "pandoc-presentation",
  prepareExport(input) {
    switch (input.format) {
      case "docx":
        return prepareDocxTarget(input.backendDocument);
      case "latex":
        return prepareLatexTarget(input.backendDocument);
      case "pdf":
        return preparePdfTarget(input.backendDocument);
      case "epub":
        return prepareEpubTarget(input.backendDocument);
    }
  }
};
