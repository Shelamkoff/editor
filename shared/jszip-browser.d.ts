declare module 'jszip/dist/jszip.min.js' {
  type ZipRuntime = new () => {
    file(name: string, content: Uint8Array): unknown
    generateAsync(options: { type: 'uint8array' }): Promise<Uint8Array>
  }
  const JSZip: ZipRuntime
  export default JSZip
}
