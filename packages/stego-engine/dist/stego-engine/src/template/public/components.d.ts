import { type AlignValue, type IndentValue, type InsetValue, type PageRegionSpec, type PageSpec, type SizeValue, type SpacingValue, type StegoDocumentNode, type StegoFragmentNode, type StegoHeadingNode, type StegoImageNode, type StegoMarkdownNode, type StegoPageBreakNode, type StegoPageNumberNode, type StegoPageTemplateNode, type StegoParagraphNode, type StegoSectionNode } from "../../ir/index.ts";
export declare function Document(props: {
    page?: PageSpec;
    children?: unknown;
}): StegoDocumentNode;
export declare function Fragment(props: {
    children?: unknown;
}): StegoFragmentNode;
export declare function Section(props: {
    role?: StegoSectionNode["role"];
    id?: string;
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
    children?: unknown;
}): StegoSectionNode;
export declare function Heading(props: {
    level: StegoHeadingNode["level"];
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    align?: AlignValue;
    children?: unknown;
}): StegoHeadingNode;
export declare function Paragraph(props: {
    spaceBefore?: SpacingValue;
    spaceAfter?: SpacingValue;
    insetLeft?: InsetValue;
    insetRight?: InsetValue;
    firstLineIndent?: IndentValue;
    align?: AlignValue;
    children?: unknown;
}): StegoParagraphNode;
export declare function Markdown(props: {
    source: string;
}): StegoMarkdownNode;
export declare function Image(props: {
    src: string;
    alt?: string;
    width?: SizeValue;
    height?: SizeValue;
    layout?: "block" | "inline";
    align?: AlignValue;
    caption?: string;
}): StegoImageNode;
export declare function PageBreak(): StegoPageBreakNode;
export declare function PageTemplate(props: {
    header?: PageRegionSpec;
    footer?: PageRegionSpec;
}): StegoPageTemplateNode;
export declare function PageNumber(): StegoPageNumberNode;
export declare const Stego: {
    readonly Document: typeof Document;
    readonly Fragment: typeof Fragment;
    readonly Section: typeof Section;
    readonly Heading: typeof Heading;
    readonly Paragraph: typeof Paragraph;
    readonly Markdown: typeof Markdown;
    readonly Image: typeof Image;
    readonly PageBreak: typeof PageBreak;
    readonly PageTemplate: typeof PageTemplate;
    readonly PageNumber: typeof PageNumber;
};
//# sourceMappingURL=components.d.ts.map