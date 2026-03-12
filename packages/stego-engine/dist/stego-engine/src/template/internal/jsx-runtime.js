import { Fragment } from "../public/components.js";
export { Fragment };
export function jsx(type, props) {
    return createElement(type, props);
}
export function jsxs(type, props) {
    return createElement(type, props);
}
function createElement(type, props) {
    if (typeof type !== "function") {
        throw new Error("Only Stego components and local helper functions are supported in templates.");
    }
    return type(props);
}
//# sourceMappingURL=jsx-runtime.js.map