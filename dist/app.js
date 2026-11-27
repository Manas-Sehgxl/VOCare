import * as P from "./parse.js";
import { LABELS, QUESTIONS, TEXT, SAMPLES } from "./text.js";
import { icon } from "./icons.js";

const root = document.querySelector("#app");
const nav = document.querySelector("#nav");
const live = document.querySelector("#status");
const printArea = document.querySelector("#print");
const FIELDS = P.FIELDS;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const KIOSK_SCREENS = ["consent", "intake", "review"];
const DEPT_HI = { "General OPD": "सामान्य ओपीडी", "Dental": "दंत विभाग", "ENT": "नाक-कान-गला (ENT)" };

let s;               // the kiosk session; fresh() rebuilds it for each patient
let mic = "ready";   // ready | listening | processing | speaking
let shownScreen = "";

function fresh(sample = false) {
  return {
    screen: "welcome", lang: "hi", sample, voice: false,
    step: 0, answers: {}, raw: {}, ageInfo: null, gloss: "",
    failures: 0, pending: null, idlePrev: null, editing: false,
    warning: "", heardText: "", flash: null,
    session: uuid(), record: null, busy: false, left: 0,
  };
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
}

const pick = pair => pair[s.lang === "hi" ? 1 : 0];
function t(k, ...args) {
  const v = pick(TEXT[k]);
  return typeof v === "function" ? v(...args) : v;
}
const label = f => pick(LABELS[f]);
const question = f => pick(QUESTIONS[f]);
const complete = () => FIELDS.every(f => s.answers[f]);

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function btn(act, text, cls = "", extra = "") {
  return `<button type="button" data-act="${act}" class="${cls}" ${extra}>${esc(text)}</button>`;
}
// ibtn is a Material button with a leading icon.
function ibtn(act, name, text, cls = "", extra = "") {
  return `<button type="button" data-act="${act}" class="${cls}" ${extra}>${icon(name)}<span>${esc(text)}</span></button>`;
}

// ---------- speaking and listening ----------

let epoch = 0, recog = null, silenceTimer = null, utterances = [];

function stopVoice() {
  epoch++;
  clearTimeout(silenceTimer);
  if (recog) {
    recog.onresult = recog.onerror = recog.onend = recog.onspeechend = null;
    try { recog.abort(); } catch { /* already stopped */ }
    recog = null;
  }
  if (canSpeak) speechSynthesis.cancel();
  setMic("ready");
}

function pickVoice(lang) {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.lang.replace("_", "-") === lang) || voices.find(v => v.lang.startsWith(lang.slice(0, 2)));
}

// say() reads the text sentence by sentence (Chrome stops long utterances
// part way) and then calls then(). It always calls then(), even without a
// voice, so the conversation never stalls on a missing speech engine.
function say(text, then) {
  stopVoice();
  const my = epoch;
  let finished = false;
  const done = () => {
    if (finished || my !== epoch) return;
    finished = true;
    setMic("ready");
    then?.();
  };
  if (!canSpeak || !text) return done();
  const lang = s.lang === "hi" ? "hi-IN" : "en-IN";
  const voice = pickVoice(lang);
  const parts = text.split(/(?<=[।.?!])\s+/).filter(Boolean);
  utterances = parts.map((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = lang;
    if (voice) u.voice = voice;
    u.rate = 0.9;
    if (i === parts.length - 1) u.onend = done;
    u.onerror = done;
    return u;
  });
  setMic("speaking");
  utterances.forEach(u => speechSynthesis.speak(u));
  setTimeout(done, text.length * 110 + 4000); // in case onend never fires
}

// ask() speaks a prompt and, in voice mode, listens for the answer.
function ask(text) {
  bump();
  say(text, () => { if (s.voice && SR && !s.sample) listen(); });
}

// listen() waits up to ten seconds for an answer. Chrome gives up after a
// few seconds of quiet, so a silent end before then quietly starts again.
function listen(started = Date.now()) {
  if (!SR) {
    s.voice = false;
    s.warning = t("noVoiceInput");
    return render();
  }
  stopVoice();
  const my = epoch;
  let settled = false;
  const r = new SR();
  recog = r;
  r.lang = s.lang === "hi" || s.screen === "welcome" ? "hi-IN" : "en-IN";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onspeechend = () => { if (my === epoch) setMic("processing"); };
  r.onresult = e => {
    if (my !== epoch) return;
    settled = true;
    const best = e.results[0][0];
    stopVoice();
    handle(best.transcript, best.confidence);
  };
  r.onerror = e => {
    if (my !== epoch || e.error === "no-speech" || e.error === "aborted") return;
    settled = true;
    stopVoice();
    if (e.error === "not-allowed" || e.error === "service-not-allowed") return voiceOff("micDenied");
    if (e.error === "network") return voiceOff("network");
    unclear();
  };
  r.onend = () => {
    if (my !== epoch || settled) return;
    if (Date.now() - started < 9500) {
      setTimeout(() => { if (my === epoch) listen(started); }, 200);
      return;
    }
    stopVoice();
    silent();
  };
  silenceTimer = setTimeout(() => {
    if (my === epoch && !settled) { stopVoice(); silent(); }
  }, Math.max(500, 10000 - (Date.now() - started)));
  try {
    r.start();
    setMic("listening");
  } catch {
    stopVoice();
    voiceOff("micDenied");
  }
}

