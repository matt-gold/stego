import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoNode, StegoSectionNode } from "../types.ts";
export declare function createSectionNode(props: {
    role?: StegoSectionNode["role"];
    id?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
}, children: StegoNode[]): StegoSectionNode;
//# sourceMappingURL=section.d.ts.map