export const EXPORT_TARGETS = ["md", "docx", "pdf", "epub"] as const;
export const PRESENTATION_TARGETS = ["docx", "pdf", "epub"] as const;

export type ExportTarget = (typeof EXPORT_TARGETS)[number];
export type PresentationTarget = (typeof PRESENTATION_TARGETS)[number];

export const TARGET_CAPABILITIES = {
  docx: {
    pageLayout: true,
    pageTemplate: true,
    pageNumber: true,
    keepTogether: true,
    pageBreak: true,
    spacing: true,
    inset: true,
    indent: true,
    align: true,
    imageAlign: true,
    imageLayout: true
  },
  pdf: {
    pageLayout: true,
    pageTemplate: true,
    pageNumber: true,
    keepTogether: true,
    pageBreak: true,
    spacing: true,
    inset: true,
    indent: true,
    align: true,
    imageAlign: true,
    imageLayout: true
  },
  epub: {
    pageLayout: false,
    pageTemplate: false,
    pageNumber: false,
    keepTogether: false,
    pageBreak: false,
    spacing: false,
    inset: false,
    indent: false,
    align: false,
    imageAlign: false,
    imageLayout: false
  }
} as const;

export type TemplateCapability = keyof (typeof TARGET_CAPABILITIES)["docx"];

export function isExportTarget(value: string): value is ExportTarget {
  return EXPORT_TARGETS.includes(value as ExportTarget);
}

export function isPresentationTarget(value: string): value is PresentationTarget {
  return PRESENTATION_TARGETS.includes(value as PresentationTarget);
}
