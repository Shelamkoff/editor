/** Opaque data owned by one committed inline widget instance. */
export interface EditorInlineWidget<
  Type extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  type: Type
  data: Data
}

/** Canonical persisted block shape shared by the editor and document renderer. */
export interface EditorBlockData<
  Type extends string = string,
  Data extends object = Record<string, unknown>,
> {
  id?: string
  /**
   * Optional producer-owned content revision (or stable content hash).
   * When present, incremental renderers can compare blocks in O(1).
   * The producer must change it whenever `data` or `inline` changes.
   */
  revision?: string | number
  type: Type
  data: Data
  tunes?: Record<string, unknown>
  inline?: Record<string, EditorInlineWidget>
}

/** Canonical editor output envelope. Composition layers may narrow fields. */
export interface EditorOutputData<
  Block extends EditorBlockData<string, object> = EditorBlockData,
> {
  time?: number
  version?: string
  blocks: Block[]
}
