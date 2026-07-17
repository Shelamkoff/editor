interface HighlightRuntime {
  highlightAuto(code: string): { value: string; language?: string }
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string }
  getLanguage(language: string): unknown
}

declare const runtime: HighlightRuntime
export default runtime
