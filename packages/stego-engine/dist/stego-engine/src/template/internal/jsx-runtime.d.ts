import type { StegoDocumentNode, StegoFragmentNode, StegoHeadingNode, StegoImageNode, StegoMarkdownNode, StegoNode, StegoPageBreakNode, StegoPageNumberNode, StegoPageTemplateNode, StegoParagraphNode, StegoSectionNode, StegoTextNode } from "../../ir/index.ts";
import { Fragment } from "../public/components.ts";
export { Fragment };
export declare namespace JSX {
    type Element = StegoNode | StegoDocumentNode | StegoFragmentNode | StegoSectionNode | StegoHeadingNode | StegoParagraphNode | StegoMarkdownNode | StegoImageNode | StegoPageBreakNode | StegoPageTemplateNode | StegoPageNumberNode | StegoTextNode;
    type ElementType = (props: any) => Element;
    interface ElementChildrenAttribute {
        children: unknown;
    }
    interface IntrinsicElements {
    }
    interface IntrinsicAttributes {
        key?: string | number;
    }
}
export declare function jsx<Props, Result extends JSX.Element>(type: (props: Props) => Result, props: Props): Result;
export declare function jsxs<Props, Result extends JSX.Element>(type: (props: Props) => Result, props: Props): Result;
//# sourceMappingURL=jsx-runtime.d.ts.map