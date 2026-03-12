const EXIT_CODES = {
    INVALID_USAGE: 2,
    WORKSPACE_NOT_FOUND: 3,
    PROJECT_NOT_FOUND: 3,
    INVALID_CONFIGURATION: 4,
    INVALID_PAYLOAD: 4,
    VALIDATION_FAILED: 5,
    COMMENT_APPENDIX_INVALID: 5,
    WRITE_FAILURE: 6,
    TOOLING_MISSING: 7,
    INTERNAL_ERROR: 1
};
export function getExitCodeForError(code) {
    return EXIT_CODES[code] ?? 1;
}
//# sourceMappingURL=exit-codes.js.map