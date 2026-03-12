export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export function isValidProjectId(value) {
    return PROJECT_ID_PATTERN.test(value);
}
//# sourceMappingURL=index.js.map