function voiceOff(key) {
  s.voice = false;
  s.warning = t(key);
  render();
  say(s.warning);
}

function setMic(state) {
  mic = state;
  const el = document.querySelector("#mic");
  if (el) el.outerHTML = micButton();
  if (live && s) live.textContent = micText();
}

// ---------- the conversation ----------

function prompt() {
  const p = s.pending;
  if (p) {
    switch (p.type) {
      case "confirmHeard": return t("heardConfirm", p.value);
      case "whichField": return t("whichField");
      case "moreTime": return t("moreTime");
      case "staffOffer": return t("staffOffer");
      case "declined": return t("declined");
      case "district": return t("district", s.answers.village);
      case "idle": return t("stillThere");
    }
  }
  switch (s.screen) {
    case "welcome": return t("greet");
    case "consent": return t("consent");
    case "intake": return question(FIELDS[s.step]);
    case "review": return readback();
    case "token": return tokenSpeech();
    case "help": return t("helpText");
  }
  return "";
}

function spokenAge() {
  return s.ageInfo ? P.formatAge(s.ageInfo, s.lang) : s.answers.age;
}

function readback() {
  const a = s.answers;
  const complaint = (a.complaint || "").replace(/[।.!?\s]+$/, "");
  return s.lang === "hi"
    ? `${a.name}, उम्र ${spokenAge()} साल, गाँव ${a.village}। ${complaint}। क्या यह सही है?`
    : `${a.name}, age ${spokenAge()}, village ${a.village}. ${complaint}. Is this correct?`;
}

function tokenSpeech() {
  const n = Number(String(s.record?.token || "").split("-")[1]) || "";
  return t("token", s.lang === "hi" ? `ओ पी डी ${n}` : `O P D ${n}`);
}

// handle() is the single entry point for anything the patient says, whether
// it came from the microphone or a demo button.
function handle(text, conf = 0.92, touch = false) {
  text = String(text || "").trim();
  if (s.pending?.type === "idle") return resumeFromIdle();
  bump();
  if (!text) return unclear();
  if (!touch) s.heardText = text;
  // Low confidence usually means noise: never fill a field from it.
  if (conf > 0 && conf < 0.55) return unclear();
  const it = P.intent(text);

  if (s.screen === "welcome") {
    const lang = P.language(text);
    if (!lang) {
      s.warning = t("chooseLang");
      render();
      return ask(s.warning);
    }
    s.lang = lang;
    s.voice = !s.sample && !!SR;
    return toConsent();
  }
  if (it === "help") return assist("Patient asked for help");
  if (it === "repeat") return ask(prompt());
  if (s.pending && onPending(text, it) !== false) return;

  if (s.screen === "consent") {
    if (it === "yes") return startIntake();
    if (it === "no") return decline();
    return failWith("");
  }
  if (s.screen === "intake" || s.screen === "review") {
    const c = P.parseCorrection(text, s.answers);
    if (c) return c.value ? applyCorrection(c.field, c.value) : editField(c.field);
    if (it === "wrong" || it === "change") return askWhich();
  }
  if (s.screen === "intake") return onAnswer(text, it, conf);
  if (s.screen === "review") return onReview(text, it);
}

// onPending answers the side question currently on screen. It returns false
// when the reply was really a normal answer, so handle() carries on.
function onPending(text, it) {
  const p = s.pending;
  switch (p.type) {
    case "moreTime":
      s.pending = null;
      if (it === "yes" || it === "moreTime") { s.warning = ""; render(); ask(prompt()); return; }
      return false;
    case "staffOffer":
      if (it === "yes") return assist(`Voice input failed twice (${s.screen === "intake" ? FIELDS[s.step] : s.screen})`);
      s.pending = null;
      if (it === "no") { s.failures = 1; s.warning = ""; render(); ask(t("tryAgain") + " " + prompt()); return; }
      return false;
    case "declined":
      if (it === "yes") return assist("Declined voice registration");
      if (it === "no") return finish();
      ask(prompt());
      return;
    case "confirmHeard": {
      if (it === "yes") return commit(p.field, p.value, p.raw, p.info);
      s.pending = null;
      if (it === "no" || it === "wrong") return failWith(t("slowly"));
      // They said it again. The same words twice count as confirmed.
      const again = parseField(p.field, text);
      if (again && sameWords(again.value, p.value)) return commit(p.field, again.value, text, again.info);
      return false;
    }
    case "whichField": {
      const f = P.fieldOf(text);
      if (f) return editField(f);
      if (P.parseCorrection(text, s.answers)) { s.pending = null; return false; }
      s.failures++;
      if (s.failures >= 2) return offerStaff();
      ask(prompt());
      return;
    }
    case "district": {
      const d = P.parseDistrict(text);
      if (!d) return failWith("");
      s.answers.village += t("districtSuffix", d);
      s.raw.village += " / " + text;
      s.pending = null;
      return advance(t("ackVillage", s.answers.village));
    }
  }
  return false;
}

