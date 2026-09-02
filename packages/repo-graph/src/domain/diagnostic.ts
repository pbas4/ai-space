export const ExitCode = {
  Ok: 0,
  InvalidInput: 2,
  MissingOrStaleIndex: 3,
  PartialExtraction: 4,
  InternalFailure: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export type DiagnosticLevel = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  level: DiagnosticLevel;
  message: string;
  file?: string;
}

const QUOTED_ABSOLUTE_PATH_IN_MESSAGE =
  /(["'`])(?:[A-Za-z]:[\\/]|\\\\|\/)(?:(?!\1)[^\r\n<>])*\1/gu;

const ABSOLUTE_PATH_IN_MESSAGE =
  /(^|[^\p{L}\p{N}_.-])((?:[A-Za-z]:[\\/]|\\\\|\/)[^\s"'`<>]*)/gu;

export function redactAbsolutePaths(message: string): string {
  return message
    .replace(
      QUOTED_ABSOLUTE_PATH_IN_MESSAGE,
      (_match, quote: string) => `${quote}[absolute path]${quote}`,
    )
    .replace(
      ABSOLUTE_PATH_IN_MESSAGE,
      (_match, prefix: string) => `${prefix}[absolute path]`,
    );
}

export function redactDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return { ...diagnostic, message: redactAbsolutePaths(diagnostic.message) };
}

export type Result<T> =
  | { ok: true; value: T; diagnostics: Diagnostic[] }
  | { ok: false; exitCode: ExitCode; diagnostics: Diagnostic[] };
