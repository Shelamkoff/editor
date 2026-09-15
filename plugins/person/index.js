import { sanitizeHtml } from '../../core/sanitize.js'
import { CropperDialog, cropperStylesUrl } from '@shelamkoff/cropper'
import { resolveSocialIcon, SOCIAL_ICONS } from './socialResolver.js'
import { BlockPluginAbstract } from '../BlockPluginAbstract.js'
import { sanitizeUrl, setSafeUrlAttribute } from '../../shared/sanitize/sanitizeUrl.js'
import { validatePersonData } from '../../shared/blockDataValidators.js'
import { normalizeTextValue } from '../../shared/textFormat.js'

const editorStyles = new URL('./person.css', import.meta.url).href
const cropperStyles = cropperStylesUrl

// Tabler icon: user-circle
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"/></svg>'

const ICON_CAMERA = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h-7a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v3.5"/><path d="M16 19h6"/><path d="M19 16v6"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg>'

const ICON_PLUS = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'

const ICON_REMOVE = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M18 6L6 18"/><path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12"/></svg>'

const ICON_LOADER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>'

const ICON_GRIP = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>'

/**
 * @typedef {{ avatar: string, name: string, role: string, bio: string, links: Array<{type: string, url: string}> }} PersonData
 * @typedef {Object} PersonConfig
 * @property {(file: File, context: { signal: AbortSignal }) => Promise<{ url: string }>} [uploadFile] Uploads the cropped avatar. When omitted, the cropped image is stored in the document as a data URL.
 * @property {Array<{ test: RegExp | ((url: string) => boolean), type: string, icon?: string }>} [socialResolvers] Additional URL classifiers for social links. The first matching resolver supplies the persisted `type`; `icon` is trusted application SVG/HTML.
 * @property {boolean} [injectStyles=true] Whether the editor should load the built-in person and cropper stylesheets.
 * @property {string} [css] Additional stylesheet URL, or the replacement URL when `injectStyles` is `false`.
 */

/**
 * @typedef {{
 *   data: { persons: PersonData[] },
 *   activeIdx: number,
 *   debounceTimers: Map<string, number>,
 *   dragFromIdx: number | null,
 *   cropperDialog: CropperDialog | null,
 *   avatarTasks: Map<PersonData, AbortController>,
 *   abortController: AbortController,
 *   context: import('../../core/types').BlockMutationContext,
 *   ownerDocument: Document,
 * }} PersonState
 */

/** @type {WeakMap<HTMLElement, PersonState>} */
const stateMap = new WeakMap()

/** @param {HTMLElement} element @returns {AbortController} */
function createAbortControllerFor(element) {
  const AbortControllerCtor = element.ownerDocument?.defaultView?.AbortController ?? AbortController
  return new AbortControllerCtor()
}


/**
 * Multi-person profile block with editable biography, links, ordering, and
 * optional avatar cropping.
 * @extends {BlockPluginAbstract<PersonConfig>}
 */
export class Person extends BlockPluginAbstract {
  static isTextBlock = false
  static styles = [editorStyles, cropperStyles]
  type = 'person'
  icon = ICON
  inlineTools = false

  /**
   * Create a Person instance with the supplied consumer configuration.
   * @param {PersonConfig} [config]
   */
  constructor(config) {
    super(config)
  }

  /**
   * Return the localized toolbox label for this block.
   * @returns {string}
   */
  get title() {
    return this._t('title', 'Person')
  }

  /** Create an empty profile for a new person tab. @returns {PersonData} */
  _defaultPerson() {
    return { avatar: '', name: '', role: '', bio: '', links: [] }
  }

  /** @returns {{ persons: PersonData[] }} */
  _defaultData() {
    return { persons: [this._defaultPerson()] }
  }
  /**
   * Create the editable DOM owned by this block instance.
   * @param {Record<string, unknown>} data
   * @param {import('../../core/types').BlockMutationContext} context
   * @returns {HTMLElement}
   */
  render(data, context) {
    const ownerDocument = context.ownerDocument ?? globalThis.document
    const raw = Array.isArray(data?.persons)
      ? /** @type {any[]} */ (data.persons).filter(person => person && typeof person === 'object' && !Array.isArray(person))
      : []
    const parsedData = {
      persons: raw.length > 0
        ? raw.map(p => ({
            avatar: sanitizeUrl(normalizeTextValue(p?.avatar), { policy: 'media', fallback: '' }),
            name: normalizeTextValue(p?.name),
            role: normalizeTextValue(p?.role),
            bio: normalizeTextValue(p?.bio),
            links: Array.isArray(p?.links)
              ? p.links.filter((/** @type {any} */ link) => link && typeof link === 'object' && !Array.isArray(link)).map((/** @type {any} */ l) => ({
                  type: normalizeTextValue(l?.type) || 'website',
                  url: sanitizeUrl(normalizeTextValue(l?.url), { policy: 'link', fallback: '' }),
                })).filter((/** @type {{url: string}} */ link) => link.url)
              : [],
          }))
        : [this._defaultPerson()],
    }

    const wrapper = ownerDocument.createElement('div')
    wrapper.classList.add('oe-person')
    wrapper.contentEditable = 'false'
    wrapper.tabIndex = -1

    stateMap.set(wrapper, {
      data: parsedData,
      activeIdx: 0,
      debounceTimers: new Map(),
      dragFromIdx: null,
      cropperDialog: null,
      avatarTasks: new Map(),
      abortController: createAbortControllerFor(wrapper),
      context,
      ownerDocument,
    })

    this._rebuild(wrapper)
    return wrapper
  }

  /**
   * Serialize the current block DOM into document data.
   * @param {HTMLElement} element
   * @returns {Record<string, unknown>}
   */
  save(element) {
    const s = stateMap.get(element)
    if (!s) return { persons: [] }
    this._syncActiveFromDom(element)
    // Keep an entirely empty single-person block semantically empty, while
    // preserving additional draft tabs as structural document state so add /
    // remove operations can be saved and undone before the user names them.
    const preserveDrafts = s.data.persons.length > 1
    return {
      persons: s.data.persons
        .filter(p => preserveDrafts || p.name.trim() || p.avatar)
        .map(p => ({
          ...p,
          links: p.links.flatMap(link => {
            const url = sanitizeUrl(link.url, { policy: 'link', fallback: '' })
            return url ? [{ type: link.type, url }] : []
          }),
        })),
    }
  }

