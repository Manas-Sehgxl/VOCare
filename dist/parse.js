// Turns what the patient said into registration details. Everything here is a
// pure function of the text, so the same rules run for live speech, the
// sample buttons and the tests in parse.test.mjs.

export const FIELDS = ["name", "age", "village", "complaint"];

// key() makes two spellings of the same word compare equal: lowercase,
// no punctuation, nukta dropped (ज़ → ज) and chandrabindu read as anusvara
// (गाँव → गांव). Latin words are also loosened, because recognisers and
// people spell Hindi in Roman script many ways (haan/han, teen/tin).
export function key(word) {
  let k = word.toLowerCase().normalize("NFD")
    .replace(/़/g, "").replace(/ँ/g, "ं").normalize("NFC")
    .replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
  if (/^[a-z']+$/.test(k)) {
    k = k.replace(/'/g, "").replace(/ee/g, "i").replace(/oo/g, "u")
      .replace(/w/g, "v").replace(/(.)\1+/g, "$1");
  }
  return k;
}

export function words(text, splitHyphen = false) {
  const sep = splitHyphen ? /[\s,.;:!?।|\-–—]+/ : /[\s,.;:!?।|]+/;
  return String(text).split(sep).map(w => w.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "")).filter(Boolean);
}

const set = list => new Set(list.flatMap(w => w.split("|")).map(key));

// ---------- numbers ----------

const HINDI = ("एक दो तीन चार पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस " +
  "इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस " +
  "इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ " +
  "इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी " +
  "इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे सौ").split(" ");

const ROMAN = ("ek|ik do teen|tin char|chaar panch|paanch|panj chhah|chhe|chah|chhai saat|sat aath|ath nau|nao das|dus " +
  "gyarah|gyara barah|bara|baarah terah|tera chaudah|chauda|chodah pandrah|pandra solah|sola satrah|satra|sattrah atharah|athara|attharah unnis|unees|unis bees|bis " +
  "ikkis|ikkees|ekkis bais|baees|baais teis|teyis chaubis|chaubees|chobis pachchis|pachis|pachees chhabbis|chabbis sattais|satais|sattaees atthais|athais untis|untees tis|tees " +
  "iktis|iktees battis|battees|batis taintis|taintees|tetis chauntis|chautees|chontis paintis|paintees|pentis chhattis|chattis saintis|saintees|sentis adtis|adtees|artis untalis|untalees chalis|chalees|chaalis|chaalees " +
  "iktalis|iktalees bayalis|bayalees taintalis|taintalees chavalis|chavalees|chauvalis paintalis|paintalees chhiyalis|chhiyalees|chiyalis saintalis|saintalees adtalis|adtalees|artalis unchas|unchaas pachas|pachaas " +
  "ikyavan|ekyavan|ikyawan bavan|baavan|bawan tirpan|tirepan chauvan|chauwan|chovan pachpan chhappan|chappan sattavan|satavan|sattawan atthavan|athavan unsath|unsaath saath " +
  "iksath|iksaath basath|baasath tirsath|tirsaath chaunsath|chausath|chonsath painsath|pensath chhiyasath|chhiyaasath sadsath|sarsath adsath|arsath unhattar sattar|satar " +
  "ikhattar|ekhattar bahattar tihattar chauhattar pachhattar|pachattar chhihattar|chihattar sathattar|satattar athhattar|athattar unasi|unyasi|unnasi assi|asi " +
  "ikyasi|ekyasi bayasi tirasi chaurasi pachasi|pachaasi chhiyasi sattasi atthasi|athasi navasi|nawasi nabbe|nabe " +
  "ikyanve|ekyanve banve|baanve tiranve chauranve pachanve|pachaanve chhiyanve sattanve atthanve ninyanve|ninyaanve sau").split(" ");

// English number words, in Latin and as hi-IN recognition writes them.
const EN_UNITS = ["zero|ज़ीरो", "one|वन", "two|टू", "three|थ्री", "four|फोर", "five|फाइव", "six|सिक्स", "seven|सेवन", "eight|एट", "nine|नाइन",
  "ten|टेन", "eleven|इलेवन", "twelve|ट्वेल्व", "thirteen|थर्टीन", "fourteen|फोर्टीन", "fifteen|फिफ्टीन", "sixteen|सिक्सटीन", "seventeen|सेवनटीन", "eighteen|एटीन", "nineteen|नाइनटीन"];
const EN_TENS = { 20: "twenty|ट्वेंटी", 30: "thirty|थर्टी", 40: "forty|फोर्टी", 50: "fifty|फिफ्टी", 60: "sixty|सिक्सटी",
  70: "seventy|सेवंटी|सेवेंटी", 80: "eighty|एटी|ऐटी", 90: "ninety|नाइंटी|नाइनटी" };

export const NUMBER_WORDS = { HINDI, ROMAN };
const NUM = new Map();
HINDI.forEach((w, i) => NUM.set(key(w), i + 1));
ROMAN.forEach((ws, i) => ws.split("|").forEach(w => NUM.set(key(w), i + 1)));
EN_UNITS.forEach((ws, i) => ws.split("|").forEach(w => i && NUM.set(key(w), i)));
const TENS = new Map();
for (const [n, ws] of Object.entries(EN_TENS)) ws.split("|").forEach(w => TENS.set(key(w), Number(n)));
NUM.set("hundred", 100);

const digits = s => s.replace(/[०-९]/g, d => "0123456789"["०१२३४५६७८९".indexOf(d)]);

// numbers() finds every number in the text: digits, Hindi words in either
// script, and English words including "fifty five".
export function numbers(text) {
  const ks = words(digits(text), true).map(key);
  const out = [];
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (/^\d{1,3}$/.test(k)) out.push(Number(k));
    else if (TENS.has(k)) {
      const unit = NUM.get(ks[i + 1]);
      if (unit && unit < 10) { out.push(TENS.get(k) + unit); i++; } else out.push(TENS.get(k));
    } else if (NUM.has(k)) out.push(NUM.get(k));
  }
  return out;
}

