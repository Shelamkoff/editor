import { register as sourceEditorLifetime } from './source-editor-lifetime.js'
import { register as fileInputLifetime } from './file-input-lifetime.js'
import { register as embedRendererRealm } from './embed-renderer-realm.js'
import { register as galleryRendererLifetime } from './gallery-renderer-lifetime.js'

export function register() {
  sourceEditorLifetime()
  fileInputLifetime()
  embedRendererRealm()
  galleryRendererLifetime()
}
