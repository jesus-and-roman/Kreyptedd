// Kreyptedd — translator.js
// Charge traduction.txt (même dossier) et fournit deux choses :
//  - la traduction de l'interface (#-SYSTEM) : remplace des phrases entières
//    déjà présentes dans le HTML par leur équivalent dans la langue choisie.
//  - la traduction locale du chat (#-CHAT) : remplace mot par mot, sans
//    toucher à la syntaxe ; un mot absent du dictionnaire reste tel quel.
//    Ceci ne modifie JAMAIS le contenu réellement envoyé/stocké/chiffré —
//    uniquement ce qui est affiché à l'écran, localement.
//
// Format attendu de traduction.txt :
//   #-SYSTEM
//   anglais=russe=espagnol=français=allemand
//   "Select a conversation"="Выберите беседу"="Selecciona una conversación"="Sélectionne une conversation"="Wähle eine Unterhaltung aus"
//   #-CHAT
//   anglais=russe=espagnol=français=allemand
//   "School"="Школа"="Escuela"="École"="Schule"
// L'ordre des colonnes après #-SYSTEM et #-CHAT peut différer entre les deux
// sections ; il est lu dynamiquement sur la ligne juste après chaque marqueur.

const KreyptedTranslator = (() => {
  const LANG_NAMES = {
    anglais: "en", english: "en", anglaise: "en",
    russe: "ru", russian: "ru",
    espagnol: "es", spanish: "es",
    français: "fr", francais: "fr", french: "fr",
    allemand: "de", german: "de"
  };

  let dictPromise = null;

  function parse(text) {
    const dict = { SYSTEM: {}, CHAT: {} };
    let section = null;
    let order = null;

    text.split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line) return;
      if (line === "#-SYSTEM") { section = "SYSTEM"; order = null; return; }
      if (line === "#-CHAT") { section = "CHAT"; order = null; return; }
      if (!section) return;

      if (!order) {
        order = line.split("=").map(s => {
          const key = s.trim().toLowerCase();
          return LANG_NAMES[key] || key;
        });
        return;
      }

      const values = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
      if (values.length !== order.length) return;

      const row = {};
      order.forEach((code, i) => { row[code] = values[i]; });
      order.forEach(code => {
        const key = row[code];
        if (key) dict[section][key] = row;
      });
    });

    return dict;
  }

  function loadDict() {
    if (!dictPromise) {
      dictPromise = fetch("traduction.txt")
        .then(res => res.ok ? res.text() : "")
        .then(parse)
        .catch(() => ({ SYSTEM: {}, CHAT: {} }));
    }
    return dictPromise;
  }

  // Traduit l'interface visible sur la page courante vers `lang` (code:
  // "en","ru","es","fr","de"). Ne touche pas aux zones marquées
  // data-no-translate (contenu utilisateur : messages, noms, bios...).
  async function applySystem(lang) {
    if (!lang || lang === "fr") return; // le site est écrit en français à la base
    const dict = await loadDict();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest("[data-no-translate]")) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.tagName === "SCRIPT" || node.parentElement?.tagName === "STYLE") return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const trimmed = node.textContent.trim();
      const row = dict.SYSTEM[trimmed];
      if (row && row[lang]) node.textContent = node.textContent.replace(trimmed, row[lang]);
    });

    // Placeholders et attributs value des boutons/inputs, aussi traduisibles.
    document.querySelectorAll("[placeholder]:not([data-no-translate])").forEach(el => {
      const row = dict.SYSTEM[el.getAttribute("placeholder")];
      if (row && row[lang]) el.setAttribute("placeholder", row[lang]);
    });
  }

  // Remplace mot par mot dans `text` en utilisant le dictionnaire #-CHAT.
  // Ne modifie jamais le texte source stocké — usage purement d'affichage.
  async function translateChat(text, lang) {
    if (!lang || lang === "fr" || !text) return text;
    const dict = await loadDict();
    return text.replace(/[\p{L}\p{N}''-]+/gu, (word) => {
      const row = dict.CHAT[word] || dict.CHAT[word.toLowerCase()];
      if (!row || !row[lang]) return word;
      const translated = row[lang];
      const isCapitalized = word[0] && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
      return isCapitalized ? translated.charAt(0).toUpperCase() + translated.slice(1) : translated;
    });
  }

  function initFromSettings() {
    const siteLang = localStorage.getItem("kreyptedd_site_lang");
    if (siteLang && siteLang !== "fr") applySystem(siteLang);
  }

  return { loadDict, applySystem, translateChat, initFromSettings };
})();

document.addEventListener("DOMContentLoaded", () => KreyptedTranslator.initFromSettings());
