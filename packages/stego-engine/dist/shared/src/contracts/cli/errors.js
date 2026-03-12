import { getExitCodeForError } from "./exit-codes.js";
export class CliError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = "CliError";
        this.code = code;
        this.details = details;
    }
    get exitCode() {
        return getExitCodeForError(this.code);
    }
}
//# sourceMappingURL=errors.js.map