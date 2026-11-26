import test from 'node:test'
import assert from 'node:assert/strict'
import { LANGS, LANG_NAMES, DEFAULT_LANG, langOf, strings, nextLang } from '../src/common/i18n.js'

test('every language has every key, none empty', () => {
  const keys = Object.keys(strings('es')).sort()
  for (const l of LANGS) {
    const t = strings(l)
    assert.deepEqual(Object.keys(t).sort(), keys, l)
    for (const k of keys) assert.ok(typeof t[k] === 'string' && t[k].trim(), l + '.' + k)
    assert.ok(LANG_NAMES[l], l + ' has a name')
  }
})

test('the band gets plain text: no narrow or no-break spaces, no curly quotes', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(strings(l))) {
    assert.doesNotMatch(v, /[  ‘’“”]/, l + '.' + k)
  }
})

test('unknown languages fall back to Spanish', () => {
  assert.equal(DEFAULT_LANG, 'es')
  for (const l of [undefined, null, '', 'pt', 42]) assert.equal(langOf(l), 'es')
  assert.equal(strings('xx'), strings('es'))
})

test('nextLang cycles through all five and back', () => {
  let l = 'es'
  const seen = []
  for (let i = 0; i < LANGS.length; i++) { seen.push(l); l = nextLang(l) }
  assert.deepEqual(seen, ['es', 'en', 'fr', 'de', 'it'])
  assert.equal(l, 'es')
  assert.equal(nextLang('bogus'), 'en')
})
