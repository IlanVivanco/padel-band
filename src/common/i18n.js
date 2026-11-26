// On-screen text in the five languages the app speaks. The page keeps the
// chosen language in its prefs and binds one of these tables whole.
//
// Terms follow each language's rulebook: FIP's Rules of Padel (2026) in
// English and in French (Belgian federation's translation), FITP's Regole
// del padel in Italian, the DTB and ÖTV for German.
//
// The screen is 212px wide and the band doesn't wrap text, so every string
// has to fit its box on one line (the UI tests check each language). A
// label that takes two lines is two keys, one <text> per line. Spaces are
// plain ones: no narrow no-break space before a French '?'.
//
// The labels under the big points (adv, wonUs, wonThem) sit where the
// capsule curves in: about 8 capital letters at most.

export var LANGS = ['es', 'en', 'fr', 'de', 'it']

// Each language by its own name, so it can be found from any other.
export var LANG_NAMES = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', it: 'Italiano' }

var S = {
  es: {
    app: 'Pádel',
    askTitle: '¿Quién saca?',
    askThem: 'SACAN',
    askUs: 'SACAMOS',
    adv: 'VENTAJA',
    wonUs: 'GANAMOS',
    wonThem: 'GANAN',
    tiebreak: 'TIE-BREAK',
    golden: 'PUNTO DE ORO',
    star: 'STAR POINT',
    serveUs: 'Sacamos',
    serveThem: 'Sacan',
    newMatch: 'Nuevo',
    history: 'Historial',
    more: 'Más',
    deuce: 'Iguales',
    deuceAdv: 'Ventaja',
    deuceGold: 'Punto de oro',
    deuceStar: 'Star Point',
    screen1: 'Pantalla',
    screen2: 'fija',
    language: 'Idioma',
    histEmpty: 'Sin partidos todavía',
    confirm: '¿Empezar otro?'
  },
  en: {
    app: 'Padel',
    askTitle: 'Who serves?',
    askThem: 'THEM',
    askUs: 'US',
    adv: 'ADV',
    wonUs: 'WE WON',
    wonThem: 'THEY WON',
    tiebreak: 'TIE-BREAK',
    golden: 'GOLDEN POINT',
    star: 'STAR POINT',
    serveUs: 'We serve',
    serveThem: 'They serve',
    newMatch: 'New',
    history: 'History',
    more: 'More',
    deuce: 'Deuce',
    deuceAdv: 'Advantage',
    deuceGold: 'Golden point',
    deuceStar: 'Star Point',
    screen1: 'Screen',
    screen2: 'stays on',
    language: 'Language',
    histEmpty: 'No matches yet',
    confirm: 'New match?'
  },
  fr: {
    app: 'Padel',
    askTitle: 'Qui sert ?',
    askThem: 'EUX',
    askUs: 'NOUS',
    adv: 'AVANTAGE',
    wonUs: 'GAGNÉ',
    wonThem: 'GAGNÉ',
    tiebreak: 'TIE-BREAK',
    golden: 'POINT EN OR',
    star: 'STAR POINT',
    serveUs: 'On sert',
    serveThem: 'Ils servent',
    newMatch: 'Nouveau',
    history: 'Historique',
    more: 'Plus',
    deuce: 'Égalité',
    deuceAdv: 'Avantage',
    deuceGold: 'Point en or',
    deuceStar: 'Star Point',
    screen1: 'Écran',
    screen2: 'allumé',
    language: 'Langue',
    histEmpty: 'Aucun match',
    confirm: 'Rejouer ?'
  },
  de: {
    app: 'Padel',
    askTitle: 'Wer schlägt auf?',
    askThem: 'SIE',
    askUs: 'WIR',
    adv: 'VORTEIL',
    wonUs: 'SIEG',
    wonThem: 'SIEG',
    tiebreak: 'TIEBREAK',
    golden: 'GOLDEN POINT',
    star: 'STAR POINT',
    serveUs: 'Unser Aufschlag',
    serveThem: 'Ihr Aufschlag',
    newMatch: 'Neu',
    history: 'Verlauf',
    more: 'Mehr',
    deuce: 'Einstand',
    deuceAdv: 'Vorteil',
    deuceGold: 'Golden Point',
    deuceStar: 'Star Point',
    screen1: 'Display',
    screen2: 'bleibt an',
    language: 'Sprache',
    histEmpty: 'Noch keine Spiele',
    confirm: 'Neues Spiel?'
  },
  it: {
    app: 'Padel',
    askTitle: 'Chi serve?',
    askThem: 'LORO',
    askUs: 'NOI',
    adv: 'VANT.',
    wonUs: 'VINTO',
    wonThem: 'VINTO',
    tiebreak: 'TIE-BREAK',
    golden: 'PUNTO DECISIVO',
    star: 'STAR POINT',
    serveUs: 'Serviamo',
    serveThem: 'Servono',
    newMatch: 'Nuova',
    history: 'Cronologia',
    more: 'Altro',
    deuce: 'Parità',
    deuceAdv: 'Vantaggi',
    deuceGold: 'Punto decisivo',
    deuceStar: 'Star Point',
    screen1: 'Schermo',
    screen2: 'acceso',
    language: 'Lingua',
    histEmpty: 'Nessuna partita',
    confirm: 'Nuova partita?'
  }
}

export var DEFAULT_LANG = 'es'

// A known language, or the default for anything else (an old save, a typo).
export function langOf(l) {
  return LANGS.indexOf(l) >= 0 ? l : DEFAULT_LANG
}

export function strings(l) {
  return S[langOf(l)]
}

export function nextLang(l) {
  return LANGS[(LANGS.indexOf(langOf(l)) + 1) % LANGS.length]
}
