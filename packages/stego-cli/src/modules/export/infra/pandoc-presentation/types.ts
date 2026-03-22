import type { RunExportInput } from "../../types.ts";

export type PreparedRenderedExport = Pick<
  RunExportInput,
  "inputFormat" | "resourcePaths" | "requiredFilters" | "extraArgs" | "postprocess"
> & {
  cleanup: () => void;
};
