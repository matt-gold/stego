export function assertTemplateModule(value) {
    if (typeof value === "object"
        && value !== null
        && value.kind === "stego-template"
        && typeof value.render === "function") {
        return value;
    }
    throw new Error("Template must default export defineTemplate(...).");
}
export function evaluateTemplate(template, context) {
    const document = template.render(context);
    if (!document || document.kind !== "document") {
        throw new Error("Template render() must return <Stego.Document>.");
    }
    return document;
}
//# sourceMappingURL=evaluate-template.js.map