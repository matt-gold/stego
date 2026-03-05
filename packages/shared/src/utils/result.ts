export type Result<TOk, TErr> =
  | { ok: true; value: TOk }
  | { ok: false; error: TErr };

export function ok<TOk>(value: TOk): Result<TOk, never> {
  return { ok: true, value };
}

export function err<TErr>(error: TErr): Result<never, TErr> {
  return { ok: false, error };
}
