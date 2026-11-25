// The site's language: English, or Telugish (Telugu written in English letters, mixed with the
// English tech words people actually use, e.g. "Rover ki commands ivvu, tarvata Run nokku").
//
// Translated screens keep their text in a { en: {...}, te: {...} } table and read it through
// translator(). The switch lives in the top bar (app.js); the choice is saved on this device and
// announced with a 'kv-lang-changed' event so open screens can re-render.

const KEY = 'knowverse.lang';

export const LANGS = [
  { id: 'en', label: 'EN', name: 'English', html: 'en' },
  { id: 'te', label: 'Telugish', name: 'Telugu in English letters', html: 'te-Latn' },
];

let lang = read();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return LANGS.some((l) => l.id === v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export const getLang = () => lang;

/** The BCP 47 tag for the `lang` attribute (Telugish is Telugu in Latin script). */
export const htmlLang = (id = lang) => LANGS.find((l) => l.id === id)?.html || 'en';

export function setLang(id) {
  if (id === lang || !LANGS.some((l) => l.id === id)) return;
  lang = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked: keep it for this visit */
  }
  document.dispatchEvent(new CustomEvent('kv-lang-changed', { detail: { lang } }));
}

/**
 * A lookup over a { en, te } table. Missing Telugish falls back to English; function entries are
 * called with the extra arguments (for text with numbers in it).
 */
export function translator(table) {
  return (key, ...args) => {
    const v = table[lang]?.[key] ?? table.en[key];
    return typeof v === 'function' ? v(...args) : v ?? key;
  };
}

/** Pick the current language's value from an { en, te } pair (or return a plain value as is). */
export const pick = (o, l = lang) => (o && typeof o === 'object' && 'en' in o ? o[l] ?? o.en : o);
