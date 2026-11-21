// Dev-only extras: Proefrit (marks, End drive…), the dev overlay and ?scenario=
// URLs. They are on in `npm run dev`, and on the hosted build only with ?dev in
// the address. Everything else is the game a player gets.
//
// `typeof` keeps this importable from plain Node, where import.meta.env and
// location do not exist (the headless tools import src modules directly).
const env = typeof import.meta.env !== 'undefined' ? import.meta.env : {};

export const DEV = !!env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev'));