// ---------- age ----------

const APPROX = set(["lagbhag|lagbag|लगभग|karib|kareeb|qareeb|करीब|takriban|takreeban|तकरीबन|aaspaas|आसपास|shayad|शायद",
  "about|around|approximately|approx|roughly|nearly|maybe|अबाउट"]);

// parseAge keeps the patient's uncertainty: "lagbhag pachpan saal" is
// {value: 55, approx: true}, never a bare 55. Null means ask again.
export function parseAge(text) {
  const nums = numbers(text).filter(n => n > 0 && n <= 120);
  if (!nums.length) return null;
  const approx = words(text).some(w => APPROX.has(key(w)));
  const [a, b] = nums;
  if (b && b > a && b - a <= 10) return { value: a, upper: b, approx: true };
  return { value: a, approx };
}

export function formatAge(info, lang = "en") {
  if (!info) return "";
  const n = info.upper ? `${info.value}–${info.upper}` : String(info.value);
  if (!info.approx) return n;
  return lang === "hi" ? `लगभग ${n}` : `approximately ${n}`;
}

// ---------- name and village ----------

const NAME_LEAD = set(["mera|meri|mere|hamara|humara|my|name|naam|is|i|am|im|main|mai|this|ye|yeh",
  "मेरा|मेरी|हमारा|नाम|मैं|मै|यह|ये|माय|नेम|इज"]);
const TAIL = set(["hai|he|h|hain|hu|hun|hoon", "है|हैं|हूं|हु|हूँ"]);
const PLACE_LEAD = set(["main|mai|hum|ham|mera|meri|hamara|gaon|gaanv|gav|village|my|is|from|i|am|im|the|mohalla|basti|area",
  "मैं|मै|हम|मेरा|मेरी|हमारा|गांव|गाँव|गाव|मोहल्ला|बस्ती|विलेज"]);
const PLACE_TAIL = set(["se|hain|hu|hun|hoon|hai|ka|ki|ke|rehne|rahne|vala|vali|vale|gaon|gaanv|village|mohalla|basti|aaye|aayi|aya|aayein",
  "से|हैं|हूं|हूँ|है|का|की|के|रहने|वाला|वाली|वाले|गांव|गाँव|मोहल्ला|बस्ती|आए|आई|आया"]);

function trimWords(ws, lead, tail) {
  let i = 0, j = ws.length;
  while (i < j - 1 && lead.has(key(ws[i]))) i++;
  while (j > i + 1 && tail.has(key(ws[j - 1]))) j--;
  return ws.slice(i, j);
}

