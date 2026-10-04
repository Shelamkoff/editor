// @ts-check
import { createVersionedDataSchema } from '../versionedDataSchema.js'
import { canonicalUrl, isRecord, text } from './helpers.js'

function normalizePerson(person,personIds) {
  if (!isRecord(person)) throw new TypeError('Person entry must be an object')
  if(typeof person.id!=='string'||!person.id)throw new TypeError('Person entry requires a stable id')
  if(personIds.has(person.id))throw new Error('Duplicate person id: '+person.id)
  personIds.add(person.id)
  if (!Array.isArray(person.links)) throw new TypeError('Person links must be an array')
  const linkIds=new Set()
  return {
    id:person.id,
    avatar: canonicalUrl(typeof person.avatar === 'string' ? person.avatar : '', 'media'),
    name: text(person.name),
    role: text(person.role),
    bio: text(person.bio),
    links: person.links.map(link => {
      if (!isRecord(link)) throw new TypeError('Person link must be an object')
      if(typeof link.id!=='string'||!link.id)throw new TypeError('Person link requires a stable id')
      if(linkIds.has(link.id))throw new Error('Duplicate person link id: '+link.id)
      linkIds.add(link.id)
      return {
        id:link.id,
        type: text(link.type),
        url: canonicalUrl(typeof link.url === 'string' ? link.url : '', 'link'),
      }
    }),
  }
}

export const personDataSchema = createVersionedDataSchema({
  currentVersion: 2,
  createDefault: () => ({
    persons: [{ id:'person-0', avatar: '', name: '', role: '', bio: '', links: [] }],
  }),
  normalize(input) {
    if (!isRecord(input) || !Array.isArray(input.persons) || input.persons.length === 0) {
      throw new TypeError('Person data must contain at least one person')
    }
    const ids=new Set()
    return { persons: input.persons.map(person=>normalizePerson(person,ids)) }
  },
  mapRichText(data, transform) {
    data.persons = data.persons.map(person => ({
      ...person,
      name: transform(person.name, 'person:' + person.id + ':name'),
      role: transform(person.role, 'person:' + person.id + ':role'),
      bio: transform(person.bio, 'person:' + person.id + ':bio'),
    }))
  },
})
