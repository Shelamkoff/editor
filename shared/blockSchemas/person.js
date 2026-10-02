// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, text } from './helpers.js'

function normalizePerson(person) {
  if (!isRecord(person)) throw new TypeError('Person entry must be an object')
  if (!Array.isArray(person.links)) throw new TypeError('Person links must be an array')
  return {
    avatar: canonicalUrl(typeof person.avatar === 'string' ? person.avatar : '', 'media'),
    name: text(person.name),
    role: text(person.role),
    bio: text(person.bio),
    links: person.links.map(link => {
      if (!isRecord(link)) throw new TypeError('Person link must be an object')
      return {
        type: text(link.type),
        url: canonicalUrl(typeof link.url === 'string' ? link.url : '', 'link', { allowEmpty: false }),
      }
    }),
  }
}

export const personDataSchema = createVersionedDataSchema({
  currentVersion: 1,
  legacyVersion: 1,
  createDefault: () => ({
    persons: [{ avatar: '', name: '', role: '', bio: '', links: [] }],
  }),
  normalize(input) {
    if (!isRecord(input) || !Array.isArray(input.persons) || input.persons.length === 0) {
      throw new TypeError('Person data must contain at least one person')
    }
    return { persons: input.persons.map(normalizePerson) }
  },
  mapRichText(data, transform) {
    data.persons = data.persons.map((person, index) => ({
      ...person,
      bio: transform(person.bio, 'person:' + index + ':bio'),
    }))
  },
})