// A name is kept exactly as heard apart from the words around it; an
// all-lowercase Latin word only gets a capital letter.
export function parseName(text) {
  const ws = trimWords(words(text), NAME_LEAD, TAIL);
  if (!ws.length || ws.every(w => NAME_LEAD.has(key(w)) || TAIL.has(key(w)))) return null;
  return ws.map(w => (/^[a-z]+$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

export function parseVillage(text) {
  const ws = trimWords(words(text), PLACE_LEAD, PLACE_TAIL);
  if (!ws.length || ws.every(w => PLACE_LEAD.has(key(w)) || PLACE_TAIL.has(key(w)))) return null;
  return ws.map(w => (/^[a-z]+$/.test(w) ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

// Demo list of place names shared by several districts. Only these trigger
// the district question, so most patients are never asked for one.
const AMBIGUOUS = set(["sultanpur|chandpur|madhopur", "सुल्तानपुर|चांदपुर|माधोपुर"]);
export const ambiguousPlace = place => AMBIGUOUS.has(key(place.replace(/\s+/g, "")));

const DISTRICT_WORDS = set(["zila|jila|zilla|district|hai|mera|hamara|ka|naam", "ज़िला|जिला|डिस्ट्रिक्ट|है|मेरा|हमारा|का|नाम"]);
export function parseDistrict(text) {
  const ws = words(text).filter(w => !DISTRICT_WORDS.has(key(w)));
  return ws.length ? ws.join(" ") : null;
}

// ---------- intents ----------

const YES = set(["haan|han|ha|haanji|hanji|ji|jee|yes|yeah|yep|sahi|thik|theek|ok|okay|confirm|correct|bilkul|right|done|shuru|start|chalo",
  "हां|हाँ|जी|सही|ठीक|बिल्कुल|ओके|कन्फर्म|करेक्ट|शुरू|चलो|यस"]);
const NEG = set(["nahi|nahin|nai|nahee|na|no|not|nope|mat|dont", "नहीं|नही|ना|नो|मत"]);
const WRONG = set(["galat|wrong|incorrect|mistake|galti", "गलत|ग़लत|गलती|रॉन्ग"]);
const CHANGE = set(["change|badlo|badliye|badal|badle|badlein|sudhar|sudharo|sudhariye|edit|update|correction",
  "बदलो|बदलिए|बदल|बदलें|बदलना|सुधार|सुधारें|सुधारिए|चेंज|करेक्शन"]);
const HELP = set(["help|madad|sahayata|staff|assistance|helper", "मदद|सहायता|कर्मचारी|स्टाफ|हेल्प"]);
const REPEAT = set(["repeat|again|dobara|phir|fir|dohraiye|dohrao", "दोबारा|फिर|दोहराइए|दोहराओ|दोहराएं|रिपीट"]);
const MORE_TIME = set(["wait|ruko|rukiye|ruk|samay|time|minute|minat", "रुको|रुकिए|रुक|समय|टाइम|मिनट"]);

// intent() reads short replies only. A long sentence is an answer, even if
// it happens to contain "help" or "nahi".
export function intent(text) {
  const ks = words(text).map(key);
  if (!ks.length || ks.length > 5) return null;
  const has = s => ks.some(k => s.has(k));
  if (has(HELP)) return "help";
  if (has(REPEAT)) return "repeat";
  if (has(MORE_TIME)) return "moreTime";
  if (has(WRONG) || (has(NEG) && has(YES))) return "wrong";
  if (has(CHANGE)) return "change";
  if (has(NEG)) return "no";
  if (has(YES)) return "yes";
  return null;
}

export function language(text) {
  const ks = words(text).map(key);
  if (ks.some(k => ["hindi", "हिंदी", "हिन्दी", "hindee"].map(key).includes(k))) return "hi";
  if (ks.some(k => ["english", "इंग्लिश", "अंग्रेजी", "angrezi", "अंग्रेज़ी"].map(key).includes(k))) return "en";
  return null;
}

const FIELD_WORDS = [
  set(["naam|nam|name", "नाम|नेम"]),
  set(["umar|umr|umra|age|aayu|ayu", "उम्र|उमर|एज|आयु"]),
  set(["gaon|gaanv|gav|gaav|village|mohalla|basti|jagah|address", "गांव|गाँव|गाव|मोहल्ला|बस्ती|जगह|विलेज|एड्रेस"]),
  set(["takleef|taklif|problem|complaint|pareshani|bimari|dikkat|takleef", "तकलीफ|तकलीफ़|परेशानी|बीमारी|दिक्कत|प्रॉब्लम"]),
];

export function fieldOf(text) {
  for (const k of words(text).map(key)) {
    const i = FIELD_WORDS.findIndex(s => s.has(k));
    if (i >= 0) return FIELDS[i];
  }
  return null;
}

// ---------- corrections ----------

const FILLER = set(["mera|meri|my|is|the|hai|ka|ki|aur|toh|to", "मेरा|मेरी|है|का|की|तो"]);
const VALUE_LEAD = set(["balki|but|it|its|is|vo|voh|vah|sahi|correct|actually|bas", "बल्कि|वो|वह|सही|बस"]);
const SWITCH = set(["but|it|its|balki", "बल्कि"]);

// parseCorrection understands "Gaon Rampur nahi, Ramnagar hai" and
// "change village to Ramnagar". Without a field word it works out the field
// from the wrong value, so "Rampur nahi, Ramnagar" also works. A field with
// no new value ("gaon badlo") returns value null, meaning ask for it again.
export function parseCorrection(text, answers = {}) {
  const ws = words(text), ks = ws.map(key);
  const fi = ks.findIndex(k => FIELD_WORDS.some(s => s.has(k)));
  const field = fi >= 0 ? FIELDS[FIELD_WORDS.findIndex(s => s.has(ks[fi]))] : null;

  let neg = -1;
  ks.forEach((k, i) => { if (NEG.has(k)) neg = i; });
  if (neg > 0 && neg < ws.length - 1) {
    const from = fi >= 0 && fi < neg ? fi + 1 : 0;
    let old = ws.slice(from, neg).filter(w => !FILLER.has(key(w)));
    let after = ws.slice(neg + 1);
    // English puts the wrong value after the negation: "not Rampur, it is Ramnagar".
    const split = after.findIndex((w, i) => i > 0 && SWITCH.has(key(w)));
    if (!old.length && split > 0) {
      old = after.slice(0, split);
      after = after.slice(split);
    }
    const value = trimWords(after, VALUE_LEAD, TAIL)
      .filter((w, i, a) => !(a.length > 1 && (VALUE_LEAD.has(key(w)) || TAIL.has(key(w)))));
    if (old.length && value.length && !(value.length === 1 && (TAIL.has(key(value[0])) || VALUE_LEAD.has(key(value[0]))))) {
      const f = field || inferField(old.join(" "), answers);
      if (f) return { field: f, value: value.join(" "), old: old.join(" ") };
    }
  }

  const ci = ks.findIndex(k => CHANGE.has(k));
  if (ci >= 0 && field) {
    const to = ks.indexOf("to", ci);
    const value = to > 0 ? ws.slice(to + 1).join(" ") : "";
    return { field, value: value || null };
  }
  return null;
}

function inferField(old, answers) {
  const o = words(old).map(key).join(" ");
  if (!o) return null;
  for (const f of FIELDS) {
    const a = words(answers[f] || "").map(key).join(" ");
    if (a && (a.includes(o) || o.includes(a))) return f;
  }
  return null;
}

// parseSet reads a fresh value said on the review screen without "nahi",
// such as "gaon Ramnagar hai" or "meri umar saath saal hai".
export function parseSet(text) {
  const ws = words(text);
  const fi = ws.findIndex(w => FIELD_WORDS.some(s => s.has(key(w))));
  if (fi < 0 || fi > 2 || fi === ws.length - 1) return null;
  const field = FIELDS[FIELD_WORDS.findIndex(s => s.has(key(ws[fi])))];
  const rest = ws.slice(fi + 1).join(" ");
  if (field === "age") return parseAge(rest) ? { field, value: rest } : null;
  return { field, value: rest };
}

// ---------- complaint glossary ----------

// gloss lists English key words for staff. It is a demo glossary, not a
// translation, and the complaint itself is always kept in the patient's words.
const GLOSS = Object.entries({
  "pet|पेट|stomach|स्टमक|स्टोमक": "stomach", "dard|दर्द|pain|पेन": "pain", "bukhar|बुखार|fever|फीवर": "fever",
  "sir|सिर|sar|head": "head", "khansi|खांसी|खासी|cough": "cough", "chakkar|चक्कर": "dizziness",
  "ulti|उल्टी|vomit|vomiting": "vomiting", "dast|दस्त|loose": "loose motions", "daant|dant|दांत|दाँत|tooth|teeth": "tooth",
  "kaan|कान|ear": "ear", "naak|नाक|nose": "nose", "gala|गला|गले|throat": "throat", "aankh|आंख|आँख|eye": "eye",
  "pair|पैर|leg|foot": "leg/foot", "haath|हाथ|hand": "hand", "kamar|कमर|back": "back", "seena|सीना|chhati|छाती|chest": "chest",
  "saans|सांस|साँस|breath": "breathing", "jalan|जलन|burning": "burning", "sujan|सूजन|swelling": "swelling",
  "chot|चोट|injury": "injury", "khujli|खुजली|itching": "itching", "kamzori|कमजोरी|कमज़ोरी|weakness": "weakness",
}).flatMap(([ws, en]) => ws.split("|").map(w => [key(w), en]));
const GLOSS_MAP = new Map(GLOSS);
const UNITS = new Map([["din", "day"], ["दिन", "day"], ["day", "day"], ["days", "day"], ["hafte", "week"], ["hafta", "week"], ["हफ्ते", "week"], ["हफ्ता", "week"],
  ["week", "week"], ["mahine", "month"], ["mahina", "month"], ["महीने", "month"], ["महीना", "month"], ["month", "month"], ["saal", "year"], ["साल", "year"]].map(([k, v]) => [key(k), v]));

export function gloss(text) {
  const ws = words(digits(text), true), ks = ws.map(key), out = [];
  ks.forEach((k, i) => {
    if (GLOSS_MAP.has(k)) out.push(GLOSS_MAP.get(k));
    if (UNITS.has(k) && i > 0) {
      const n = numbers(ws[i - 1])[0];
      if (n) out.push(`${n} ${UNITS.get(k)}${n > 1 ? "s" : ""}`);
    }
    if ((k === "kal" || k === "कल") && (ks[i + 1] === "se" || ks[i + 1] === "से")) out.push("since yesterday");
  });
  return [...new Set(out)].join(" · ");
}

// ---------- Devanagari to Latin ----------

const CONS = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h", "क़": "q", "ख़": "kh", "ग़": "g", "ज़": "z", "ड़": "r", "ढ़": "rh", "फ़": "f" };
// Nukta letters stay as two code points after NFC, so the keys must too.
for (const k of Object.keys(CONS)) CONS[k.normalize("NFC")] = CONS[k];
const VOWEL = { "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au" };
const SIGN = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au" };

// translit gives staff a readable Latin spelling of a Devanagari name, with
// the usual Hindi rule for silent short "a" (रामनगर → Ramnagar). It is a
// reading aid shown next to the original, never a replacement for it.
export function translit(text) {
  if (!/[ऀ-ॿ]/.test(text)) return "";
  return String(text).normalize("NFC").split(/\s+/).map(word => {
    const units = [];
    const chars = [...word];
    for (let i = 0; i < chars.length; i++) {
      let ch = chars[i];
      if (chars[i + 1] === "़") { ch += "़"; i++; }
      ch = ch.normalize("NFC");
      if (CONS[ch]) units.push({ c: CONS[ch], v: "a", inherent: true });
      else if (VOWEL[ch]) units.push({ c: "", v: VOWEL[ch] });
      else if (SIGN[ch] && units.length) Object.assign(units.at(-1), { v: SIGN[ch], inherent: false });
      else if (ch === "्" && units.length) Object.assign(units.at(-1), { v: "", inherent: false });
      else if ((ch === "ं" || ch === "ँ") && units.length) units.at(-1).nasal = true;
      else if (ch === "ः" && units.length) units.at(-1).v += "h";
      else if (!/[ऀ-ॿ]/.test(ch)) units.push({ c: ch, v: "" });
    }
    const last = units.at(-1);
    if (units.length > 1 && last?.inherent) last.v = "";
    for (let i = 1; i < units.length - 1; i++) {
      const u = units[i], prev = units[i - 1], next = units[i + 1];
      if (u.inherent && !u.nasal && prev.v && next.c && next.v) u.v = "";
    }
    const out = units.map((u, i) => {
      const labial = /^(p|ph|b|bh|m)$/.test(units[i + 1]?.c || "");
      return u.c + u.v + (u.nasal ? (labial ? "m" : "n") : "");
    }).join("");
    return out ? out[0].toUpperCase() + out.slice(1) : "";
  }).join(" ");
}
