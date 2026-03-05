export type QualityIssue = {
  readonly level: "error" | "warning";
  readonly message: string;
};
