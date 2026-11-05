import test from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/common/padel.js'

// Points as a string: u = us, t = them.
function play(points, golden = false) {
  let m = p.newMatch(golden)
  for (const s of points) m = p.addPoint(m, s)
  return m
}
const labels = (m) => p.pointLabels(p.score(m), m.golden)
const game = (w) => w.repeat(4)

test('counts 0 / 15 / 30 / 40', () => {
  assert.deepEqual(labels(play('')), { u: '0', t: '0' })
  assert.deepEqual(labels(play('u')), { u: '15', t: '0' })
  assert.deepEqual(labels(play('uut')), { u: '30', t: '15' })
  assert.deepEqual(labels(play('uuut')), { u: '40', t: '15' })
})

test('deuce and advantage', () => {
  assert.deepEqual(labels(play('uuuttt')), { u: '40', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'u')), { u: 'AD', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'ut')), { u: '40', t: '40' })
  assert.deepEqual(labels(play('uuuttt' + 'tt')), { u: '0', t: '0' })
  assert.deepEqual(p.score(play('uuuttt' + 'tt')).games, { u: 0, t: 1 })
})

test('golden point decides at 40-40', () => {
  const m = play('uuuttt' + 'u', true)
  assert.deepEqual(p.score(m).games, { u: 1, t: 0 })
  assert.deepEqual(labels(m), { u: '0', t: '0' })
})

test('set at 6-4, not at 6-5', () => {
  let s = p.score(play(game('u').repeat(5) + game('t').repeat(4) + game('u')))
  assert.deepEqual(s.sets, { u: 1, t: 0 })
  assert.deepEqual(s.setScores, [[6, 4]])
  s = p.score(play(game('u').repeat(5) + game('t').repeat(5) + game('u')))
  assert.deepEqual(s.sets, { u: 0, t: 0 })
  assert.deepEqual(s.games, { u: 6, t: 5 })
})

test('tiebreak at 6-6, to 7 by 2', () => {
  const sixAll = game('u').repeat(5) + game('t').repeat(5) + game('u') + game('t')
  let s = p.score(play(sixAll))
  assert.equal(s.tiebreak, true)
  s = p.score(play(sixAll + 'uuu'))
  assert.deepEqual(labels(play(sixAll + 'uuu')), { u: '3', t: '0' })
  s = p.score(play(sixAll + 'u'.repeat(6) + 't'.repeat(6) + 'u'))
  assert.equal(s.tiebreak, true)
  s = p.score(play(sixAll + 'u'.repeat(6) + 't'.repeat(6) + 'uu'))
  assert.deepEqual(s.setScores, [[7, 6]])
  assert.equal(s.tiebreak, false)
})

test('match ends at 2 sets and ignores further points', () => {
  const set = game('u').repeat(6)
  const m = play(set + set)
  assert.equal(p.score(m).winner, 'u')
  assert.equal(p.addPoint(m, 't'), m)
})

test('remove undoes the side\'s last point', () => {
  assert.deepEqual(labels(p.removePoint(play('uut'), 't')), { u: '30', t: '0' })
  assert.deepEqual(labels(p.removePoint(play('uut'), 'u')), { u: '15', t: '15' })
  assert.equal(p.removePoint(play('t'), 'u').history, 't')
  assert.equal(p.removePoint(play(''), 'u').history, '')
})

test('remove can reopen the game the last point closed', () => {
  const m = p.removePoint(play('uuuu'), 'u')
  assert.deepEqual(p.score(m).games, { u: 0, t: 0 })
  assert.deepEqual(labels(m), { u: '40', t: '0' })
})

test('remove does not reach into a finished game for the other side', () => {
  const m = play('uuuu' + 't')
  assert.equal(p.removePoint(m, 'u').history, m.history)
})

test('serialize round-trips and rejects junk', () => {
  const m = play('uutt', true)
  assert.deepEqual(p.deserialize(p.serialize(m)), m)
  assert.deepEqual(p.deserialize('nope'), p.newMatch(false))
  assert.deepEqual(p.deserialize('{"v":1,"h":"ux"}'), p.newMatch(false))
})
