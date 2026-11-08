# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
`versionName` in `src/manifest.json`.

Versions marked *(released)* have a `.rpk` on
[GitHub Releases](https://github.com/IlanVivanco/padel-band/releases). The
others were test builds on the band.

## [0.4.0] — 2026-11-08

### Added
- **Serve indicator:** a grey arc on one corner of the current-set tile marks
  the server's quadrant, with the tile read as the court seen from our side.
  It follows the padel rules: teams alternate games (across sets too), each
  game starts from the right, the side switches every point, and in a
  tiebreak the team whose turn it is serves one point, then two each.
- **Who serves first:** a new match opens on *¿Quién saca?*, where you tap
  the serving team. *Reiniciar partido* asks again.
- Menu option *Saque: Nosotros / Ellos* to fix who served first; the whole
  serve sequence updates.
- Dev emulator (`npm run emulator`): the band screen in the browser, running
  on the app's own logic, with a panel to jump to states and try cue styles.
- Serve unit tests, and UI tests for the who-serves screen, the arc's
  position on the tile with 1-3 sets, and the menu option.

### Changed
- **Swipe right no longer adds a point:** tap adds, swipe left subtracts.
  A right swipe (the band's "back" gesture) now does nothing, and still
  doesn't close the app.
- The `TIE-BREAK` / `PUNTO DE ORO` pill moved just below the scoreboard, so
  the edge between the scoreboard and our half stays visible.
- Menu buttons are slightly shorter, to fit the new option.
- Saved matches also store who served first. Saves from earlier versions
  load fine and ask who serves.

### Fixed
- Test harness: an element reused across views now gets listeners for its
  new events. Before, a tap after the who-serves screen didn't register in
  the tests.

## [0.3.2] — 2026-11-05 *(released)*

### Added
- New app icon: a padel racket emblem, masked to a circle.
- UI test for the menu layout and a menu screenshot.
- `tools/docs_images.py` builds the README images from the UI test
  screenshots.
- This changelog.

### Changed
- **WIN** uses the winner's side color instead of white.

## [0.3.1] — 2026-11-05

### Changed
- Digits, **AD** and **WIN** share one style: 88 px bold. That's the
  largest size where WIN fits the capsule's rounded ends.
- The loser's half shows a drawn bar instead of a `-` character. The dash
  sat 7 px below the center of the digits.

### Added
- UI tests that check the shared style and the bar's position.

## [0.3.0] — 2026-11-05

### Changed
- New palette: orange for them and blue for us, on a black panel. It
  replaces coral and green, stays distinguishable with red-green color
  blindness, and is lighter on the AMOLED battery.
- Fixed-slot layout, so the points, scoreboard and pill stay centered in
  every state.

### Added
- **Advantage:** the leader's half lights up with **AD** and *VENTAJA*, and
  the rival's 40 dims.
- **Set results:** in finished sets, the winner's games are bold and
  underlined and the loser's are dimmed.
- White `TIE-BREAK` / `PUNTO DE ORO` pill on the edge of the scoreboard.
- **Match over:** *GANAMOS* / *GANAN* label under or over **WIN**.
- UI tests in headless Chromium, using a harness adapted from Calc+. They
  check capsule fit, centering, and tap and swipe scoring.

## [0.2.2] — 2026-11-05 *(released)*

### Fixed
- The scoreboard is truly centered. The status caption no longer pushes it
  up, and set numbers are larger.

## [0.2.1] — 2026-11-05

### Fixed
- Scoreboard elements have fixed widths, so they center on the band.

## [0.2.0] — 2026-11-05

### Added
- Scoreboard in the middle: one column per set, with the current set
  highlighted.
- **Tap** on a half scores a point, as well as swipe right.
- Status caption for tiebreak, golden point and match over.

### Changed
- Sides are identified by color, without the *NOSOTROS* / *ELLOS* labels.

## [0.1.0] — 2026-11-05

### Added
- First MVP: split screen (top = them, bottom = us). Swipe right adds a
  point, swipe left subtracts.
- Padel scoring: deuce and advantage, optional golden point, sets to 6 with
  a tiebreak at 6-6, best of 3.
- Haptics, a keep-screen-on option, and the match saved after every point.
- Long-press menu: reset, golden point, keep screen on, exit.
- JSC bytecode build, which the Band 10 needs to sideload an app.

[0.4.0]: https://github.com/IlanVivanco/padel-band/releases/tag/v0.4.0
[0.3.2]: https://github.com/IlanVivanco/padel-band/releases/tag/v0.3.2
[0.2.2]: https://github.com/IlanVivanco/padel-band/releases/tag/v0.2.2