const sameWords = (a, b) => P.words(a).map(P.key).join(" ") === P.words(b).map(P.key).join(" ");

function parseField(f, text) {
  const bare = P.intent(text) && P.words(text).length <= 2; // "haan" is not a name
  switch (f) {
    case "name": { const v = P.parseName(text); return v && !bare ? { value: v } : null; }
    case "age": { const info = P.parseAge(text); return info ? { value: P.formatAge(info, "en"), info } : null; }
    case "village": { const v = P.parseVillage(text); return v && !bare ? { value: v } : null; }
    case "complaint": return text.length >= 3 && !bare ? { value: text } : null;
  }
  return null;
}

function onAnswer(text, it, conf) {
  const f = FIELDS[s.step];
  const r = parseField(f, text);
  if (!r) return failWith(t(f + "Again"));
  // A name or place heard with low confidence is read back before saving.
  if ((f === "name" || f === "village") && conf < 0.75) {
    s.pending = { type: "confirmHeard", field: f, value: r.value, raw: text, info: r.info };
    s.warning = "";
    render();
    return ask(prompt());
  }
  commit(f, r.value, text, r.info);
}

function store(f, value, raw, info) {
  s.answers[f] = value;
  s.raw[f] = raw;
  if (f === "age") s.ageInfo = info;
  if (f === "complaint") s.gloss = P.gloss(value);
  s.flash = f;
  s.failures = 0;
  s.pending = null;
  s.warning = "";
}

function commit(f, value, raw, info) {
  store(f, value, raw, info);
  const ack = {
    name: () => t("ackName", value),
    age: () => t("ackAge", spokenAge()),
    village: () => t("ackVillage", value),
    complaint: () => t("ackComplaint"),
  }[f]();
  if (f === "village" && P.ambiguousPlace(value)) {
    s.pending = { type: "district" };
    render();
    return ask(ack + " " + prompt());
  }
  advance(ack);
}

function advance(prefix) {
  if (s.editing && complete()) return goReview(prefix);
  const next = FIELDS.findIndex(f => !s.answers[f]);
  if (next < 0) return goReview(prefix);
  s.step = next;
  render();
  ask(prefix + " " + prompt());
}

// applyCorrection changes one field, reads the change back and asks for
// confirmation again. Nothing else in the record is touched.
function applyCorrection(f, said) {
  const r = parseField(f, said);
  if (!r) return editField(f);
  store(f, r.value, said, r.info);
  const msg = t("changed", label(f), f === "age" ? spokenAge() : r.value);
  if (s.screen === "review") {
    render();
    return ask(msg + " " + t("allCorrectNow"));
  }
  if (FIELDS[s.step] === f || complete()) return advance(msg);
  render();
  ask(msg + " " + prompt());
}

function onReview(text, it) {
  if (it === "yes") return register();
  if (it === "no") return askWhich();
  const set = P.parseSet(text);
  if (set) return applyCorrection(set.field, set.value);
  const f = P.fieldOf(text);
  if (f) return editField(f);
  failWith(t("reviewAgain"));
}

function failWith(message) {
  s.failures++;
  if (s.failures >= 2) return offerStaff();
  s.warning = message;
  render();
  ask((message ? message + " " : "") + prompt());
}

// unclear() handles noise: earlier answers stay, only this question repeats.
function unclear() {
  s.failures++;
  if (s.failures >= 2) return offerStaff();
  s.warning = t("noise");
  render();
  ask(t("noise") + " " + prompt());
}

// silent() runs after ten quiet seconds. It is not counted as a failure.
function silent() {
  if (s.screen === "welcome" || s.pending?.type === "moreTime") {
    s.pending = null;
    s.warning = t("tapWhenReady");
    render();
    return say(t("tapWhenReady"));
  }
  s.pending = { type: "moreTime" };
  s.warning = "";
  render();
  ask(prompt());
}

function offerStaff() {
  s.pending = { type: "staffOffer" };
  s.warning = "";
  render();
  ask(prompt());
}

function askWhich() {
  s.pending = { type: "whichField" };
  s.warning = "";
  render();
  ask(prompt());
}

function decline() {
  s.pending = { type: "declined" };
  render();
  ask(prompt());
}

function toConsent() {
  s.screen = "consent";
  s.failures = 0;
  s.pending = null;
  s.warning = "";
  render();
  ask(prompt());
}

function startIntake() {
  s.screen = "intake";
  s.step = Math.max(0, FIELDS.findIndex(f => !s.answers[f]));
  s.failures = 0;
  s.pending = null;
  s.warning = "";
  render();
  ask(prompt());
}

