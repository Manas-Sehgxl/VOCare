// Run with: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import * as P from "../dist/parse.js";

test("name keeps the patient's words without the sentence around them", () => {
  assert.equal(P.parseName("Mera naam Savitri Devi hai"), "Savitri Devi");
  assert.equal(P.parseName("मेरा नाम सावित्री देवी है।"), "सावित्री देवी");
  assert.equal(P.parseName("savitri devi"), "Savitri Devi");
  assert.equal(P.parseName("Phoolmati"), "Phoolmati");
  assert.equal(P.parseName("mera naam hai"), null);
});

test("age keeps uncertainty and understands mixed language", () => {
  assert.deepEqual(P.parseAge("Lagbhag pachpan saal"), { value: 55, approx: true });
  assert.deepEqual(P.parseAge("लगभग पचपन साल"), { value: 55, approx: true });
  assert.deepEqual(P.parseAge("Age sixty hai"), { value: 60, approx: false });
  assert.deepEqual(P.parseAge("एज सिक्सटी है"), { value: 60, approx: false });
  assert.deepEqual(P.parseAge("fifty five years"), { value: 55, approx: false });
  assert.deepEqual(P.parseAge("५५ साल"), { value: 55, approx: false });
  assert.deepEqual(P.parseAge("pachpan saath saal"), { value: 55, upper: 60, approx: true });
  assert.equal(P.parseAge("pata nahi"), null);
  assert.equal(P.formatAge(P.parseAge("Lagbhag pachpan saal")), "approximately 55");
  assert.equal(P.formatAge({ value: 55, approx: true }, "hi"), "लगभग 55");
});

test("every Hindi number word from 1 to 100 is recognised, in both scripts", () => {
  P.NUMBER_WORDS.HINDI.forEach((w, i) => assert.deepEqual(P.numbers(w), [i + 1], w));
  P.NUMBER_WORDS.ROMAN.forEach((ws, i) => ws.split("|").forEach(w => assert.deepEqual(P.numbers(w), [i + 1], w)));
  assert.deepEqual(P.numbers("saat"), [7]);
  assert.deepEqual(P.numbers("saath"), [60]);
});

test("village names are preserved, not replaced", () => {
  assert.equal(P.parseVillage("Ramnagar"), "Ramnagar");
  assert.equal(P.parseVillage("Main Ramnagar gaon se hoon"), "Ramnagar");
  assert.equal(P.parseVillage("रामनगर से हैं"), "रामनगर");
  assert.equal(P.parseVillage("Bhaisaundha"), "Bhaisaundha");
  assert.ok(P.ambiguousPlace("Sultanpur"));
  assert.ok(!P.ambiguousPlace("Ramnagar"));
});

test("corrections update one field", () => {
  const answers = { name: "Savitri Devi", age: "approximately 55", village: "Rampur", complaint: "Pet mein teen din se dard hai" };
  assert.deepEqual(P.parseCorrection("Gaon Rampur nahi, Ramnagar hai", answers), { field: "village", value: "Ramnagar", old: "Rampur" });
  assert.deepEqual(P.parseCorrection("गाँव रामपुर नहीं, रामनगर है", answers), { field: "village", value: "रामनगर", old: "रामपुर" });
  assert.deepEqual(P.parseCorrection("Rampur nahi Ramnagar", answers), { field: "village", value: "Ramnagar", old: "Rampur" });
  assert.deepEqual(P.parseCorrection("village is not Rampur, it is Ramnagar", answers), { field: "village", value: "Ramnagar", old: "Rampur" });
  assert.deepEqual(P.parseCorrection("change village to Ramnagar", answers), { field: "village", value: "Ramnagar" });
  assert.deepEqual(P.parseCorrection("gaon badlo", answers), { field: "village", value: null });
  assert.equal(P.parseCorrection("Mera naam Savitri Devi hai", {}), null);
  assert.equal(P.parseCorrection("pet mein dard hai, bukhar nahi hai", answers), null);
  assert.deepEqual(P.parseSet("gaon Ramnagar hai"), { field: "village", value: "Ramnagar hai" });
});

test("short replies map to intents", () => {
  assert.equal(P.intent("haan"), "yes");
  assert.equal(P.intent("हाँ, सही है"), "yes");
  assert.equal(P.intent("haan sahi hai"), "yes");
  assert.equal(P.intent("confirm"), "yes");
  assert.equal(P.intent("galat hai"), "wrong");
  assert.equal(P.intent("sahi nahi hai"), "wrong");
  assert.equal(P.intent("नहीं"), "no");
  assert.equal(P.intent("मदद चाहिए"), "help");
  assert.equal(P.intent("dobara boliye"), "repeat");
  assert.equal(P.intent("aur samay chahiye"), "moreTime");
  assert.equal(P.intent("Pet mein teen din se dard hai aur help nahi mili"), null);
  assert.equal(P.language("Hindi"), "hi");
  assert.equal(P.language("हिंदी"), "hi");
  assert.equal(P.language("English please"), "en");
  assert.equal(P.fieldOf("गाँव"), "village");
});

test("complaint glossary sits beside the original words", () => {
  assert.equal(P.gloss("Pet mein teen din se dard hai"), "stomach · 3 days · pain");
  assert.equal(P.gloss("तीन दिन से स्टमक पेन है"), "3 days · stomach · pain");
});

test("Devanagari names get a Latin reading aid", () => {
  assert.equal(P.translit("सावित्री देवी"), "Savitri Devi");
  assert.equal(P.translit("रामनगर"), "Ramnagar");
  assert.equal(P.translit("रामपुर"), "Rampur");
  assert.equal(P.translit("कमला"), "Kamla");
  assert.equal(P.translit("Ramnagar"), "");
});

test("sex is understood in Hindi, English and in a sentence", () => {
  assert.equal(P.parseSex("महिला"), "Female");
  assert.equal(P.parseSex("मैं औरत हूँ"), "Female");
  assert.equal(P.parseSex("Mahila"), "Female");
  assert.equal(P.parseSex("Female"), "Female");
  assert.equal(P.parseSex("पुरुष हूँ"), "Male");
  assert.equal(P.parseSex("aadmi"), "Male");
  assert.equal(P.parseSex("अन्य"), "Other");
  assert.equal(P.parseSex("man or woman"), null);
  assert.equal(P.parseSex("पता नहीं"), null);
  assert.equal(P.sexLabel("Female", "hi"), "महिला");
  assert.equal(P.sexLabel("Female", "en"), "Female");
  assert.deepEqual(P.parseCorrection("लिंग पुरुष नहीं, महिला है", { sex: "Male" }), { field: "sex", value: "महिला", old: "पुरुष" });
});

test("consent accepts yes however the recogniser spells it", () => {
  for (const said of ["yes", "Yes, let's start", "यस", "येस", "यस्", "sure", "okay lets go", "हाँ जी"]) assert.equal(P.intent(said), "yes", said);
  assert.equal(P.intent("नहीं"), "no");
});
