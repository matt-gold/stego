import type { AlignValue, IndentValue, InsetValue, SpacingValue, StegoNode, StegoParagraphNode } from "../types.ts";
export declare function createParagraphNode(props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
}, children: StegoNode[]): StegoParagraphNode;
//# sourceMappingURL=paragraph.d.ts.map