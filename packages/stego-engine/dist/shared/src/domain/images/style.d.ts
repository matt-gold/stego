export declare const IMAGE_STYLE_KEYS: readonly ["width", "height", "classes", "id", "attrs", "layout", "align"];
export declare const IMAGE_GLOBAL_KEYS: Set<string>;
export type ImageLayout = "block" | "inline";
export type ImageAlign = "left" | "center" | "right";
export type ImageStyle = {
    width?: string;
    height?: string;
    id?: string;
    classes?: string[];
    attrs?: Record<string, string>;
    layout?: ImageLayout;
    align?: ImageAlign;
};
export declare function asPlainRecord(value: unknown): Record<string, unknown> | undefined;
export declare function normalizeImageScalar(value: unknown): string | undefined;
export declare function normalizeImageClasses(value: unknown): string[] | undefined;
export declare function normalizeImageAttrs(value: unknown): Record<string, string> | undefined;
export declare function cloneImageStyle(style: ImageStyle | undefined): ImageStyle;
export declare function mergeImageStyles(base: ImageStyle, override: ImageStyle): ImageStyle;
export declare function isImageStyleEmpty(style: ImageStyle | undefined): boolean;
export declare function parseImageStyle(value: unknown): ImageStyle | undefined;
export declare function normalizeImagePathKey(value: string): string;
export declare function extractImageDestinationTarget(value: string): string;
export declare function stripImageQueryAndAnchor(target: string): string;
export declare function isExternalImageTarget(target: string): boolean;
export declare function inferEffectiveImageLayout(style: ImageStyle): ImageLayout | undefined;
//# sourceMappingURL=style.d.ts.map