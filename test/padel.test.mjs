import test from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../src/common/padel.js'

// Points as a string: u = us, t = them.
function play(points, golden = false) {
  let m = p.newMatch(golden)
  for (const s of points) m = p.addPoint(m, s)
  return m
}
const labels = (m) => p.pointLabels(p.score(m))
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

test('Star Point: advantage at the first two deuces, one point at the third', () => {
  const star = (pts) => play(pts, 'star')
  const d1 = 'uuuttt'
  // first deuce: advantage, and the advantage team can win it
  assert.deepEqual(labels(star(d1 + 'u')), { u: 'AD', t: '40' })
  assert.deepEqual(p.score(star(d1 + 'uu')).games, { u: 1, t: 0 })
  // second deuce: advantage again (either team may hold it)
  assert.deepEqual(labels(star(d1 + 'ut')), { u: '40', t: '40' })
  assert.equal(p.decidingPoint(star(d1 + 'ut')), false)
  assert.deepEqual(labels(star(d1 + 'ut' + 't')), { u: '40', t: 'AD' })
  assert.deepEqual(p.score(star(d1 + 'ut' + 'tt')).games, { u: 0, t: 1 })
  // third deuce: the Star Point decides
  const d3 = d1 + 'ut' + 'tu'
  assert.deepEqual(labels(star(d3)), { u: '40', t: '40' })
  assert.equal(p.decidingPoint(star(d3)), true)
  assert.deepEqual(p.score(star(d3 + 't')).games, { u: 0, t: 1 })
  assert.deepEqual(p.score(star(d3 + 'u')).games, { u: 1, t: 0 })
  // undo across it reopens the Star Point
  const back = p.removePoint(star(d3 + 'u'), 'u')
  assert.equal(back.history, d3)
  assert.equal(p.decidingPoint(back), true)
})

test('deciding point: golden at every deuce, never with advantage or in a tiebreak', () => {
  assert.equal(p.decidingPoint(play('uuuttt', 'gold')), true)
  assert.equal(p.decidingPoint(play('uuuttt', 'adv')), false)
  assert.equal(p.decidingPoint(play('uuuttt' + 'ut' + 'tu', 'adv')), false)
  assert.equal(p.decidingPoint(play('uutt', 'star')), false)
})

test('deuce mode survives edits and the save; old saves map to it', () => {
  let m = p.setDeuce(play('uut', 'adv'), 'star')
  m = p.addPoint(m, 'u')
  assert.equal(m.deuce, 'star')
  assert.equal(p.deserialize(p.serialize(m)).deuce, 'star')
  assert.equal(p.deserialize('{"v":1,"h":"ut","g":true}').deuce, 'gold')
  assert.equal(p.deserialize('{"v":1,"h":"ut","g":false}').deuce, 'adv')
  assert.equal(p.deserialize('{"v":1,"h":"ut","d":"bogus"}').deuce, 'adv')
  assert.equal(p.newMatch(true).deuce, 'gold')
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
  // us has nothing to remove: the last point goes instead
  assert.equal(p.removePoint(play('t'), 'u').history, '')
  assert.equal(p.removePoint(play(''), 'u').history, '')
})

test('remove can reopen the game the last point closed', () => {
  const m = p.removePoint(play('uuuu'), 'u')
  assert.deepEqual(p.score(m).games, { u: 0, t: 0 })
  assert.deepEqual(labels(m), { u: '40', t: '0' })
})

test('with nothing of its own to remove, a swipe undoes the last point', () => {
  // us: no point in the current game, so their 15 goes
  assert.equal(p.removePoint(play('uuuu' + 't'), 'u').history, 'uuuu')
  // at 0-0 after a game, either half reopens it
  assert.equal(p.removePoint(play('uuuu'), 't').history, 'uuu')
})

test('swiping one half only rewinds a set, and a won match, back to 0-0', () => {
  const set64 = (game('u') + game('t')).repeat(4) + game('u') + game('u')
  for (const side of ['u', 't']) {
    let m = play(set64)
    let n = 0
    while (m.history.length && n++ < 1000) m = p.removePoint(m, side)
    assert.equal(m.history, '', side)
  }
  const won = play(set64 + set64)
  assert.equal(p.score(won).winner, 'u')
  for (const side of ['u', 't']) {
    const back = p.removePoint(won, side)
    assert.equal(back.history.length, won.history.length - 1, side)
    assert.equal(p.score(back).winner, null, side)
  }
})

test('serialize round-trips and rejects junk', () => {
  const m = play('uutt', true)
  assert.deepEqual(p.deserialize(p.serialize(m)), m)
  assert.deepEqual(p.deserialize('nope'), p.newMatch(false))
  assert.deepEqual(p.deserialize('{"v":1,"h":"ux"}'), p.newMatch(false))
})

// --- serve -----------------------------------------------------------------

const withFirst = (m, f) => p.setFirst(m, f)
const svFull = (points, first, golden = false) => p.serve(withFirst(play(points, golden), first))
// Server, side and corner only; `players` has its own tests.
const sv = (points, first, golden) => {
  const r = svFull(points, first, golden)
  if (!r) return r
  const { players, ...rest } = r
  return rest
}
const corner = (points, first, golden) => sv(points, first, golden).corner

test('no serve before the first server is chosen, or after the match', () => {
  assert.equal(p.serve(play('uu')), null)
  const set = game('u').repeat(6)
  assert.equal(sv(set + set, 'u'), null)
})

