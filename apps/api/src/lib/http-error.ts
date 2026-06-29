// Standard app error carrying an HTTP status + machine code. The error
// middleware (middleware/errors.ts) turns this into the standard error shape
// `{ error: { code, message } }` from docs/07.
export type HttpError = Error & { status: number; code: string };

export function httpError(message: string, status: number, code: string): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  err.code = code;
  return err;
}