  /**
   * Check whether serialized data satisfies this block's schema.
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  validate(data) {
    return validatePersonData(data)
  }

  /**
   * Check whether the block has no meaningful user content.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isEmpty(element) {
    const s = stateMap.get(element)
    if (!s) return true
    this._syncActiveFromDom(element)
    return s.data.persons.every(p => !p.name.trim() && !p.avatar)
  }

  /**
   * Release all listeners, async avatar work, cropper UI, and
   * pending social-resolver timers owned by this block.
   * @param {HTMLElement} element
   * @returns {void}
   */
  destroy(element) {
    const s = stateMap.get(element)
    if (s) {
      this._clearDebounceTimers(s)
      s.cropperDialog?.destroy()
      s.cropperDialog = null
      for (const controller of s.avatarTasks.values()) controller.abort()
      s.avatarTasks.clear()
      s.abortController.abort()
      stateMap.delete(element)
    }
  }

  // â„€â„€ Data sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** @param {HTMLElement} wrapper */
  _syncActiveFromDom(wrapper) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const p = s.data.persons[s.activeIdx]
    if (!p) return
    const nameEditor = wrapper.querySelector('.oe-person__name')
    const roleEditor = wrapper.querySelector('.oe-person__role')
    const bioEditor = wrapper.querySelector('.oe-person__bio')
    if (nameEditor) p.name = sanitizeHtml(nameEditor.innerHTML, wrapper.ownerDocument)
    if (roleEditor) p.role = sanitizeHtml(roleEditor.innerHTML, wrapper.ownerDocument)
    if (bioEditor) p.bio = sanitizeHtml(bioEditor.innerHTML, wrapper.ownerDocument)
  }

  // â„€â„€ Build ui â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ¢ò¢¢&Ò´…DÔÄVÆVÖVçGÒw&W"¢ð¢÷&V'V–ÆB‡w&W"’°¢6öç7B2Ò7FFTÖævWB‡w&W"¢–b‚2’&WGW&à¢6öç7B²FFÂ7F—fT–G‚Â6öçFW‡BÒÒ0¢6öç7B²&VDöæÇ’ÒÒ6öçFW‡@¢6öç7B÷væW$Fö7VÖVçBÒw&W"æ÷væW$Fö7VÖVç@¢6öç7BBÒ‚ò¢¢G—R·7G&–æwÒ¢ò¶W’Âò¢¢G—R·7G&–æwÒ¢òfÆÆ&6²’ÓâF†—2å÷B†¶W’ÂfÆÆ&6²¢F†—2åö6ÆV$FV&÷Væ6UF–ÖW'2‡2¢òò&VÖ÷fRWfVçBÆ—7FVæW'2g&öÒF†R&Wf–÷W2&VæFW&VB6&B&Vf÷&RvP¢òòF—66&B—G2æöFW2âF†—2&WfVçG27FÆR†æFÆW'2g&öÒ¶VW–ærFWF6†V@¢òò6öçG&öÇ2Æ—fRæBÖ¶W2W"×&VæFW"Æ—7FVæW"Æ–fWF–ÖR÷væW'6†—W‡Æ–6—Bà¢2æ&÷'D6öçG&öÆÆW"æ&÷'B‚¢2æ&÷'D6öçG&öÆÆW"Ò7&VFT&÷'D6öçG&öÆÆW$f÷"‡w&W"¢6öç7B6–væÂÒ2æ&÷'D6öçG&öÆÆW"ç6–væÀ¢w&W"ç&WÆ6T6†–ÆG&Vâ‚ ¢òòW'6öâF'0¢–b†FFçW'6öç2æÆVæwF‚â’°¢6öç7BF'2Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢F'2æ6Æ74æÖRÒvöR×W'6öåõ÷F'2p¢F'2ç6WDGG&–'WFR‚w&öÆRrÂwF&Æ—7Br¢F'2ç6WDGG&–'WFR‚v&–ÖÆ&VÂrÂB‚w&öf–ÆW2rÂu&öf–ÆW2r’¢f÷"†ÆWB’Ò²’ÂFFçW'6öç2æÆVæwFƒ²’²²’°¢6öç7BF"Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v'WGFöâr¢F"çG—RÒv'WGFöâp¢F"æ6Æ74æÖRÒvöR×W'6öåõ÷F"r²†’ÓÓÒ7F—fT–G‚òröR×W'6öåõ÷F"ÒÖ7F—fRr¢rr¢F"ç6WDGG&–'WFR‚w&öÆRrÂwF"r¢F"ç6WDGG&–'WFR‚v&–×6VÆV7FVBrÂ7G&–ær†’ÓÓÒ7F—fT–G‚’¢F"çF$–æFW‚Ò’ÓÓÒ7F—fT–G‚ò¢Ó¢F"çFW‡D6öçFVçBÒ7G&–ær†’²¢F"æFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢–b†’ÓÓÒ2æ7F—fT–G‚’&WGW&à¢F†—2å÷7–æ47F—fTg&öÔFöÒ‡w&W"¢2æ7F—fT–G‚Ò¢F†—2å÷&V'V–ÆB‡w&W"¢ÒÂ²6–væÂÒ¢F'2æVæD6†–ÆB‡F"¢Ð¢w&W"æVæD6†–ÆB‡F'2¢Ð ¢6öç7BÒFFçW'6öç5¶7F—fT–G…ÒóòFFçW'6öç5³Ð¢–b‚’&WGW&à ¢òò6&@¢6öç7B6&BÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vGV’r¢6&Bæ6Æ74æÖRÒvöR×W'6öåõö6&Bp ¢òòfF"&V¢6öç7BfF%w&Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢fF%w&æ6Æ74æÖRÒvöR×W'6öåõöfF"r²‡æfF"òrr¢röR×W'6öåõöfF"ÒÖV×G’r¢–b‡æfF"’°¢6öç7B–ÖrÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v–Örr¢6WE6fUW&ÄGG&–'WFR†–ÖrÂw7&2rÂæfF"ÂvÖVF–r¢–ÖræÇBÒB‚vfF"rÂtfF"r¢fF%w&æVæD6†–ÆB†–Ör¢ÒVÇ6R–b‚&VDöæÇ’’°¢6öç7BÆ6V†öÆFW"Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢Æ6V†öÆFW"æ6Æ74æÖRÒvöR×W'6öåõöfF"×Æ6V†öÆFW"p¢Æ6V†öÆFW"æ–ææW$…DÔÂÒ”4ôåô4ÔU$¢fF%w&æVæD6†–ÆB‡Æ6V†öÆFW"¢Ð¢–b‚&VDöæÇ’’°¢fF%w&æFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’ÓâF†—2å÷G&–vvW$fF%WÆöB‡w&W"’Â²6–væÂÒ¢Ð¢6&BæVæD6†–ÆB†fF%w& ¢òò–æfð¢6öç7B–æfòÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢–æfòæ6Æ74æÖRÒvöR×W'6öåõö–æfòp¢6öç7BæÖRÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—rr¢æÖRæ6Æ74æÖRÒvöR×W'6öåõöæÖRp¢æÖRæ6öçFVçDVF—F&ÆRÒ7G&–ær‚&VDöæÇ’¢æÖRç6WDGG&–'WFR‚vFF×Æ6V†öÆFW"rÂB‚væÖRrÂtæÖRr’¢æÖRæ–ææW$…DÔÂÒææÖP ¢6öç7B&öÆRÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢&öÆRæ6Æ74æÖRÒvöR×W'6öåõ÷&öÆRp¢&öÆRæ6öçFVçDVF—F&ÆRÒ7G&–ær‚&VDöæÇ’¢&öÆRç6WDGG&–'WFR‚vFF×Æ6V†öÆFW"rÂB‚w&öÆRrÂu&öÆRr’¢&öÆRæ–ææW$…DÔÂÒç&öÆP ¢6öç7B&–òÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢&–òæ6Æ74æÖRÒvöR×W'6öåõö&–òp¢&–òæ6öçFVçDVF—F&ÆRÒ7G&–ær‚&VDöæÇ’¢&–òç6WDGG&–'WFR‚vFF×Æ6V†öÆFW"rÂB‚v&–òrÂu6†÷'B&–öw&‡’r’¢&–òæ–ææW$…DÔÂÒæ&–ð ¢–b‡&VDöæÇ’’°¢æÖRç&VÖ÷fTGG&–'WFR‚vFF×Æ6V†öÆFW"r¢&öÆRç&VÖ÷fTGG&–'WFR‚vFF×Æ6V†öÆFW"r¢&–òç&VÖ÷fTGG&–'WFR‚vFF×Æ6V†öÆFW"r¢Ð ¢–æfòæVæB†æÖRÂ&öÆRÂ&–ò ¢òò6ö6–ÂÆ–æ·0¢6öç7BÆ–æ·5w&Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢Æ–æ·5w&æ6Æ74æÖRÒvöR×W'6öåõöÆ–æ·2p¢f÷"†ÆWB’Ò²’ÂæÆ–æ·2æÆVæwFƒ²’²²’°¢6öç7BÆ–æ²ÒæÆ–æ·5¶•Ð¢6öç7B&÷rÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚vF—br¢&÷ræ6Æ74æÖRÒvöR×W'6öåõöÆ–æ²×&÷rp¢&÷ræG&vv&ÆRÒ&VDöæÇ¢&÷ræFF6WBæ–æFW‚Ò7G&–ær†’¢6öç7Bw&—Ò÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚w7âr¢w&—æ6Æ74æÖRÒvöR×W'6öåõöÆ–æ²Öw&—p¢w&—æ–ææW$…DÔÂÒ”4ôåôu$• ¢w&—çF—FÆRÒB‚vG&tÆ–æ²rÂtG&rFò&V÷&FW"r¢w&—æ†–FFVâÒ&VDöæÇ¢6öç7B–6öäVÂÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚w7âr¢–6öäVÂæ6Æ74æÖRÒvöR×W'6öåõöÆ–æ²Ö–6öâp¢–6öäVÂæ–ææW$…DÔÂÒ4ô4”Åô”4ôå5¶Æ–æ²çG—UÒóò4ô4”Åô”4ôå2çvV'6—FP¢6öç7B–çWBÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v–çWBr¢–çWBçG—RÒwW&Âp¢–çWBæ6Æ74æÖRÒvöR×W'6öåõöÆ–æ²Ö–çWBp¢–çWBçfÇVRÒÆ–æ²çW&ÂÇÂrp¢–çWBçÆ6V†öÆFW"ÒB‚vÆ–æ²rÂv‡GG3¢òòâââr¢–çWBç6WDGG&–'WFR‚vFFÖöRÖFö7VÖVçBÖ–çWBrÂrr¢–çWBç&VDöæÇ’Ò&VDöæÇ¢–çWBæFDWfVçDÆ—7FVæW"‚v–çWBrÂ‚’ÓâF†—2åöFV&÷Væ6VE&W6öÇfR‡w&W"Â’Â–çWBçfÇVRÂ–6öäVÂ’Â²6–væÂÒ¢&÷ræVæB†w&—Â–6öäVÂÂ–çWB¢–b‚&VDöæÇ’’°¢6öç7B&ÒÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v'WGFöâr¢&ÒçG—RÒv'WGFöâp¢&Òæ6Æ74æÖRÒvöR×W'6öåõöÆ–æ²×&VÖ÷fRp¢&Òæ–ææW$…DÔÂÒ”4ôåõ$TÔõdP¢&ÒçF—FÆRÒB‚w&VÖ÷fTÆ–æ²rÂu&VÖ÷fRÆ–æ²r¢&ÒæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öç7B¶W’ÒG·2æ7F—fT–G‡Ó¢G¶—Ö ¢6öç7BF–ÖW"Ò2æFV&÷Væ6UF–ÖW'2ævWB†¶W’¢–b‡F–ÖW"’²†÷væW$Fö7VÖVçBæFVfVÇEf–WróòvÆö&ÅF†—2’æ6ÆV%F–ÖV÷WB‡F–ÖW"“²2æFV&÷Væ6UF–ÖW'2æFVÆWFR†¶W’’Ð¢6öçFW‡Bæ×WFFR‚‚’Óâ°¢F†—2å÷7–æ47F—fTg&öÔFöÒ‡w&W"¢æÆ–æ·2ç7Æ–6R†’Â¢F†—2å÷&V'V–ÆB‡w&W"¢Ò¢ÒÂ²6–væÂÒ¢&÷ræVæD6†–ÆB‡&Ò¢Ð¢Æ–æ·5w&æVæD6†–ÆB‡&÷r¢Ð¢–b‚&VDöæÇ’’°¢6öç7BFD'FâÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v'WGFöâr¢FD'FâçG—RÒv'WGFöâp¢FD'Fâæ6Æ74æÖRÒvöR×W'6öåõöFBÖÆ–æ²p¢FD'Fâæ–ææW$…DÔÂÒ”4ôåõÅU2²rr²B‚vFDÆ–æ²rÂtFBÆ–æ²r¢FD'FâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öçFW‡Bæ×WFFR‚‚’Óâ°¢F†—2å÷7–æ47F—fTg&öÔFöÒ‡w&W"¢æÆ–æ·2çW6‚‡²G—S¢wvV'6—FRrÂW&Ã¢rrÒ¢F†—2å÷&V'V–ÆB‡w&W"¢Ò¢ÒÂ²6–væÂÒ¢Æ–æ·5w&æVæD6†–ÆB†FD'Fâ¢Ð¢–æfòæVæD6†–ÆB†Æ–æ·5w&¢6&BæVæD6†–ÆB†–æfò¢w&W"æVæD6†–ÆB†6&B ¢òòFBW'6öâ'WGFöà¢–b‚&VDöæÇ’’°¢6öç7BFEW'6öâÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v'WGFöâr¢FEW'6öâçG—RÒv'WGFöâp¢FEW'6öâæ6Æ74æÖRÒvöR×W'6öåõöFBÒp¢FEW'6öâæ–ææW$…DÔÂÒ”4ôåõÅU2²rr²B‚vFEW'6öârÂtFBW'6öâr¢FEW'6öâæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öçFW‡Bæ×WFFR‚‚’Óâ°¢F†—2å÷7–æ47F—fTg&öÔFöÒ‡w&W"¢FFçW'6öç2çW6‚‡F†—2åöFVfVÇEW'6öâ‚’¢2æ7F—fT–G‚ÒFFçW'6öç2æÆVæwF‚Ò¢F†—2å÷&V'V–ÆB‡w&W"¢Ò¢ÒÂ²6–væÂÒ¢Ð ¢òò&VÖ÷fRW'6öâ'WGFöâ†öæÇ’–bâ¢–b‚&VDöæÇ’bbFFçW'6öç2æÆVæwF‚â’°¢6öç7B&VÖ÷fRÒ÷væW$Fö7VÖVçBæ7&VFTVÆVÖVçB‚v'WGFöâr¢&VÖ÷fRçG—RÒv'WGFöâp¢&VÖ÷fRæ6Æ74æÖRÒvöR×W'6öåõ÷&VÖ÷fRp¢&VÖ÷fRçFW‡D6öçFVçBÒB‚w&VÖ÷fUW'6öârÂu&VÖ÷fR7W'&VçBW'6öâr¢&VÖ÷fRæFDWfVçDÆ—7FVæW"‚v6Æ–6²rÂ‚’Óâ°¢6öçFW‡Bæ×WFFR‚‚’Óâ°¢F†—2å÷7–æ47F—fTg&öÔFöÒ‡w&W"¢6öç7BF&vWBÒFFçW'6öç5·'6T–çB‡7Bæ7F—fT–G‚•Ð¢–b‡F&vWB’2æfF%F6·2ævWB‡F&vWB“òæ&÷'B‚¢FFçW'6öç2ç7Æ–6R‡2æ7F—fT–G‚Â¢–b‡2æ7F—fT–G‚ãÒFFçW'6öç2æÆVæwF‚’2æ7F—fT–G‚ÒFFçW'6öç2æÆVæwF‚Ò¢F†—2å÷&V'V–ÆB‡w&W"¢Ò¢ÒÂ²6–væÂÒ¢w&W"æVæD6†–ÆB‡&VÖ÷fR¢Ð¢Ð ¢òò)H)H˜YÈ™[Ü™\ˆ8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 8¥ 

  /**
   * @param {HTMLElement} wrapper
   * @param {DragEvent} e
   */
  _onDragStart(wrapper, e) {
    const s = stateMap.get(wrapper)
    if (!s) return
    const row = /** @type {HTMLElement | null} */ (e.target?.closest?.('.oe-person__link-row'))
    if (!row) return
    s.dragFromIdx = parseInt(row.dataset.index)
    e.dataTransfer?.setData('text/plain', String(s.dragFromIdx))
    e.dataTransfer?.setDragImage(row, 0, 0)
  }

  /**
   * @param {HTMLElement} wrapper
   * @param {DragEvent} e
   */
  _onDrop(wrapper, e) {
    e.preventDefault()
    const s = stateMap.get(wrapper)
    if (!s ||(s.dragFromIdx === null) || scontentExited) return
    const row = /** @type {HTMLElement | null} */ (e.target?.closest?.('.oe-person__link-row'))
    if (!row) return
    const from = s.dragFromIdx
    const to = parseInt(row.dataset.index)
    if (from === to) return
    const p = s.data.persons[s.activeIdx]
    if (!p) return
    s.context.mutate(() => {
      this._syncActiveFromDom(wrapper)
      const [moved] = p.links.splice(from, 1)
      p.links.splice(to, 0, moved)
      this._rebuild(wrapper)
    })
  }

  // â”€â”€M½¥…°¥½¸É•Í½±ÕÑ¥½¸ƒŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠŠ  ¢ò¢ ¢¢&Ò´…DÔÄVÆVÖVçGÒw&W ¢¢&Ò¶çVÖ&W'Ò–æFW€¢¢&Ò·7G&–æwÒW&À¢¢&Ò´…DÔÄVÆVÖVçGÒ–6öäVÀ¢¢&WGW&ç2·fö–GÐ¢¢ð¢öFV&÷Væ6VE&W6öÇfR‡w&W"Â–æFW‚ÂW&ÂÂ–6öäVÂ’°¢6öç7B2Ò7FFTÖævWB‡w&W"¢–b‚2’&WGW&à¢6öç7B¶W’ÒG·2æ7F—fT–G‡Ó¢G¶–æFW‡Ö ¢6öç7BF&vWEW'6öâÒ2æFFçW'6öç5·2æ7F—fT–G…Ð¢–b‚F&vWEW'6öâ’&WGW&à¢6öç7BW†—7F–ærÒ2æFV&÷Væ6UF–ÖW'2ævWB†¶W’¢–b†W†—7F–ær’‡w&W"æ÷væW$Fö7VÖVçBæFVfVÇEf–WróòvÆö&ÅF†—2’æ6ÆV%F–ÖV÷WB†W†—7F–ær¢–6öäVÂæ–ææW$…DÔÂÒ”4ôåôÄôDU ¢–6öäVÂçVW'•6VÆV7F÷"‚w7frr“òæ6Æ74Æ—7BæFB‚vöR×W'6öåõ÷7–âr¢6öç7BF–ÖW"Ò‡w&W"æ÷væW$Fö7VÖVçBæFVfVÇEf–WróòvÆö&ÅF†—2’ç6WEF–ÖV÷WB‚‚’Óâ°¢2æFV&÷Væ6UF–ÖW'2æFVÆWFR†¶W’¢F†—2å÷&W6öÇfT–6öâ‡w&W"Â–æFW‚ÂW&ÂÂ–6öäVÂÂF&vWEW'6öâÂ¶W’¢ÒÂS¢2æFV&÷Væ6UF–ÖW'2ç6WB†¶W’ÂF–ÖW"¢Ð ¢ò¢ ¢¢6æ6VÂWfW'’VæF–ær6ö6–ÂÖÆ–æ²&W6öÇfW"÷væVB'’öæR&VæFW&VB&Æö6²à¢¢&V'V–ÇB÷"&WÆ6VB6&G2&W6öÇfRF†V—"7W'&VçBU$Ç27–æ6‡&öæ÷W6Ç’Â6ò¢¢F–ÖW"F–VBFòFWF6†VB–çWB×W7BæWfW"WFFRÆFW"Æ–æ²BF†R6ÖP¢¢'&’–æFW‚à¢¢&ÒµW'6öå7FFWÒ7FFP¢¢&WGW&ç2·fö–GÐ¢¢ð¢ö6ÆV$FV&÷Væ6UF–ÖW'2‡7FFR’°¢f÷"†6öç7BF–ÖW"öb7FFRæFV&÷Væ6UF–ÖW'2çfÇVW2‚’’‡7FFRæ÷væW$Fö7VÖVçBæFVfVÇEf–WróòvÆö&ÅF†—2’æ6ÆV%F–ÖV÷WB‡F–ÖW"¢7FFRæFV&÷Væ6UF–ÖW'2æ6ÆV"‚¢Ð ¢ò¢ ¢¢&Ò´…DÔÄVÆVÖVçGÒw&W ¢¢&Ò¶çVÖ&W'Ò–æFW€¢¢&Ò·7G&–æwÒW&À¢¢&Ò´…DÔÄVÆVÖVçGÒ–6öäVÀ¢¢&ÒµW'6öäFFÒF&vWEW'6öà¢¢&Ò·7G&–æwÒ·F–ÖW$¶W•ÒW†7BVæF–ær×F–ÖW"¶W’6GW&VB'’F†R6ÆÆW"à¢¢&WGW&ç2·fö–GÐ¢¢ð¢÷&W6öÇfT–6öâ‡w&W"Â–æFW‚ÂW&ÂÂ–6öäVÂÂF&vWEW'6öâÂF–ÖW$¶W’’°¢6öç7B2Ò7FFTÖævWB‡w&W"¢–b‚2’&WGW&à¢6öç7BW'6öä–æFW‚Ò2æFFçW'6öç2æ–æFW„öb‡F&vWEW'6öâ¢–b‡W'6öä–æFW‚Â’&WGW&à¢6öç7B¶W’ÒF–ÖW$¶W’ÇÈ	Ü\œÛÛ’[™^N‰Ú[™^XˆÛÛœÝ^\Ý[™ÈHË™X›Ý[˜ÙU[Y\œË™Ù]
