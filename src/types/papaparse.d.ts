declare module 'papaparse' {
  // Fallback minimal types
  export interface ParseResult<T> {
    data: T[]
    errors: ParseError[]
    meta: ParseMeta
  }
  export function parse<T = any>(
    input: string | File,
    config?: ParseConfig<T>
  ): ParseResult<T>
  export function unparse(data: unknown, config?: unknown): string
  export interface ParseConfig<T = any> {
    delimiter?: string
    newline?: string
    quoteChar?: string
    escapeChar?: string
    header?: boolean
    dynamicTyping?: boolean | Record<string, boolean>
    preview?: number
    comments?: string | boolean
    download?: boolean
    downloadRequestBody?: string | Blob
    downloadRequestHeaders?: Record<string, string>
    skipEmptyLines?: boolean | string
    fastMode?: boolean
    withCredentials?: boolean
    worker?: boolean
    keepEmptyRows?: boolean
    transform?: (value: string, field: string | number) => any
    step?: (results: ParseResult<T>, parser: Parser<T>) => void
    complete?: (results: ParseResult<T>, file?: File) => void
    error?: (error: ParseError, file?: File) => void
    chunk?: (results: ParseResult<T>, parser: Parser<T>) => void
    beforeFirstChunk?: (chunk: string) => string | void
    transformHeader?: (header: string, index: number) => string
  }
  export interface ParseError {
    type: string
    code: string
    message: string
    row: number
  }
  export interface ParseMeta {
    delimiter: string
    linebreak: string
    aborted: boolean
    truncated: boolean
    cursor: number
    fields?: string[]
  }
  export interface Parser {
    abort(): void
    pause(): void
    resume(): void
  }
}