function editField(f) {
  s.editing = complete();
  s.screen = "intake";
  s.step = FIELDS.indexOf(f);
  s.pending = null;
  s.failures = 0;
  s.warning = "";
  render();
  ask(prompt());
}

function goReview(prefix = "") {
  s.screen = "review";
  s.pending = null;
  s.failures = 0;
  s.editing = false;
  s.warning = "";
  render();
  ask((prefix ? prefix + " " : "") + readback());
}

// ---------- talking to the desk ----------

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function payload(kind, reason = "") {
  return { kind, sessionId: s.session, language: s.lang, answers: s.answers, raw: s.raw, gloss: s.gloss, reason };
}

// register() only runs from the review screen after an explicit yes. The
// session ID makes a second confirm return the same token, not a new one.
async function register() {
  if (s.busy || s.screen !== "review" || !complete()) return;
  s.busy = true;
  stopVoice();
  setMic("processing");
  try {
    s.record = await api("POST", "/api/records", payload("registration"));
    s.screen = "token";
    s.pending = null;
    s.warning = "";
    startCountdown();
    render();
    say(tokenSpeech());
  } catch {
    s.warning = t("saveFailed");
    render();
    say(s.warning);
  } finally {
    s.busy = false;
  }
}

async function assist(reason) {
  if (s.busy) return;
  s.busy = true;
  stopVoice();
  try {
    s.record = await api("POST", "/api/records", payload("assistance", reason));
  } catch {
    s.warning = t("saveFailed");
  }
  s.busy = false;
  s.screen = "help";
  s.pending = null;
  startCountdown();
  render();
  say(t("helpText"));
}

// ---------- clearing the kiosk ----------

let idleTimer = null, idleCut = null, countdown = null;

function bump() {
  clearTimeout(idleTimer);
  if (KIOSK_SCREENS.includes(s.screen)) idleTimer = setTimeout(idle, 90000);
  if (countdown) s.left = 60;
}

function idle() {
  if (!KIOSK_SCREENS.includes(s.screen)) return;
  s.idlePrev = s.pending;
  s.pending = { type: "idle" };
  render();
  say(prompt(), () => { if (s.voice && SR && !s.sample) listen(); });
  idleCut = setTimeout(finish, 20000);
}

function resumeFromIdle() {
  clearTimeout(idleCut);
  s.pending = s.idlePrev;
  s.idlePrev = null;
  render();
  ask(prompt());
}

function startCountdown() {
  clearInterval(countdown);
  s.left = 60;
  countdown = setInterval(() => {
    s.left--;
    const el = document.querySelector("#left");
    if (el) el.textContent = t("clearsIn", s.left);
    if (s.left <= 0) finish();
  }, 1000);
}

// finish() wipes everything the patient said from the screen and memory.
function finish() {
  stopVoice();
  clearInterval(countdown);
  countdown = null;
  clearTimeout(idleTimer);
  clearTimeout(idleCut);
  printArea.innerHTML = "";
  s = fresh(s?.sample);
  render();
  window.scrollTo(0, 0);
}

// ---------- kiosk screens ----------


function micState() {
  if (mic === "ready" && s.sample) return "sample";
  if (mic === "ready" && !SR) return "off";
  return mic;
}

function micText() {
  return t({ ready: "micReady", listening: "micListening", processing: "micProcessing", speaking: "micSpeaking", sample: "micSample", off: "micOff" }[micState()]);
}

function micButton() {
  const st = micState();
  const disabled = st === "sample" || st === "off" ? "disabled" : "";
  const glyph = { listening: "mic", processing: "wave", speaking: "volume", sample: "micOff", off: "micOff" }[st] || "mic";
  return `<button type="button" id="mic" class="mic is-${st}" data-act="speak" ${disabled}>
    <span class="mic-ring">${icon(glyph)}</span><span class="mic-label">${esc(micText())}</span></button>`;
}

// latin() is for names and places only; a complaint stays in its own words.
function latin(v) {
  const l = P.translit(v || "");
  return l ? `<span class="latin" title="${esc(t("latin"))}">${esc(l)}</span>` : "";
}

function shown(f) {
  return f === "age" && s.ageInfo ? P.formatAge(s.ageInfo, s.lang) : s.answers[f];
}

function heardLine() {
  return s.heardText ? `<p class="heard">${esc(t("heard"))}: “${esc(s.heardText)}”</p>` : "";
}

function warningBox() {
  return s.warning ? `<p class="alert" role="alert">${icon("warning")}<span>${esc(s.warning)}</span></p>` : "";
}

