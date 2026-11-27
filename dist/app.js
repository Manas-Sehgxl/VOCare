"use strict";
const root = document.querySelector("#app");
const nav = document.querySelector("#nav");
const fields = ["name","age","village","complaint"];
const names = [["Name","नाम"],["Age","उम्र"],["Village","गाँव"],["Complaint","तकलीफ़"]];
const questions = [
  ["What is your name?","आपका नाम क्या है?"],
  ["How old are you?","आपकी उम्र कितनी है?"],
  ["Which village or locality do you live in?","आप किस गाँव या मोहल्ले से हैं?"],
  ["What brings you to the hospital?","आपको क्या तकलीफ़ हो रही है?"]
];
const samples = [
  ["Savitri Devi","सावित्री देवी"],
  ["About 55 years","लगभग पचपन साल"],
  ["Rampur","रामपुर"],
  ["Teen din se stomach pain hai.","तीन दिन से पेट में दर्द है।"]
];
const storageKey = "bol-opd-demo-v1";
let screen, lang, sample, index, editing, answers, failures, warning, session, currentToken;
let listener = null, voiceEpoch = 0, micTimer, continuous = false;
let staffID = null;
function reset() {
  screen = "welcome";
  lang = "en";
  sample = false;
  index = 0;
  answers = {};
  failures = 0;
  editing = false;
  warning = "";
  session = crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2);
  currentToken = "";
  continuous = false;
}
function t(en,hi) { return lang === "hi" ? hi : en; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function btn(action,label,cls="",attr="") {
  return '<button data-act="'+action+'" class="'+cls+'" '+attr+'>'+esc(label)+'</button>';
}
function records() {return JSON.parse(localStorage.getItem(storageKey) || "[]");}
function save(rows) {localStorage.setItem(storageKey,JSON.stringify(rows));}
function state(message) {
  document.querySelector("#status").textContent = message;
  const out = document.querySelector(".state");
  if (out) out.textContent = message;
}
function stopVoice() {
  voiceEpoch++;
  clearTimeout(micTimer);
  if(listener) {
    listener.onend = listener.onerror = listener.onresult = null;
    listener.abort();
    listener = null;
  }
  window.speechSynthesis?.cancel();
}
function speak(message, after) {
  stopVoice();
  const epoch = voiceEpoch;
  if(!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    state(t("Read the prompt or ask staff for help.","सवाल पढ़ें या कर्मचारी से मदद लें।"));
    if(after) after();
    return;
  }
  const voice = new SpeechSynthesisUtterance(message);
  voice.lang = t("en-IN","hi-IN");
  voice.rate = 0.9;
  const done = () => {
    if(epoch !== voiceEpoch) return;
    state(t("Ready","तैयार"));
    if(after) after();
  };
  voice.onend = done;
  voice.onerror = done;
  state(t("Speaking…","बोल रहा है…"));
  window.speechSynthesis.speak(voice);
}
function promptText(){
  if(screen === "intake") return t(...questions[index]);
  if(screen === "review") return fields.map((k,i)=>t(...names[i])+" "+answers[k]).join(". ")+t(". Is this correct? Say yes or say change village.",". क्या यह सही है? हाँ या गाँव बदलें कहें।");
  if(screen === "token") return t("Your token is ","आपका टोकन है ")+currentToken;
  if(screen === "consent") return t("May we record your registration details? Say yes to begin.","क्या हम आपके पंजीकरण की जानकारी लिखें? शुरू करने के लिए हाँ कहें।");
  return t("Choose English or Hindi. हिंदी या English बोलिए।","हिंदी या English बोलिए।");
}
function readPrompt() {
  speak(promptText(), continuous && ["intake","review","consent"].includes(screen) ? listen : null);
}
function go(next,announce=false) {
  stopVoice();
  screen = next;
  warning = "";
  render();
  window.scrollTo(0,0);
  root.querySelector("h1,h2")?.focus({preventScroll:true});
  if(announce) readPrompt();
}
function start(mode) {
  sample = mode === "sample";
  continuous = false;
  go("consent",!sample);
}
function listen() {
  stopVoice();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR) return fail(t("This browser has no speech recognition. Try the sample or ask staff.","इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। नमूना आज़माएँ या मदद लें।"));
  const recog = new SR();
  const epoch = voiceEpoch;
  listener = recog;
  recog.lang = t("en-IN","hi-IN");
  recog.interimResults = false;
  recog.onresult = e => {
    if(epoch !== voiceEpoch) return;
    const result = e.results[0][0];
    stopVoice();
    if(result.confidence > 0 && result.confidence < 0.55) return fail(t("That was unclear. Please say it again.","आवाज़ साफ़ नहीं आई। कृपया फिर बोलें।"));
    heard(result.transcript.trim());
  };
  recog.onerror = e => {
    if(epoch !== voiceEpoch) return;
    const denied = ["not-allowed","service-not-allowed"].includes(e.error);
    stopVoice();
    fail(denied ? t("Microphone access is unavailable. Use the sample or staff desk.","माइक्रोफ़ोन उपलब्ध नहीं है। नमूना या मदद चुनें।") : t("We could not hear that clearly. Please try again.","आवाज़ साफ़ नहीं आई। कृपया फिर बोलें।"));
  };
  recog.onend = () => {
    if(epoch !== voiceEpoch) return;
    stopVoice();
    fail(t("No answer heard. Take your time and try again.","जवाब सुनाई नहीं दिया। आराम से फिर बोलें।"));
  };
  try {
    recog.start();
    state(t("Listening…","सुन रहा है…"));
    micTimer = setTimeout(()=>{if(epoch === voiceEpoch){stopVoice();fail(t("Need more time? Tap Speak when ready.","और समय चाहिए? तैयार होने पर बोलें दबाएँ।"));}},10000);
  } catch {stopVoice();fail(t("Microphone unavailable.","माइक्रोफ़ोन उपलब्ध नहीं है।"));}
}
function fail(message) {
  failures++;
  warning = message;
  if(failures >= 2) warning += t(" A staff member can finish this with you."," कर्मचारी आपकी मदद कर सकते हैं।");
  render();
  if(!sample) speak(warning);
}
function change(i) {
  editing = screen === "review" || editing;
  index = i;
  failures = 0;
  go("intake",!sample);
}
function accept(value) {
  if(!value.trim()) return fail(t("Please repeat that answer.","कृपया फिर बोलें।"));
  answers[fields[index]] = value.trim();
  failures = 0;
  if(editing && fields.every(k=>answers[k])) {
    editing = false;
    go("review",!sample);
  } else {
    const next = fields.findIndex(k=>!answers[k]);
    if(next < 0) go("review",!sample);
    else {index=next;go("intake",!sample);}
  }
}
function heard(raw) {
  const v = raw.toLowerCase().replace(/[.!?।]+$/,"").trim();
  if(/^(help|madad|मदद)( please)?$/.test(v)) return assist();
  if(/^(repeat|dobara|दोबारा|दोहराएँ)$/.test(v)) return readPrompt();
  if(screen === "welcome") {
    if(/हिंदी|हिन्दी|hindi/.test(v)) lang="hi";
    else if(/english|अंग्रेज़ी|इंग्लिश/.test(v)) lang="en";
    else return fail("Say English or Hindi. हिंदी या English बोलिए।");
    return start("mic");
  }
  if(screen === "consent") {
    if(/^(yes|हाँ|हां|haan|जी हाँ|start|begin)$/.test(v)) {continuous=true;return go("intake",true);}
    if(/^(no|नहीं)$/.test(v)) return finish();
    return fail(promptText());
  }
  if(["review","intake"].includes(screen) && /change|correct|badl|बदल|नहीं[, ]|nahi[, ]/.test(v)) {
    const i=[/name|नाम|naam/,/age|उम्र|umar/,/village|gaon|गाँव|गांव/,/complaint|तकलीफ|तकलीफ़/].findIndex(re=>re.test(v));
    if(i>=0) {
      if(i===2 && /(?:नहीं|nahi)[, ]+(.+)/.test(v)){
        const corrected=raw.replace(/^.*?(?:नहीं|nahi)[, ]+/i,"").replace(/\s+(?:है|hai)[.!।]?$/i,"");
        if(screen==="review"){answers.village=corrected;return go("review",true);}
      }
      return change(i);
    }
  }
  if(screen==="intake") return accept(raw);
  if(screen==="review"){
    if(/^(yes|yes correct|correct|confirm|हाँ|हां|haan|sahi hai|सही है)$/.test(v)) return register();
    return fail(t("Say yes to confirm or say change followed by the detail.","सही है कहें, या नाम, उम्र, गाँव या तकलीफ़ बदलें कहें।"));
  }
}
function department(s) {
  if(/dentist|दंत चिकित्सक|डेंटिस्ट/i.test(s)) return "Dental";
  if(/\bent\b|ईएनटी|ई एन टी/i.test(s)) return "ENT";
  return "General OPD";
}
function nextToken(rows) {
  const seq = Math.max(0,...rows.map(r=>Number(r.token?.split("-")[1])||0))+1;
  return "OPD-"+String(seq).padStart(3,"0");
}
async function writeRecord(task) {
  try {
    if(navigator.locks) await navigator.locks.request(storageKey,task);
    else task();
  } catch {
    warning=t("Could not save on this device. Please ask staff.","इस उपकरण पर जानकारी सहेजी नहीं जा सकी। कर्मचारी से मदद लें।");
    render();
  }
}
function register() {
  if(screen!=="review" || !fields.every(k=>answers[k])) return;
  return writeRecord(()=>{
    const rows=records();
    if(!rows.some(r=>r.id===session)) {
      rows.push({id:session,answers:{...answers},token:nextToken(rows),dept:department(answers.complaint),status:"Awaiting department review"});
      save(rows);
    }
    currentToken = rows.find(r=>r.id===session).token;
    go("token",!sample);
  });
}
function assist() {
  return writeRecord(()=>{
    const rows=records();
    if(!rows.some(r=>r.id===session)) {
      rows.push({id:session,answers:{...answers},status:"Needs assistance",dept:"General OPD",token:""});
      save(rows);
    }
    go("help");
  });
}
function finish(){stopVoice();reset();go("welcome");}
function controls() {
  return '<div class="actions">'+btn("repeat",t("Repeat","दोहराएँ"))+btn("help",t("Ask staff for help","कर्मचारी से मदद लें"))+btn("finish",t("Cancel","रद्द करें"),"link")+'</div>';
}
function mode(){
  return '<p class="kicker">'+(sample?t("Sample mode · simulated speech","नमूना · आवाज़ का अनुकरण"):t("Voice registration","आवाज़ से पंजीकरण"))+'</p>';
}
function msg(){return (warning?'<p role="alert" class="alert">'+esc(warning)+'</p>':"")+'<div class="state" aria-hidden="true"></div>';}
function detailRows(a,editable){
  return '<dl>'+fields.map((k,i)=>'<div class="row"><dt>'+t(...names[i])+'</dt><dd>'+esc(a[k]||"—")+'</dd>'+(editable?btn("edit-"+i,t("Change "+k,names[i][1]+" बदलें")):"")+'</div>').join("")+'</dl>';
}
function welcome(){
  return '<div class="welcome"><section><p class="kicker">OPD / '+t("Patient registration","रोगी पंजीकरण")+'</p><h1 tabindex="-1">'+t("Register by voice.","बोलकर पंजीकरण करें।")+'</h1><p class="lead">'+t("Say your details, check what we heard and collect your OPD token.","अपनी जानकारी बोलें, सुनकर जाँचें और अपना ओपीडी टोकन लें।")+'</p><div class="languages">'+btn("en","English","","lang=en aria-pressed="+(lang==="en"))+btn("hi","हिन्दी","","lang=hi aria-pressed="+(lang==="hi"))+'</div><div class="actions">'+btn("start",t("Start registration","पंजीकरण शुरू करें"),"primary")+btn("sample",t("Try the sample","नमूना आज़माएँ"))+'</div><div class="actions tight">'+btn("listen",t("Choose language by voice","भाषा बोलकर चुनें"),"link")+btn("greet",t("Hear instructions","निर्देश सुनें"),"link")+'</div>'+msg()+'</section><aside class="art"><div><div class="art-hi" lang="hi">नमस्ते।</div><span class="caption">Namaste</span></div><div class="wave" aria-hidden="true">'+Array.from({length:90},(_,i)=>'<i style="height:'+Math.round(8+77*Math.abs(Math.sin(i*.29)*Math.cos(i*.103)))+'%"></i>').join("")+'</div><div class="caption">हिन्दी &nbsp; / &nbsp; English</div></aside></div>';
}
function consent(){
  return mode()+'<h2 tabindex="-1">'+t("May we take your details?","क्या हम आपकी जानकारी लिखें?")+'</h2><p class="lead">'+t("We’ll ask your name, age, village and reason for visiting. You can hear and correct each detail before getting a token.","हम नाम, उम्र, गाँव और तकलीफ़ पूछेंगे। टोकन से पहले आप हर जवाब सुनकर बदल सकते हैं।")+'</p><p class="note">'+t("Demo only. Use fictional details. This browser stores the registration. Live voice may send audio to your browser’s speech provider.","नमूने में काल्पनिक जानकारी दें। जानकारी इस ब्राउज़र में रहेगी। लाइव आवाज़ आपके ब्राउज़र की वाणी सेवा को भेजी जा सकती है।")+'</p><div class="actions">'+btn("begin",t("Begin registration","शुरू करें"),"primary")+(sample?"":btn("listen",t("Answer by voice","बोलकर जवाब दें"))) +btn("finish",t("Cancel","रद्द करें"))+'</div>'+msg();
}
function intake(){
  const previous = fields.slice(0,index).filter(k=>answers[k]).pop();
  return mode()+'<div class="bar"><i style="width:'+((index+1)*25)+'%"></i></div><p class="small">'+(index+1)+' / 4 &nbsp; · &nbsp; '+t(...names[index])+'</p><h2 tabindex="-1">'+esc(t(...questions[index]))+'</h2>'+(previous?'<p class="small">'+t("Last answer","पिछला जवाब")+' · '+esc(answers[previous])+'</p>':"")+'<div class="actions">'+(sample?btn("answer",t("Use sample answer","नमूना जवाब दें"),"primary")+btn("noise",t("Try background noise","शोर आज़माएँ")):btn("listen",t("Speak","बोलें"),"primary")+btn("switch",t("Use sample mode","नमूना चुनें")))+(index>0?btn("previous",t("Correct previous answer","पिछला जवाब बदलें"),"link"):"")+'</div>'+msg()+controls();
}
function review(){
  return mode()+'<h2 tabindex="-1">'+t("Did we hear you correctly?","क्या हमने सही सुना?")+'</h2>'+detailRows(answers,true)+'<div class="actions">'+btn("confirm",t("Confirm and get token","पुष्टि करें और टोकन लें"),"primary")+(sample?"":btn("listen",t("Answer by voice","बोलकर जवाब दें")))+'</div>'+msg()+controls();
}
function ticket(){
  return '<p class="kicker">'+t("Registration slip","पंजीकरण पर्ची")+'</p><h2 tabindex="-1">'+t("Your demo token","आपका नमूना टोकन")+'</h2><div class="token">'+esc(currentToken)+'</div><p>'+t("Suggested department","सुझाया गया विभाग")+' · '+esc(department(answers.complaint))+'<br><span class="small">'+t("Staff will confirm the department.","कर्मचारी विभाग की पुष्टि करेंगे।")+'</span></p>'+detailRows(answers,false)+'<p class="small">ID · '+esc(session)+'</p><div class="actions">'+btn("finish",t("Finish","समाप्त करें"),"primary")+btn("print",t("Print slip","पर्ची प्रिंट करें"))+btn("repeat",t("Hear token","टोकन सुनें"))+'</div>'+msg();
}
function staff(){
  const rows=records();
  if(staffID) {
    const r=rows.find(x=>x.id===staffID);
    if(r) return '<p class="kicker">Staff desk</p><h2 tabindex="-1">'+esc(r.token||"Assisted registration")+'</h2><p>'+esc(r.status)+'</p><form id="staffform">'+fields.map((k,i)=>'<label for="f-'+k+'">'+names[i][0]+'</label><input required maxlength="500" id="f-'+k+'" name="'+k+'" value="'+esc(r.answers[k])+'">').join("")+'<label for="dept">Department</label><select id="dept" name="dept">'+["General OPD","Dental","ENT"].map(d=>'<option '+(d===r.dept?"selected":"")+'>'+d+'</option>').join("")+'</select><div class="actions"><button class="primary" type="submit">Confirm details and department</button></div></form><div class="actions">'+btn("back","Back to queue")+(r.token?btn("print","Print slip"):"")+'</div>'+msg();
  }
  return '<p class="kicker">Registration / staff</p><h2 tabindex="-1">Staff desk</h2><p class="lead">Review registrations and help patients finish their details.</p><p class="note">Demo records from this browser only. Use fictional details.</p><div class="records">'+(rows.length?rows.slice().reverse().map(r=>'<article class="record"><p class="kicker">'+esc(r.status)+'</p><h3>'+esc(r.token||"Assistance request")+' · '+esc(r.answers.name||"Name pending")+'</h3><p>'+esc(r.answers.complaint||"Complaint pending")+'</p>'+btn("record-"+r.id,"Review details")+'</article>').join(""):'<p>No registrations yet.</p>')+'</div>'+msg();
}
function render(){
  document.documentElement.lang=lang;
  nav.textContent=screen==="staff"? "Patient kiosk":t("Staff desk","कर्मचारी डेस्क");
  nav.hidden=!["welcome","staff"].includes(screen);
  let html;
  switch(screen){
    case "welcome": root.innerHTML=welcome();return;
    case "consent":html=consent();break;
    case "intake":html=intake();break;
    case "review":html=review();break;
    case "token":html=ticket();break;
    case "staff":html=staff();break;
    case "help":html='<h2 tabindex="-1">'+t("Staff assistance requested","मदद के लिए अनुरोध भेजा गया")+'</h2><p>'+t("Please go to the staff desk. They can continue with the details already captured.","कर्मचारी डेस्क पर जाएँ। आपके अब तक के जवाब वहाँ उपलब्ध हैं।")+'</p>'+btn("finish",t("Finish","समाप्त करें"),"primary");break;
  }
  root.innerHTML='<section class="panel">'+html+'</section>';
}
nav.onclick=()=>{if(screen==="staff") finish();else {staffID=null;lang="en";go("staff");}};
root.addEventListener("click",e=>{
  const action=e.target.closest("button")?.dataset.act;
  if(!action) return;
  if(action.startsWith("edit-")) return change(Number(action.slice(5)));
  if(action.startsWith("record-")){staffID=action.slice(7);return render();}
  switch(action){
    case "en":case "hi":lang=action;render();break;
    case "greet":case "repeat":readPrompt();break;
    case "start":case "sample":start(action);break;
    case "begin":continuous=!sample;go("intake",!sample);break;
    case "switch":stopVoice();continuous=false;sample=true;warning="";render();break;
    case "answer":accept(editing&&index===2?t("Ramnagar","रामनगर"):t(...samples[index]));break;
    case "noise":fail(t("Background noise obscured the answer. Please try again.","शोर के कारण जवाब साफ़ नहीं आया। फिर बोलें।"));break;
    case "previous":change(Math.max(0,index-1));break;
    case "listen":listen();break;
    case "confirm":register();break;
    case "help":assist();break;
    case "finish":finish();break;
    case "print":window.print();break;
    case "back":staffID=null;render();break;
  }
});
root.addEventListener("submit",e=>{
  if(e.target.id!=="staffform")return;
  e.preventDefault();
  const values=new FormData(e.target);
  if(fields.some(k=>!String(values.get(k)).trim())){state("Complete all four details before confirming.");return;}
  writeRecord(()=>{
    const rows=records(),r=rows.find(x=>x.id===staffID);
    if(!r)return;
    fields.forEach(k=>r.answers[k]=String(values.get(k)).trim());
    r.dept=values.get("dept");
    r.status="Registered";
    if(!r.token)r.token=nextToken(rows);
    save(rows);
    render();
    state("Changes saved.");
  });
});
window.addEventListener("storage",e=>{if(e.key===storageKey&&screen==="staff"&&!staffID)render();});
reset();
render();