test('each game starts from the right and alternates sides every point', () => {
  assert.deepEqual(sv('', 'u'), { server: 'u', side: 'R', corner: 'BR' })
  assert.deepEqual(sv('t', 'u'), { server: 'u', side: 'L', corner: 'BL' })
  assert.deepEqual(sv('tu', 'u'), { server: 'u', side: 'R', corner: 'BR' })
  // deuce and advantage keep alternating
  assert.equal(sv('uuuttt', 'u').side, 'R')
  assert.equal(sv('uuuttt' + 'u', 'u').side, 'L')
})

test('their right is the screen\'s left (they face us)', () => {
  assert.deepEqual(sv('', 't'), { server: 't', side: 'R', corner: 'TL' })
  assert.deepEqual(sv('u', 't'), { server: 't', side: 'L', corner: 'TR' })
})

test('teams alternate games, also across sets', () => {
  assert.equal(sv(game('u'), 'u').server, 't')
  assert.equal(sv(game('u') + game('t'), 'u').server, 'u')
  // 6-4 = 10 games: the first server serves the first game of set 2
  const set64 = (game('u') + game('t')).repeat(4) + game('u') + game('u')
  assert.equal(p.score(play(set64)).setScores.length, 1)
  assert.equal(sv(set64, 'u').server, 'u')
  // 6-3 = 9 games: the other team opens set 2
  const set63 = (game('u') + game('t')).repeat(3) + game('u').repeat(3)
  assert.equal(sv(set63, 'u').server, 't')
})

test('tiebreak: one point, then two each, sides alternating', () => {
  // 6-6 after 12 games: the first server opens the tiebreak
  const sixAll = (game('u') + game('t')).repeat(6)
  assert.equal(p.score(play(sixAll)).tiebreak, true)
  const servers = []
  const sides = []
  for (let k = 0; k < 7; k++) {
    const pts = 'ut'.repeat(4).slice(0, k)
    const s = sv(sixAll + pts, 'u')
    servers.push(s.server)
    sides.push(s.side)
  }
  assert.deepEqual(servers, ['u', 't', 't', 'u', 'u', 't', 't'])
  assert.deepEqual(sides, ['R', 'L', 'R', 'L', 'R', 'L', 'R'])
  // the tiebreak counts as a game: the team that received first opens the next set
  const tb = sixAll + 'u'.repeat(7)
  assert.equal(p.score(play(tb)).setScores.length, 1)
  assert.equal(sv(tb, 'u').server, 't')
})

test('golden point keeps the side rule', () => {
  assert.equal(corner('uuuttt', 'u', true), 'BR')
})

test('changing the first server re-labels the match', () => {
  const m = p.setFirst(play('u'), 'u')
  assert.equal(p.serve(m).corner, 'BL')
  assert.equal(p.serve(p.setFirst(m, 't')).corner, 'TR')
})

test('first server survives every edit and the save', () => {
  let m = p.setFirst(p.newMatch(false), 't')
  m = p.addPoint(m, 'u')
  m = p.removePoint(m, 'u')
  m = p.setDeuce(m, 'gold')
  assert.equal(m.first, 't')
  assert.equal(p.deserialize(p.serialize(m)).first, 't')
  // saves from before 0.4.0 have no `f`
  assert.equal(p.deserialize('{"v":1,"h":"ut","g":false}').first, null)
})

test('the match id survives every edit and the save', () => {
  let m = p.setId(p.setFirst(p.newMatch(false), 'u'), 1234)
  m = p.addPoint(m, 'u')
  m = p.removePoint(m, 't')
  m = p.setDeuce(m, 'gold')
  m = p.setFirst(m, 't')
  assert.equal(m.id, 1234)
  assert.equal(p.deserialize(p.serialize(m)).id, 1234)
  assert.equal(p.deserialize('{"v":1,"h":"ut","g":false,"f":"u"}').id, null)
})

// Which player of each team serves: 0 = the one who served the team's first
// turn, 1 = the partner.
const players = (points, first) => svFull(points, first).players

test('players alternate within each team, game after game', () => {
  // game 0: u player 0 serves, t's next turn is their player 0
  assert.deepEqual(players('', 'u'), { u: 0, t: 0 })
  // game 1: t player 0 serves; u's next turn is their player 1
  assert.deepEqual(players(game('u'), 'u'), { u: 1, t: 0 })
  assert.deepEqual(players(game('u').repeat(2), 'u'), { u: 1, t: 1 })
  assert.deepEqual(players(game('u').repeat(3), 'u'), { u: 0, t: 1 })
  assert.deepEqual(players(game('u').repeat(4), 'u'), { u: 0, t: 0 })
  // points inside a game don't change it
  assert.deepEqual(players(game('u') + 'ut', 'u'), { u: 1, t: 0 })
  // mirrored when they serve first
  assert.deepEqual(players(game('u'), 't'), { t: 1, u: 0 })
})

test('players keep rotating through the tiebreak', () => {
  const sixAll = (game('u') + game('t')).repeat(6) // 12 games: turn 12, u serves
  const seq = []
  for (let k = 0; k < 5; k++) {
    const s = svFull(sixAll + 'ut'.repeat(4).slice(0, k), 'u')
    seq.push(s.server + s.players[s.server])
  }
  // turn 12 = u0, then t0 for two points, u1 for two
  assert.deepEqual(seq, ['u0', 't0', 't0', 'u1', 'u1'])
})