function pendingBox() {
  const p = s.pending;
  if (!p || p.type === "idle") return "";
  const box = (text, buttons) => `<div class="pending" role="alert"><p>${esc(text)}</p><div class="actions">${buttons}</div></div>`;
  const yes = ibtn("yes", "check", t("yes"), "primary"), no = ibtn("no", "close", t("no"), "tonal");
  switch (p.type) {
    case "confirmHeard":
      return box(t("heardConfirm", p.value), yes + no);
    case "whichField":
      return box(t("whichField"), FIELDS.map(f => btn("field-" + f, label(f), "big-choice tonal")).join(""));
    case "moreTime":
      return box(t("moreTime"), ibtn("more", "check", t("moreTimeBtn"), "primary") + ibtn("help", "help", t("help"), "tertiary"));
    case "staffOffer":
      return box(t("staffOffer"), ibtn("help", "help", t("help"), "tertiary") + no);
    case "declined":
      return box(t("declined"), ibtn("help", "help", t("help"), "tertiary") + ibtn("cancel", "close", t("cancel"), "tonal"));
    case "district":
      return box(t("district", s.answers.village), "");
  }
  return "";
}

function samplesFor() {
  const L = s.lang, p = s.pending?.type;
  if (s.screen === "welcome") return SAMPLES.welcome;
  if (["confirmHeard", "moreTime", "staffOffer", "declined"].includes(p)) return SAMPLES.yesNo[L];
  if (p === "whichField") return SAMPLES.whichField[L];
  if (p === "district") return SAMPLES.district[L];
  if (s.screen === "consent") return SAMPLES.consent[L];
  if (s.screen === "intake") return SAMPLES[FIELDS[s.step]][L];
  if (s.screen === "review") return SAMPLES.review[L];
  return [];
}

function sampleTray() {
  if (!s.sample && SR) return "";
  const list = samplesFor();
  const extra = s.screen === "welcome" ? "" : ibtn("noise", "volume", t("noiseSample"), "sample ghost") + ibtn("silence", "micOff", t("silenceSample"), "sample ghost");
  return `<div class="tray"><p class="tray-title">${icon("info")}${esc(t("sampleTray"))}</p><div class="chips">
    ${list.map((x, i) => btn("sample-" + i, (x.label || "“" + x.text + "”") + (x.note ? " · " + x.note : ""), "sample")).join("")}${extra}
  </div></div>`;
}

function controls() {
  const item = (act, name, text, cls = "") => `<button type="button" data-act="${act}" class="control ${cls}">
      <span class="control-icon">${icon(name)}</span><span class="control-label">${esc(text)}</span></button>`;
  const correct = s.screen === "intake" || s.screen === "review" ? item("correct", "edit", t("correct")) : "";
  return `<nav class="controls" aria-label="Controls">
    ${item("repeat", "replay", t("repeat"))}${correct}${item("help", "help", t("help"), "help")}${item("cancel", "close", t("cancel"))}
  </nav>`;
}

function topline(extra = "") {
  return `<div class="topline"><span class="mode">${esc(s.sample ? t("demoMode") : t("voiceMode"))}</span>${extra}</div>`;
}

function welcomeView() {
  return `<section class="welcome">
    <p class="hello"><span lang="hi">नमस्ते</span> <span class="hello-en">Namaste</span></p>
    <p class="lead"><span lang="hi">भाषा चुनें</span> · Choose your language</p>
    <div class="lang-pick">
      <button type="button" data-act="lang-hi" lang="hi" class="lang">हिन्दी</button>
      <button type="button" data-act="lang-en" lang="en" class="lang">English</button>
    </div>
    <div class="welcome-voice">
      <button type="button" class="mic-start" data-act="welcome-mic">${icon("mic")}<span><span lang="hi">बोलकर चुनें</span> · Say it</span></button>
      ${s.voice ? micButton() : ""}
    </div>
    ${warningBox()}${heardLine()}
    <label class="switch"><input type="checkbox" role="switch" data-act="demo-toggle" ${s.sample ? "checked" : ""}>
      <span class="track"><span class="thumb">${icon("check")}</span></span>
      <span>Demo mode: simulated speech, no microphone needed</span></label>
    ${s.sample ? sampleTray() : ""}
  </section>`;
}

function consentView() {
  return `<section class="kiosk">${topline()}
    <h2 tabindex="-1">${esc(t("consentTitle"))}</h2>
    <p class="say">${esc(t("consent"))}</p>
    ${micButton()}${heardLine()}${warningBox()}${pendingBox()}
    <div class="actions">${ibtn("start", "check", t("start"), "primary xl")}${ibtn("decline", "close", t("no"), "tonal xl")}</div>
    <p class="note">${esc(t("consentNote"))}</p>
    ${sampleTray()}
  </section>${controls()}`;
}

