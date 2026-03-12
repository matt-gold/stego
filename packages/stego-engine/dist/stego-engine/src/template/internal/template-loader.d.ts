import type { StegoTemplate } from "../public/types.ts";
export type LoadedTemplate = {
    template: StegoTemplate;
    cleanup: () => void;
};
export declare function loadTemplateFromFile(templatePath: string): Promise<LoadedTemplate>;
//# sourceMappingURL=template-loader.d.ts.map