export type Result<TOk, TErr> = {
    ok: true;
    value: TOk;
} | {
    ok: false;
    error: TErr;
};
export declare function ok<TOk>(value: TOk): Result<TOk, never>;
export declare function err<TErr>(error: TErr): Result<never, TErr>;
//# sourceMappingURL=result.d.ts.map