function intakeView() {
  const f = FIELDS[s.step];
  const p = s.pending;
  let value = "", hint = "";
  if (p?.type === "confirmHeard") { value = p.value; hint = "?"; }
  else if (s.answers[f]) value = shown(f);
  const dots = FIELDS.map((k, i) => `<i class="${i === s.step ? "now" : s.answers[k] ? "done" : ""}"></i>`).join("");
  const others = FIELDS.filter(k => k !== f && s.answers[k])
    .map(k => `<li class="${s.flash === k ? "flash" : ""}"><b>${esc(label(k))}</b> ${esc(shown(k))} ${latin(s.answers[k])}</li>`).join("");
  return `<section class="kiosk">${topline(`<span class="dots" aria-label="${esc(t("step", s.step + 1, 4))}">${dots}</span>`)}
    <h2 tabindex="-1">${esc(question(f))}</h2>
    <div class="captured ${value ? "has" : ""}">
      <span class="cap-label">${esc(label(f))}</span>
      <span class="cap-value">${value ? esc(value) + hint : "…"}</span>
      ${value ? latin(value) : ""}
    </div>
    ${micButton()}${heardLine()}${warningBox()}${pendingBox()}
    ${others ? `<ul class="so-far">${others}</ul>` : ""}
    ${sampleTray()}
  </section>${controls()}`;
}

function reviewView() {
  const rows = FIELDS.map(f => `<div class="row ${s.flash === f ? "flash" : ""}">
      <dt>${esc(label(f))}</dt>
      <dd>${esc(shown(f))} ${f === "complaint" ? "" : latin(s.answers[f])}
        ${f === "complaint" && s.gloss ? `<span class="gloss" title="${esc(t("keyWords"))}">EN: ${esc(s.gloss)}</span>` : ""}</dd>
      ${ibtn("field-" + f, "edit", t("change"), "text small")}
    </div>`).join("");
  return `<section class="kiosk">${topline()}
    <h2 tabindex="-1">${esc(t("reviewTitle"))}</h2>
    <dl class="review">${rows}</dl>
    ${micButton()}${heardLine()}${warningBox()}${pendingBox()}
    <div class="actions">${ibtn("confirm", "check", t("confirm"), "primary xl")}</div>
    ${sampleTray()}
  </section>${controls()}`;
}

function deptName(d) {
  return s.lang === "hi" ? `${DEPT_HI[d] || d}` : d;
}

function tokenView() {
  const r = s.record;
  return `<section class="kiosk token-screen">
    <p class="kicker">${esc(t("tokenTitle"))}</p>
    <div class="token" tabindex="-1">${esc(r.token)}</div>
    <p class="dept"><b>${esc(t("department"))}:</b> ${esc(deptName(r.department))}<br><span class="small">${esc(t("deptNote"))}</span></p>
    <dl class="review">${FIELDS.map(f => `<div class="row"><dt>${esc(label(f))}</dt><dd>${esc(shown(f))} ${f === "complaint" ? "" : latin(s.answers[f])}</dd></div>`).join("")}</dl>
    <p class="small">ID ${esc(r.id)}</p>
    <div class="actions">${ibtn("print", "print", t("print"), "primary xl")}${ibtn("replay", "volume", t("replay"), "tonal xl")}${ibtn("finish", "done", t("finish"), "xl")}</div>
    <p class="small" id="left">${esc(t("clearsIn", s.left))}</p>
  </section>`;
}

function helpView() {
  const given = FIELDS.filter(f => s.answers[f]).map(f => `<li><b>${esc(label(f))}</b> ${esc(shown(f))}</li>`).join("");
  return `<section class="kiosk">
    <h2 tabindex="-1">${esc(t("helpTitle"))}</h2>
    <p class="say">${esc(t("helpText"))}</p>
    ${warningBox()}
    ${given ? `<ul class="so-far">${given}</ul>` : ""}
    <div class="actions">${ibtn("finish", "done", t("finish"), "primary xl")}</div>
    <p class="small" id="left">${esc(t("clearsIn", s.left))}</p>
  </section>`;
}

function idleOverlay() {
  return s.pending?.type === "idle" ? `<div class="idle" data-act="resume"><p>${esc(t("idleBanner"))}</p></div>` : "";
}

function render() {
  if (location.hash === "#staff") return renderStaff();
  document.documentElement.lang = s.lang;
  nav.hidden = s.screen !== "welcome";
  nav.innerHTML = icon("people") + "<span>Staff desk</span>";
  nav.setAttribute("href", "#staff");
  const view = { welcome: welcomeView, consent: consentView, intake: intakeView, review: reviewView, token: tokenView, help: helpView }[s.screen];
  root.innerHTML = view() + idleOverlay();
  if (shownScreen !== s.screen) {
    shownScreen = s.screen;
    root.querySelector("h2, .token")?.focus({ preventScroll: true });
  }
  s.flash = null;
}

// ---------- touch ----------

function simulate(sample) {
  stopVoice();
  const my = epoch;
  s.heardText = sample.text;
  setMic("processing");
  setTimeout(() => {
    if (my !== epoch) return;
    setMic("ready");
    handle(sample.text, sample.conf ?? 0.92);
  }, 450);
}

document.addEventListener("pointerdown", () => {
  if (location.hash === "#staff" || !s) return;
  if (s.pending?.type === "idle") resumeFromIdle();
  else bump();
}, true);
document.addEventListener("keydown", () => s && bump(), true);

