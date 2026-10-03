export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type JsonObject = { [key: string]: Json }

/** Opaque data owned by one committed inline widget instance. */
export interface EditorInlineWidget<
  Type extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  type: Type
  /** Exact current schema version of this inline widget's persisted data. */
  dataVersion: number
  data: Data
}

/** Canonical persisted block shape shared by the editor and document renderer. */
export interface EditorBlockData<
  Type extends string = string,
  Data extends object = Record<string, unknown>,
> {
  id: string
  type: Type
  /** Exact current schema version of this block type's persisted data. */
  dataVersion: number
  data: Data
  /**
   * Optional producer-owned content revision (or stable content hash).
   * When present, incremental renderers can compare already validated blocks
   * in O(1). The producer must change it whenever data/tunes/inline changes.
   */
  revision?: string | number
  tunes?: Record<string, unknown>
  inline?: Record<string, EditorInlineWidget>
}

/** Canonical current Rector document envelope. */
export interface EditorOutputData<
  Block extends EditorBlockData<string, object> = EditorBlockData,
> {
  time?: number
  version: '2.0.0'
  blocks: Block[]
}
