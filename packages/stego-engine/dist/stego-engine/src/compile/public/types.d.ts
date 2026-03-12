import type { StegoDocumentNode } from "../../ir/index.ts";
import type { TemplateContext } from "../../template/index.ts";
export type CompileProjectInput = {
    projectRoot: string;
    manuscriptDir?: string;
    spineDir?: string;
    templatePath?: string;
};
export type CompileProjectResult = {
    projectRoot: string;
    templatePath: string;
    document: StegoDocumentNode;
    context: TemplateContext;
};
export type BuildTemplateContextInput = {
    projectRoot: string;
    manuscriptDir?: string;
    spineDir?: string;
};
//# sourceMappingURL=types.d.ts.map