root.addEventListener("click", e => {
  if (location.hash === "#staff") return staffClick(e);
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act.startsWith("field-")) return editField(act.slice(6));
  if (act.startsWith("sample-")) return simulate(samplesFor()[Number(act.slice(7))]);
  switch (act) {
    case "lang-hi": case "lang-en":
      s.lang = act.slice(5);
      s.voice = !s.sample && !!SR;
      if (!SR && !s.sample) s.warning = t("noVoiceInput");
      return toConsent();
    case "welcome-mic":
      if (!SR) { s.warning = t("noVoiceInput"); return render(); }
      s.voice = true;
      render();
      return say(t("greet"), () => listen());
    case "demo-toggle":
      s.sample = el.checked;
      return render();
    case "speak": s.voice = true; return listen();
    case "yes": return handle("yes", 1, true);
    case "no": return handle("no", 1, true);
    case "start": return startIntake();
    case "decline": return decline();
    case "more": s.pending = null; s.warning = ""; render(); return ask(prompt());
    case "repeat": return ask(prompt());
    case "correct": return askWhich();
    case "help": return assist("Patient pressed Get help");
    case "cancel": case "finish": return finish();
    case "confirm": return register();
    case "noise": return unclear();
    case "silence": return silent();
    case "print": return printSlip(s.record);
    case "replay": return say(tokenSpeech());
  }
});

// ---------- printing ----------

function slipHTML(r) {
  const row = (k, v) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  const when = new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const confirmed = r.status === "Registered";
  return `<div class="slip">
    <p class="slip-head">Bol OPD · OPD registration slip</p>
    <p class="slip-demo">Demo prototype · fictional data</p>
    <div class="slip-token">${esc(r.token)}</div>
    <table>
      ${row("Registration ID", esc(r.id))}
      ${row("Date", esc(when))}
      ${row("Name", esc(r.answers.name) + " " + latin(r.answers.name))}
      ${row("Age", esc(r.answers.age))}
      ${row("Village", esc(r.answers.village) + " " + latin(r.answers.village))}
      ${row("Complaint (patient's words)", esc(r.raw?.complaint || r.answers.complaint))}
      ${r.gloss ? row("Key words", esc(r.gloss)) : ""}
      ${row("Department", esc(r.department) + (confirmed ? " — confirmed by staff" : " — provisional, awaiting staff review"))}
      ${row("Status", esc(r.status))}
    </table>
    <p class="slip-foot">Mock administrative routing. Not a diagnosis or treatment advice.</p>
  </div>`;
}

function printSlip(r) {
  if (!r?.token) return;
  printArea.innerHTML = slipHTML(r);
  window.print();
}

// ---------- staff desk ----------

const STATUSES = ["Needs Assistance", "Awaiting Department Review", "Registered"];
const STAFF_LABELS = { name: "Name", age: "Age", village: "Village or locality", complaint: "Complaint (patient's words)" };
const staff = { records: [], open: null, es: null, live: false, filter: "All", note: "" };

function enterStaff() {
  stopVoice();
  clearInterval(countdown);
  clearTimeout(idleTimer);
  staff.open = null;
  staff.es?.close();
  staff.es = new EventSource("/api/events");
  staff.es.onopen = () => { staff.live = true; liveBadge(); };
  staff.es.onerror = () => { staff.live = false; liveBadge(); };
  staff.es.onmessage = e => {
    staff.records = JSON.parse(e.data) || [];
    staff.live = true;
    if (!staff.open) renderStaff(); else liveBadge();
  };
  renderStaff();
}

function leaveStaff() {
  staff.es?.close();
  staff.es = null;
}

function liveBadge() {
  const el = document.querySelector("#live");
  if (el) el.outerHTML = liveHTML();
}

function liveHTML() {
  return `<span id="live" class="live ${staff.live ? "on" : ""}"><i></i>${staff.live ? "Live" : "Reconnecting…"}</span>`;
}

const statusClass = st => "st-" + STATUSES.indexOf(st);

function recordCard(r) {
  const a = r.answers;
  return `<article class="record">
    <div class="record-top"><span class="pill ${statusClass(r.status)}">${esc(r.status)}</span>
      <span class="small">${esc(r.id)} · ${esc(new Date(r.createdAt).toLocaleTimeString("en-IN", { timeStyle: "short" }))}</span></div>
    <h3>${esc(r.token || "No token yet")} · ${esc(a.name || "Name not given")} ${latin(a.name)}</h3>
    <p>${esc(a.age || "Age —")} · ${esc(a.village || "Village —")} ${latin(a.village)}</p>
    <p class="complaint">${esc(r.raw?.complaint || a.complaint || "Complaint not given")}</p>
    ${r.gloss ? `<p class="small">Key words: ${esc(r.gloss)}</p>` : ""}
    ${r.reason ? `<p class="small">Reason: ${esc(r.reason)}</p>` : ""}
    <p class="small">Department: <b>${esc(r.department)}</b> ${r.status === "Registered" ? "(confirmed)" : "(suggested)"}</p>
    <div class="actions">${ibtn("open-" + r.id, "edit", r.status === "Registered" ? "Edit" : "Review and confirm", r.status === "Registered" ? "tonal" : "primary")}${r.token ? ibtn("print-" + r.id, "print", "Print slip", "text") : ""}</div>
  </article>`;
}