Ù^JBˆYˆ
^\Ý[™ÊHÈ
Ü˜\\‹›ÝÛ™\‘ØÝ[Y[™Y˜][šY]ÈÏÈÛØ˜[\ÊK˜ÛX\•[Y[Ý]
^\Ý[™ÊNÈË™X›Ý[˜ÙU[Y\œË™[]JÙ^JHBˆÛÛœÝ™\ÛÛ™YH™\ÛÛ™TÛØÚX[XÛÛŠ\›\Ë—ØÛÛ™šYËœÛØÚX[™\ÛÛ™\œÊBˆXÛÛ‘[š[›™\’SH™\ÛÛ™YšXÛÛ‚ˆXÛÛ‘[™]\Ù]\HH™\ÛÛ™Y\BˆÛÛœÝ\œÛÛ“[šÈH\™Ù]\œÛÛ‹›[šÜÖÚ[™^BˆYˆ
\œÛÛ“[šÈ	‰ˆ\œÛÛ“[šË\HOOH™\ÛÛ™Y\JHÂˆË˜ÛÛ^›]]]J

HOˆÈ\œÛÛ“[šË\HH™\ÛÛ™Y\HJBˆBˆB‚ˆËÈ8¥ 8¥  Avatar upload â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€â„€((€€¼¨¨Á…É…´í!Q51±•µ•¹ÑôÝÉ…ÁÁ•ÈÉ•ÑÕÉ¹ÌíÙ½¥‘ô€¨¼(€}ÑÉ¥•ÉÙ…Ñ…ÉUÁ±½…¡ÝÉ…ÁÁ•È¤ì(€€€½¹ÍÐÕÉÉ•¹ÑMÑ…Ñ”€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€¥˜€ …ÕÉÉ•¹ÑMÑ…Ñ”ñðÕÉÉ•¹ÑMÑ…Ñ”¹½¹Ñ•áÐ¹É•…‘=¹±ä¤É•ÑÕÉ¸(€€€½¹ÍÐÐ€ô€ ¼¨¨ÑåÁ”íÍÑÉ¥¹ô€¨¼­•ä°€¼¨¨ÑåÁ”íÍÑÉ¥¹ô€¨¼™…±±‰…¬¤€ôøÑ¡¥Ì¹}Ð¡­•ä°™…±±‰…¬¤(€€€½¹ÍÐ¥¹ÁÕÐ€ôÝÉ…ÁÁ•È¹½Ý¹•É½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð ¥¹ÁÕÐœ¤(€€€¥¹ÁÕÐ¹ÑåÁ”€ô€™¥±”œ(€€€¥¹ÁÕÐ¹…•ÁÐ€ô€¥µ…”¼¨œ(€€€¥¹ÁÕÐ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ°…Íå¹Œ€ ¤€ôøì(€€€€€½¹ÍÐ™¥±”€ô¥¹ÁÕÐ¹™¥±•Ìü¹lÁt(€€€€€¥˜€ …™¥±”¤É•ÑÕÉ¸(€€€€€½¹ÍÐÍÑ…Ñ”€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€€€¥˜€ …ÍÑ…Ñ”¤É•ÑÕÉ¸(€€€€€½¹ÍÐÑ…É•ÑA•ÉÍ½¸€ôÍÑ…Ñ”¹‘…Ñ„¹Á•ÉÍ½¹ÍmÍÑ…Ñ”¹…Ñ¥Ù•%‘át(€€€€€¥˜€ …Ñ…É•ÑA•ÉÍ½¸¤É•ÑÕÉ¸((€€€€€±•Ð…Ù…Ñ…É	±½ˆ€ô€¼¨¨ÑåÁ”í	±½‰ô€¨¼€¡™¥±”¤(€€€€€±•ÐÕÁ±½…‘9…µ”€ô€…Ù…Ñ…È¹Ý•‰Àœ(€€€€€±•ÐÕÁ±½…‘QåÁ”€ô€¥µ…”½Ý•‰Àœ((€€€€€€¼¼Í¡•±…µ­½™˜½É½ÁÁ•È€Ä¹àÉ•Í½±Ù•Ì=4…¹Á±…Ñ™½É´½¹ÍÑÉÕÑ½ÉÌ™É½´(€€€€€€¼¼¥ÑÌµ½‘Õ±”É•…±´¸]¡•¸I•Ñ½È¥Ì±½…‘•‰ä„Á…É•¹Ð‘½Õµ•¹Ð‰ÕÐ(€€€€€€¼¼µ½Õ¹Ñ•¥¹Ñ¼…¸¥™É…µ”°½Á•¹¥¹œÑ¡…Ð‘¥…±½œÝ½Õ±É•…Ñ”U$¥¸Ñ¡”(€€€€€€¼¼Á…É•¹Ð…¹É•©•ÐÑ¡”¥™É…µ”¥±”½!Q51±•µ•¹ÐÙ¥„É½ÍÌµÉ•…±´(€€€€€€¼¼¥¹ÍÑ…¹•½˜¡•­Ì¸AÉ•Í•ÉÙ”…Ù…Ñ…ÈÕÁ±½…¥¸Ñ¡…ÐÍÕÁÁ½ÉÑ•µ½Õ¹Ñ¥¹œ(€€€€€€¼¼µ½‘”‰äÍ­¥ÁÁ¥¹œ½¹±äÑ¡”¥¹Ñ•É…Ñ¥Ù”É½ÀÍÑ•À¸(€€€€€¥˜€¡ÝÉ…ÁÁ•È¹½Ý¹•É½Õµ•¹Ð€ôôô±½‰…±Q¡¥Ì¹‘½Õµ•¹Ð¤ì(€€€€€€€ÍÑ…Ñ”¹É½ÁÁ•É¥…±½œü¹‘•ÍÑÉ½ä ¤(€€€€€€€½¹ÍÐ‘¥…±½œ€ô¹•ÜÉ½ÁÁ•É¥…±½œ¡™¥±”°ì(€€€€€€€€€Ñ¥Ñ±”èÐ É½ÁQ¥Ñ±”œ°€É½À…Ù…Ñ…Èœ¤°(€€€€€€€€€½¹™¥ÉµQ•áÐèÐ É½Á½¹™¥É´œ°€ÁÁ±äœ¤°(€€€€€€€€€…¹•±Q•áÐèÐ É½Á…¹•°œ°€…¹•°œ¤°(€€€€€€€ô¤(€€€€€€€ÍÑ…Ñ”¹É½ÁÁ•É¥…±½œ€ô‘¥…±½œ(€€€€€€€‘¥…±½œ¹½Á•¸ ¤((€€€€€€€ÑÉäì(€€€€€€€€€…Ù…Ñ…É	±½ˆ€ô…Ý…¥Ð‘¥…±½œ¹É•ÍÕ±Ð(€€€€€€€ô™¥¹…±±äì(€€€€€€€€€½¹ÍÐÕÉÉ•¹Ð€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€€€€€€€¥˜€¡ÕÉÉ•¹Ðü¹É½ÁÁ•É¥…±½œ€ôôô‘¥…±½œ¤ÕÉÉ•¹Ð¹É½ÁÁ•É¥…±½œ€ô¹Õ±°(€€€€€€€ô(€€€€€€€¥˜€ ……Ù…Ñ…É	±½ˆ¤É•ÑÕÉ¸(€€€€€ô•±Í”ì(€€€€€€€ÕÁ±½…‘9…µ”€ô™¥±”¹¹…µ”ñð€…Ù…Ñ…Èœ(€€€€€€€ÕÁ±½…‘QåÁ”€ô™¥±”¹ÑåÁ”ñð€…ÁÁ±¥…Ñ¥½¸½½Ñ•ÐµÍÑÉ•…´œ(€€€€€ô((€€€€€¥˜€ …ÍÑ…Ñ•5…À¹¡…Ì¡ÝÉ…ÁÁ•È¤¤É•ÑÕÉ¸(€€€€€Ñ¡¥Ì¹}Íå¹Ñ¥Ù•É½µ½´¡ÝÉ…ÁÁ•È¤((€€€€€¥˜€¡Ñ¡¥Ì¹}½¹™¥œ¹ÕÁ±½…‘¥±”¤ì(€€€€€€€Ù½¥Ñ¡¥Ì¹}ÕÁ±½…‘Ù…Ñ…È¡ÝÉ…ÁÁ•È°…Ù…Ñ…É	±½ˆ°Ñ…É•ÑA•ÉÍ½¸°ÕÁ±½…‘9…µ”°ÕÁ±½…‘QåÁ”¤(€€€€€ô•±Í”ì(€€€€€€€Ù½¥Ñ¡¥Ì¹}É•…‘Ù…Ñ…È¡ÝÉ…ÁÁ•È°…Ù…Ñ…É	±½ˆ°Ñ…É•ÑA•ÉÍ½¸¤(€€€€€ô(€€€ô¤(€€€¥¹ÁÕÐ¹±¥¬ ¤(€ô((€€¼¨¨(€€€¨MÑ…ÉÐ„±…Ñ•ÍÐµÝ¥¹Ì…Ù…Ñ…È½Á•É…Ñ¥½¸™½È½¹”ÁÉ½™¥±”Ý¥Ñ¡½ÕÐ…¹•±±¥¹œ(€€€¨¥¹‘•Á•¹‘•¹ÐÕÁ±½…‘ÌÑ¡…Ð‰•±½¹œÑ¼½Ñ¡•ÈÁÉ½™¥±”Ñ…‰Ì¸(€€€¨Á…É…´í!Q51±•µ•¹ÑôÝÉ…ÁÁ•È(€€€¨Á…É…´íA•ÉÍ½¹…Ñ…ôÑ…É•ÑA•ÉÍ½¸(€€€¨É•ÑÕÉ¹ÌíìÍÑ…Ñ”èA•ÉÍ½¹MÑ…Ñ”°½¹ÑÉ½±±•Èè‰½ÉÑ½¹ÑÉ½±±•Èôð¹Õ±±ô(€€€¨¼(€}‰•¥¹Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°Ñ…É•ÑA•ÉÍ½¸¤ì(€€€½¹ÍÐÍÑ…Ñ”€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€¥˜€ …ÍÑ…Ñ”ñðÍÑ…Ñ”¹½¹Ñ•áÐ¹É•…‘=¹±äñð€…ÍÑ…Ñ”¹‘…Ñ„¹Á•ÉÍ½¹Ì¹¥¹±Õ‘•Ì¡Ñ…É•ÑA•ÉÍ½¸¤¤É•ÑÕÉ¸¹Õ±°(€€€ÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹•Ð¡Ñ…É•ÑA•ÉÍ½¸¤ü¹…‰½ÉÐ ¤(€€€½¹ÍÐ½¹ÑÉ½±±•È€ôÉ•…Ñ•‰½ÉÑ½¹ÑÉ½±±•É½È¡ÝÉ…ÁÁ•È¤(€€€ÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹Í•Ð¡Ñ…É•ÑA•ÉÍ½¸°½¹ÑÉ½±±•È¤(€€€ÝÉ…ÁÁ•È¹±…ÍÍ1¥ÍÐ¹…‘ ½”µÁ•ÉÍ½¸´µ±½…‘¥¹œœ¤(€€€É•ÑÕÉ¸ìÍÑ…Ñ”°½¹ÑÉ½±±•Èô(€ô((€€¼¨¨(€€€¨I•±•…Í”…Ù…Ñ…ÈµÑ…Í¬½Ý¹•ÉÍ¡¥À½¹±äÝ¡•¸Ñ¡”½µÁ±•Ñ¥¹œÑ…Í¬¥ÌÍÑ¥±°Ñ¡”(€€€¨±…Ñ•ÍÐÑ…Í¬™½È¥ÑÌÑ…É•ÐÁÉ½™¥±”¸(€€€¨Á…É…´í!Q51±•µ•¹ÑôÝÉ…ÁÁ•È(€€€¨Á…É…´íA•ÉÍ½¹MÑ…Ñ•ôÍÑ…Ñ”(€€€¨Á…É…´íA•ÉÍ½¹…Ñ…ôÑ…É•ÑA•ÉÍ½¸(€€€¨Á…É…´í‰½ÉÑ½¹ÑÉ½±±•Éô½¹ÑÉ½±±•È(€€€¨É•ÑÕÉ¹Ìí‰½½±•…¹ô(€€€¨¼(€}™¥¹¥Í¡Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°ÍÑ…Ñ”°Ñ…É•ÑA•ÉÍ½¸°½¹ÑÉ½±±•È¤ì(€€€¥˜€¡ÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤€„ôôÍÑ…Ñ”ñðÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹•Ð¡Ñ…É•ÑA•ÉÍ½¸¤€„ôô½¹ÑÉ½±±•È¤É•ÑÕÉ¸™…±Í”(€€€ÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹‘•±•Ñ”¡Ñ…É•ÑA•ÉÍ½¸¤(€€€¥˜€¡ÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹Í¥é”€ôôô€À¤ÝÉ…ÁÁ•È¹±…ÍÍ1¥ÍÐ¹É•µ½Ù” ½”µÁ•ÉÍ½¸´µ±½…‘¥¹œœ¤(€€€É•ÑÕÉ¸ÑÉÕ”(€ô((€€¼¨¨(€€€¨MÑ½É”„É½ÁÁ•…Ù…Ñ…È±½…±±äÝ¡¥±”ÁÉ•Í•ÉÙ¥¹œÍ…µ”µÁ•ÉÍ½¸±…Ñ•ÍÐµÝ¥¹Ì(€€€¨½Ý¹•ÉÍ¡¥À…¹‰±½¬±¥™•å±”…¹•±±…Ñ¥½¸¸(€€€¨Á…É…´í!Q51±•µ•¹ÑôÝÉ…ÁÁ•È(€€€¨Á…É…´í	±½‰ô‰±½ˆ(€€€¨Á…É…´íA•ÉÍ½¹…Ñ…ôÑ…É•ÑA•ÉÍ½¸(€€€¨É•ÑÕÉ¹ÌíAÉ½µ¥Í”ñÙ½¥ùô(€€€¨¼(€…Íå¹Œ}É•…‘Ù…Ñ…È¡ÝÉ…ÁÁ•È°‰±½ˆ°Ñ…É•ÑA•ÉÍ½¸¤ì(€€€½¹ÍÐÑ…Í¬€ôÑ¡¥Ì¹}‰•¥¹Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°Ñ…É•ÑA•ÉÍ½¸¤(€€€¥˜€ …Ñ…Í¬¤É•ÑÕÉ¸(€€€½¹ÍÐìÍÑ…Ñ”°½¹ÑÉ½±±•Èô€ôÑ…Í¬(€€€ÑÉäì(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥Ð¹•ÜAÉ½µ¥Í” ¡É•Í½±Ù”°É•©•Ð¤€ôøì(€€€€€€€½¹ÍÐ½Ý¹•ÉY¥•Ü€ôÝÉ…ÁÁ•È¹½Ý¹•É½Õµ•¹Ð¹‘•™…Õ±ÑY¥•Ü(€€€€€€€½¹ÍÐ¥±•I•…‘•ÉÑ½È€ô½Ý¹•ÉY¥•Üü¹¥±•I•…‘•È€üü¥±•I•…‘•È(€€€€€€€½¹ÍÐ=5á•ÁÑ¥½¹Ñ½È€ô½Ý¹•ÉY¥•Üü¹=5á•ÁÑ¥½¸€üü=5á•ÁÑ¥½¸(€€€€€€€½¹ÍÐÉ•…‘•È€ô¹•Ü¥±•I•…‘•ÉÑ½È ¤(€€€€€€€±•ÐÍ•ÑÑ±•€ô™…±Í”(€€€€€€€½¹ÍÐ™¥¹¥Í €ô€¡…±±‰…¬¤€ôøì(€€€€€€€€€¥˜€¡Í•ÑÑ±•¤É•ÑÕÉ¸(€€€€€€€€€Í•ÑÑ±•€ôÑÉÕ”(€€€€€€€€€½¹ÑÉ½±±•È¹Í¥¹…°¹É•µ½Ù•Ù•¹Ñ1¥ÍÑ•¹•È …‰½ÉÐœ°…‰½ÉÐ¤(€€€€€€€€€…±±‰…¬ ¤(€€€€€€€ô(€€€€€€€½¹ÍÐ…‰½ÉÐ€ô€ ¤€ôøì(€€€€€€€€€¥˜€¡É•…‘•È¹É•…‘åMÑ…Ñ”€ôôô¥±•I•…‘•ÉÑ½È¹1=%9¤É•…‘•È¹…‰½ÉÐ ¤(€€€€€€€€€•±Í”™¥¹¥Í   ¤€ôøÉ•©•Ð¡½¹ÑÉ½±±•È¹Í¥¹…°¹É•…Í½¸ñð¹•Ü=5á•ÁÑ¥½¹Ñ½È Ù…Ñ…ÈÉ•……‰½ÉÑ•œ°€‰½ÉÑÉÉ½Èœ¤¤¤(€€€€€€€ô(€€€€€€€½¹ÑÉ½±±•È¹Í¥¹…°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È …‰½ÉÐœ°…‰½ÉÐ°ì½¹”èÑÉÕ”ô¤(€€€€€€€É•…‘•È¹½¹±½…€ô€ ¤€ôø™¥¹¥Í   ¤€ôøÉ•Í½±Ù”¡ÑåÁ•½˜É•…‘•È¹É•ÍÕ±Ð€ôôô€ÍÑÉ¥¹œœ€üÉ•…‘•È¹É•ÍÕ±Ð€è€œœ¤¤(€€€€€€€É•…‘•È¹½¹•ÉÉ½È€ô€ ¤€ôø™¥¹¥Í   ¤€ôøÉ•©•Ð¡É•…‘•È¹•ÉÉ½Èñð¹•ÜÉÉ½È …¥±•Ñ¼É•……Ù…Ñ…Èœ¤¤¤(€€€€€€€É•…‘•È¹½¹…‰½ÉÐ€ô€ ¤€ôø™¥¹¥Í   ¤€ôøÉ•©•Ð¡½¹ÑÉ½±±•È¹Í¥¹…°¹É•…Í½¸ñð¹•Ü=5á•ÁÑ¥½¹Ñ½È Ù…Ñ…ÈÉ•……‰½ÉÑ•œ°€‰½ÉÑÉÉ½Èœ¤¤¤(€€€€€€€ÑÉäìÉ•…‘•È¹É•…‘Í…Ñ…UI0¡‰±½ˆ¤ô…Ñ €¡•ÉÉ½È¤ì™¥¹¥Í   ¤€ôøÉ•©•Ð¡•ÉÉ½È¤¤ô(€€€€€ô¤(€€€€€½¹ÍÐÕÉÉ•¹Ð€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€€€¥˜€ (€€€€€€€½¹ÑÉ½±±•È¹Í¥¹…°¹…‰½ÉÑ•(€€€€€€€ñðÕÉÉ•¹Ð€„ôôÍÑ…Ñ”(€€€€€€€ñðÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹•Ð¡Ñ…É•ÑA•ÉÍ½¸¤€„ôô½¹ÑÉ½±±•È(€€€€€€€ñð€…ÍÑ…Ñ”¹‘…Ñ„¹Á•ÉÍ½¹Ì¹¥¹±Õ‘•Ì¡Ñ…É•ÑA•ÉÍ½¸¤(€€€€€€¤É•ÑÕÉ¸(€€€€€ÍÑ…Ñ”¹½¹Ñ•áÐ¹µÕÑ…Ñ”  ¤€ôøì(€€€€€€€Ñ…É•ÑA•ÉÍ½¸¹…Ù…Ñ…È€ôMÑÉ¥¹œ¡É•ÍÕ±Ð¤(€€€€€€€Ñ¡¥Ì¹}É•‰Õ¥±¡ÝÉ…ÁÁ•È¤(€€€€€ô¤(€€€ô…Ñ ì(€€€€€€¼¼I•…Ý…Ì…¹•±±•½È™…¥±•¸(€€€ô™¥¹…±±äì(€€€€€Ñ¡¥Ì¹}™¥¹¥Í¡Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°ÍÑ…Ñ”°Ñ…É•ÑA•ÉÍ½¸°½¹ÑÉ½±±•È¤(€€€ô(€ô((€€¼¨¨(€€€¨Á…É…´í!Q51±•µ•¹ÑôÝÉ…ÁÁ•È(€€€¨Á…É…´í	±½‰ô‰±½ˆ(€€€¨Á…É…´íA•ÉÍ½¹…Ñ…ôÑ…É•ÑA•ÉÍ½¸(€€€¨Á…É…´íÍÑÉ¥¹ôm™¥±•¹…µ•t(€€€¨Á…É…´íÍÑÉ¥¹ômµ¥µ•QåÁ•t(€€€¨É•ÑÕÉ¹ÌíAÉ½µ¥Í”ñÙ½¥ùô(€€€¨¼(€…Íå¹Œ}ÕÁ±½…‘Ù…Ñ…È¡ÝÉ…ÁÁ•È°‰±½ˆ°Ñ…É•ÑA•ÉÍ½¸°™¥±•¹…µ”€ô€…Ù…Ñ…È¹Ý•‰Àœ°µ¥µ•QåÁ”€ô€¥µ…”½Ý•‰Àœ¤ì(€€€¥˜€ …Ñ¡¥Ì¹}½¹™¥œ¹ÕÁ±½…‘¥±”¤É•ÑÕÉ¸(€€€½¹ÍÐÑ…Í¬€ôÑ¡¥Ì¹}‰•¥¹Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°Ñ…É•ÑA•ÉÍ½¸¤(€€€¥˜€ …Ñ…Í¬¤É•ÑÕÉ¸(€€€½¹ÍÐìÍÑ…Ñ”°½¹ÑÉ½±±•Èô€ôÑ…Í¬(€€€ÑÉäì(€€€€€½¹ÍÐ¥±•Ñ½È€ôÝÉ…ÁÁ•È¹½Ý¹•É½Õµ•¹Ð¹‘•™…Õ±ÑY¥•Üü¹¥±”€üü¥±”(€€€€€½¹ÍÐ™¥±”€ô¹•Ü¥±•Ñ½È¡m‰±½‰t°™¥±•¹…µ”°ìÑåÁ”èµ¥µ•QåÁ”ô¤(€€€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÑ¡¥Ì¹}½¹™¥œ¹ÕÁ±½…‘¥±”¡™¥±”°ìÍ¥¹…°è½¹ÑÉ½±±•È¹Í¥¹…°ô¤(€€€€€½¹ÍÐÕÉ°€ôÍ…¹¥Ñ¥é•UÉ°¡MÑÉ¥¹œ¡É•ÍÕ±Ðü¹ÕÉ°ñð€œœ¤°ìÁ½±¥äè€µ•‘¥„œ°™…±±‰…¬è€œœô¤(€€€€€½¹ÍÐÕÉÉ•¹Ð€ôÍÑ…Ñ•5…À¹•Ð¡ÝÉ…ÁÁ•È¤(€€€€€¥˜€ (€€€€€€€½¹ÑÉ½±±•È¹Í¥¹…°¹…‰½ÉÑ•(€€€€€€€ñð€…ÕÉ°(€€€€€€€ñðÕÉÉ•¹Ð€„ôôÍÑ…Ñ”(€€€€€€€ñðÍÑ…Ñ”¹…Ù…Ñ…ÉQ…Í­Ì¹•Ð¡Ñ…É•ÑA•ÉÍ½¸¤€„ôô½¹ÑÉ½±±•È(€€€€€€€ñð€…ÍÑ…Ñ”¹‘…Ñ„¹Á•ÉÍ½¹Ì¹¥¹±Õ‘•Ì¡Ñ…É•ÑA•ÉÍ½¸¤(€€€€€€¤É•ÑÕÉ¸(€€€€€ÍÑ…Ñ”¹½¹Ñ•áÐ¹µÕÑ…Ñ”  ¤€ôøì(€€€€€€€Ñ…É•ÑA•ÉÍ½¸¹…Ù…Ñ…È€ôÕÉ°(€€€€€€€Ñ¡¥Ì¹}É•‰Õ¥±¡ÝÉ…ÁÁ•È¤(€€€€€ô¤(€€€ô…Ñ ì(€€€€€€¼¼UÁ±½…Ý…Ì…¹•±±•½È™…¥±•¸(€€€ô™¥¹…±±äì(€€€€€Ñ¡¥Ì¹}™¥¹¥Í¡Ù…Ñ…ÉQ…Í¬¡ÝÉ…ÁÁ•È°ÍÑ…Ñ”°Ñ…É•ÑA•ÉÍ½¸°½¹ÑÉ½±±•È¤(€€€ô(€ô)ô(