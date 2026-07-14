import DefaultTheme from 'vitepress/theme-without-fonts'
import HomePage from './components/HomePage.vue'
import './styles/custom.css'

const SEARCH_HOTKEY_FLAG = '__rectorSearchHotkeyInstalled__'

function installSearchHotkey() {
  if (typeof window === 'undefined') return
  const scopedWindow = window as Window & { [SEARCH_HOTKEY_FLAG]?: boolean }
  if (scopedWindow[SEARCH_HOTKEY_FLAG]) return
  scopedWindow[SEARCH_HOTKEY_FLAG] = true

  window.addEventListener('keydown', (event) => {
    if (event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
    event.preventDefault()
    event.stopImmediatePropagation()

    const openInput = document.querySelector<HTMLInputElement>('.VPLocalSearchBox .search-input')
    if (openInput) {
      openInput.focus()
      return
    }
    document.querySelector<HTMLButtonElement>('.VPNavBarSearchButton')?.click()
  }, { capture: true })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomePage', HomePage)
    installSearchHotkey()
  },
}