function staffList() {
  const order = r => STATUSES.indexOf(r.status);
  const rows = staff.records.slice().sort((a, b) => order(a) - order(b) || b.createdAt.localeCompare(a.createdAt));
  const shownRows = staff.filter === "All" ? rows : rows.filter(r => r.status === staff.filter);
  const chips = ["All", ...STATUSES].map(st => {
    const n = st === "All" ? rows.length : rows.filter(r => r.status === st).length;
    const on = staff.filter === st;
    return `<button type="button" data-act="filter-${st}" class="chip" aria-pressed="${on}">${on ? icon("check") : ""}<span>${esc(st)} · ${n}</span></button>`;
  }).join("");
  return `<section class="staff">
    <div class="staff-head"><div><p class="kicker">Registration desk</p><h2 tabindex="-1">Staff dashboard</h2></div>${liveHTML()}</div>
    <p class="note">Shared demo storage on this server. Fictional data only. Department routing is mock and administrative.</p>
    <div class="chips">${chips}</div>
    <div class="records">${shownRows.map(recordCard).join("") || "<p>No registrations yet.</p>"}</div>
  </section>`;
}

function staffForm(r) {
  const input = f => f === "complaint"
    ? `<textarea id="f-${f}" name="${f}" required maxlength="500" rows="3">${esc(r.answers[f])}</textarea>`
    : `<input id="f-${f}" name="${f}" required maxlength="500" value="${esc(r.answers[f])}">`;
  const fields = FIELDS.map(f => `<label for="f-${f}">${esc(STAFF_LABELS[f])}</label>${input(f)}
      ${r.raw?.[f] ? `<p class="small">Patient said: “${esc(r.raw[f])}”</p>` : ""}`).join("");
  return `<section class="staff">
    <div class="staff-head"><div><p class="kicker">${esc(r.id)} · <span class="pill ${statusClass(r.status)}">${esc(r.status)}</span></p>
      <h2 tabindex="-1">${esc(r.token || "Assisted registration")}</h2></div>${liveHTML()}</div>
    ${r.reason ? `<p class="alert">Reason: ${esc(r.reason)}</p>` : ""}
    <form id="staffform">${fields}
      <label for="dept">Department</label>
      <select id="dept" name="department">${["General OPD", "Dental", "ENT"].map(d => `<option ${d === r.department ? "selected" : ""}>${d}</option>`).join("")}</select>
      <p class="small">Suggested by mock rules: explicit dentist or ENT requests only, everything else General OPD.</p>
      <div class="actions"><button class="primary" type="submit">${icon("check")}<span>Confirm details and department</span></button></div>
    </form>
    ${staff.note ? `<p class="ok" role="status">${esc(staff.note)}</p>` : ""}
    <div class="actions">${ibtn("back", "back", "Back to dashboard", "text")}${r.token ? ibtn("print-" + r.id, "print", "Print slip", "tonal") : ""}</div>
  </section>`;
}

function renderStaff() {
  document.documentElement.lang = "en";
  nav.hidden = false;
  nav.innerHTML = icon("back") + "<span>Patient kiosk</span>";
  nav.setAttribute("href", "#");
  const r = staff.open && staff.records.find(x => x.id === staff.open);
  root.innerHTML = r ? staffForm(r) : staffList();
}

function staffClick(e) {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act.startsWith("open-")) { staff.open = act.slice(5); staff.note = ""; return renderStaff(); }
  if (act.startsWith("print-")) return printSlip(staff.records.find(x => x.id === act.slice(6)));
  if (act.startsWith("filter-")) { staff.filter = act.slice(7); return renderStaff(); }
  if (act === "back") { staff.open = null; staff.note = ""; return renderStaff(); }
}

root.addEventListener("submit", async e => {
  if (e.target.id !== "staffform") return;
  e.preventDefault();
  const form = new FormData(e.target);
  const answers = Object.fromEntries(FIELDS.map(f => [f, String(form.get(f) || "").trim()]));
  if (FIELDS.some(f => !answers[f])) { staff.note = "Fill in all four details before confirming."; return renderStaff(); }
  try {
    const r = await api("PATCH", "/api/records/" + encodeURIComponent(staff.open), { answers, department: form.get("department") });
    staff.records = staff.records.map(x => (x.id === r.id ? r : x));
    staff.note = `Saved. ${r.token} is Registered for ${r.department}.`;
  } catch (err) {
    staff.note = "Could not save: " + err.message;
  }
  renderStaff();
});

// ---------- start ----------

window.addEventListener("hashchange", () => {
  if (location.hash === "#staff") return enterStaff();
  leaveStaff();
  finish();
});
if (canSpeak) speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

s = fresh();
if (location.hash === "#staff") enterStaff(); else render();
