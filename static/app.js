/* app.js — состояние, API, UI. 3D-питомец в pet3d.js, мини-игры в games.js. */
const tg = window.Telegram.WebApp; tg.ready(); tg.expand();
tg.setHeaderColor?.("#120B26"); tg.setBackgroundColor?.("#120B26");
const initData = tg.initData;
const $ = id => document.getElementById(id);
let S = null, room = "living", sleepPoll = null;

const hap = t => { try {
  t==="ok" ? tg.HapticFeedback.notificationOccurred("success")
  : t==="bad" ? tg.HapticFeedback.notificationOccurred("error")
  : tg.HapticFeedback.impactOccurred(t||"light") } catch(e){} };

/* ---- звук (WebAudio) ---- */
let AC = null;
const snd = (f1, f2, dur=.12, type="sine", vol=.14) => { try {
  AC = AC || new (window.AudioContext||window.webkitAudioContext)();
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f1, AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(1,f2), AC.currentTime+dur);
  g.gain.setValueAtTime(vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(.001, AC.currentTime+dur);
  o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+dur) } catch(e){} };
const sCoin = () => snd(880,1320,.1,"triangle"),
      sPop  = () => snd(300,520,.08,"square",.08),
      sErr  = () => snd(220,140,.2,"sawtooth",.08),
      sBad  = () => snd(160,90,.25,"sawtooth",.12),
      sWin  = () => [523,659,784,1046].forEach((f,i)=>setTimeout(()=>snd(f,f,.18,"triangle",.18), i*90));

/* ---- конфетти ---- */
function confetti(){
  const c = $("confetti"), x = c.getContext("2d");
  c.width = innerWidth; c.height = innerHeight;
  const P = Array.from({length:90}, () => ({x:Math.random()*c.width, y:-20-Math.random()*200,
    v:2+Math.random()*3, w:5+Math.random()*6, a:Math.random()*6,
    col:["#FFC93C","#FF6B8B","#5CF2C0","#8C6BFF","#57C6FF"][Math.random()*5|0]}));
  let t = 0;
  (function loop(){
    x.clearRect(0,0,c.width,c.height); t++;
    P.forEach(p => { p.y += p.v; p.a += .1; x.save();
      x.translate(p.x+Math.sin(p.a)*12, p.y); x.rotate(p.a);
      x.fillStyle = p.col; x.fillRect(-p.w/2,-p.w/2,p.w,p.w*.6); x.restore() });
    if (t < 160) requestAnimationFrame(loop); else x.clearRect(0,0,c.width,c.height);
  })();
}

/* ---- API ---- */
async function api(path, extra={}){
  try {
    const r = await fetch("/api/"+path, {method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({initData, ...extra})});
    const d = await r.json();
    if (!r.ok){ toast(d.error||"Ошибка", true); hap("bad"); sErr(); return null }
    return d;
  } catch(e){ toast("Нет связи с сервером", true); return null }
}

function toast(t, bad){
  const el = $("toast"); el.textContent = t; el.classList.toggle("bad", !!bad);
  el.classList.add("show"); clearTimeout(el._t);
  el._t = setTimeout(()=>el.classList.remove("show"), 2100);
}
function flyCoin(fromEl, n=3){
  const to = document.querySelector(".pill").getBoundingClientRect();
  const f = fromEl.getBoundingClientRect();
  for (let i=0; i<n; i++) setTimeout(()=>{
    const s = document.createElement("div"); s.className = "fly"; s.textContent = "🪙";
    s.style.left = (f.left+f.width/2)+"px"; s.style.top = (f.top+f.height/2)+"px";
    document.body.appendChild(s);
    requestAnimationFrame(()=>{ s.style.left = (to.left+20)+"px"; s.style.top = to.top+"px";
      s.style.opacity = .2; s.style.transform = "scale(.4)" });
    setTimeout(()=>s.remove(), 720);
  }, i*80);
}
let shownCoins = 0;
function animCoins(t){
  const step = () => { const d = t-shownCoins;
    if (Math.abs(d) < 1){ shownCoins = t; $("coins").textContent = t; return }
    shownCoins += d*.2; $("coins").textContent = Math.round(shownCoins);
    requestAnimationFrame(step) };
  step();
}

/* ---- настроение / оверлеи питомца ---- */
function moodText(){
  if (S.sleeping) return "Спит и восстанавливает энергию… 💤";
  if (S.energy < 15) return "Валится с ног — уложи спать 🌙";
  if (S.hunger < 20) return "УМИРАЕТ С ГОЛОДУ 😭";
  if (S.clean < 30) return "Фу, грязнуля — в душ его! 🫧";
  if (S.fun < 25) return "Скучает… поиграй в Игровой 🕹";
  const w = Math.min(S.hunger, S.fun, S.clean, S.energy);
  return w >= 70 ? "Кайфует и любит тебя 💜" : "Всё чиллово, но можно лучше";
}
function renderPetOverlay(){
  $("hatE").textContent = S.equipped.hat ? S.shop[S.equipped.hat].emoji : "";
  $("faceE").textContent = S.equipped.face ? S.shop[S.equipped.face].emoji : "";
  $("fxE").innerHTML = S.equipped.fx === "fx_sparkle"
    ? [8,78,50].map((l,i)=>`<span style="left:${l}%;top:${[12,22,-6][i]}%;animation-delay:${i*.5}s">✨</span>`).join("") : "";
  $("zzz").style.display = S.sleeping ? "block" : "none";
  document.body.dataset.sleeping = S.sleeping ? 1 : 0;
}

/* ---- комнаты ---- */
const ROOM_PANELS = {
  living(){ return `<button class="bigAct g-viol" onclick="openSheet('quests')">📋 Квесты дня<small>3 задания · награды 🪙</small></button>` },
  kitchen(){ return Object.entries(S.foods).map(([id,f]) =>
    `<button class="food" onclick="feed('${id}')"><span class="fe">${f.emoji}</span><b>${f.name}</b><small>${f.price} 🪙</small></button>`).join("") },
  game(){
    return `<button class="bigAct g-gold" ${S.game_cd>0?"disabled":""} onclick="startCatch()">
      🍔 Лови еду<small>${S.game_cd>0?"отдых "+S.game_cd+" c":"до 45 🪙 · рекорд "+S.best_score}</small></button>
    <button class="bigAct g-viol" ${S.simon_cd>0?"disabled":""} onclick="startSimon()">
      🎵 Ритм<small>${S.simon_cd>0?"отдых "+S.simon_cd+" c":"6 🪙/шаг · рекорд "+S.best_simon+"/"+S.simon_len}</small></button>` },
  bath(){ return `<button class="bigAct g-mint" onclick="shower()">🚿 Помыть<small>чистота → 100 · +XP</small></button>` },
  arena(){
    const full = S.arena_charge >= 100;
    return `<div class="arenaCard">
      <div class="leagueBadge">${S.league.emoji} ${S.league.name} · 🏆 ${S.trophies}${S.league.next!==null?" / "+S.league.next:""}</div>
      <div style="font-size:11px;color:var(--dim);font-weight:800;margin-top:10px;letter-spacing:.08em">ЗАРЯД АРЕНЫ ${S.arena_charge}%</div>
      <div class="chargeTrack ${full?'full':''}"><div style="width:${S.arena_charge}%"></div></div>
      <div style="font-size:11.5px;color:var(--dim);font-weight:700;margin-top:6px">
        ${full ? "ГОТОВО! Уход даёт +"+S.care_bonus+"% к очкам боя"
               : "Играй в мини-игры (+34%) и ухаживай (+10%), чтобы зарядить"}</div>
      <button class="bigAct g-red" style="margin-top:12px" ${full?"":"disabled"} onclick="startBattle()">
        ⚔️ НАЙТИ СОПЕРНИКА<small>победа: +20 🏆 · +3 🎟 · +40 XP</small></button>
      <div style="font-size:11px;color:var(--dim);font-weight:700;margin-top:8px">
        Побед ${S.wins} · Поражений ${S.losses}</div></div>` },
  bed(){ return S.sleeping
    ? `<button class="bigAct g-gold" onclick="sleep()">☀️ Разбудить<small>энергия ${S.energy}/100</small></button>`
    : `<button class="bigAct g-sky" onclick="sleep()">🌙 Уложить спать<small>+1⚡ каждые 36 сек</small></button>` }
};
function setRoom(r){
  room = r; document.body.dataset.room = r;
  document.querySelectorAll("nav .t").forEach(t=>t.classList.toggle("on", t.dataset.room===r));
  $("roomPanel").innerHTML = ROOM_PANELS[r]();
}

/* ---- рендер ---- */
function render(){
  if (!S) return;
  animCoins(S.coins); $("streak").textContent = S.streak;
  $("tokens").textContent = S.tokens;
  $("aDot").style.display = S.arena_charge >= 100 ? "block" : "none";
  $("pname").textContent = S.pet_name || "…";
  $("lvl").textContent = S.level; $("rank").textContent = S.rank;
  $("xbar").style.width = (100*S.xp/S.xp_need)+"%";
  $("xVal").textContent = S.xp+"/"+S.xp_need;
  [["nh","hunger"],["ne","energy"],["nf","fun"],["nc","clean"]].forEach(([id,k])=>{
    const el = $(id); el.querySelector(".tr>div").style.width = S[k]+"%";
    el.classList.toggle("warn", S[k]<25 && !S.sleeping) });
  $("mood").textContent = moodText();
  $("dailyBtn").style.display = S.daily_available ? "block" : "none";
  $("qDot").style.display = S.quests.some(q=>q.done&&!q.claimed) ? "block" : "none";
  renderPetOverlay();
  window.Pet3D && Pet3D.setState(S);
  setRoom(room); renderQuests(); renderShop(); renderAch();
  if (!S.pet_name) $("onb").classList.add("show");
  clearInterval(sleepPoll);
  if (S.sleeping) sleepPoll = setInterval(async()=>{
    const d = await api("state"); if (d){ S = d; render() } }, 20000);
}
function renderQuests(){
  $("qList").innerHTML = S.quests.map(q=>`
    <div class="card ${q.done?'done':''}"><span class="e">${q.done?'✅':'📌'}</span>
      <div class="body"><b>${q.text}</b>
        <div class="qbar"><div style="width:${100*q.progress/q.goal}%"></div></div>
        <small>${q.progress}/${q.goal}</small></div>
      ${q.claimed ? '<span class="side" style="color:var(--mint)">✓</span>'
        : `<button class="claim" ${q.done?'':'disabled'} onclick="claimQ('${q.id}')">+${q.reward} 🪙</button>`}</div>`).join("")
    + `<p style="color:var(--dim);font-size:12px;text-align:center;margin-top:8px;font-weight:700">Новые квесты каждый день</p>`;
}
function renderShop(){
  const slotName = {hat:"Шапка",face:"Лицо",bg:"Фон",fx:"Эффект"};
  const row = (id,it,cur,shopKind) => {
    const owned = S.items.includes(id), eq = Object.values(S.equipped).includes(id);
    return `<div class="card" onclick="shopTap('${id}','${shopKind}')"><span class="e">${it.emoji}</span>
      <div class="body"><b>${it.name}</b><small>${slotName[it.slot]}${shopKind==='arena'?' · эксклюзив Арены':''}</small></div>
      <span class="side ${shopKind==='arena'?'tokPrice':''}">${eq?'НАДЕТО':owned?'надеть':it.price+' '+cur}</span></div>`;
  };
  $("sList").innerHTML =
    Object.entries(S.shop).map(([id,it])=>row(id,it,'🪙','coin')).join("")
    + `<h2 class="font-d" style="font-size:14px;margin:14px 0 10px">⚔️ Витрина Арены — за жетоны 🎟</h2>`
    + Object.entries(S.arena_shop).map(([id,it])=>row(id,it,'🎟','arena')).join("");
}
function renderAch(){
  $("aList").innerHTML = Object.entries(S.ach_all).map(([id,a])=>{
    const got = S.ach_got.includes(id);
    return `<div class="card ${got?'':'locked'}"><span class="e">${got?'🏅':'🔒'}</span>
      <div class="body"><b>${a.name}</b><small>${a.desc}</small></div>
      <span class="side">${got?'✓':'+'+a.reward+' 🪙'}</span></div>` }).join("");
}

/* ---- действия ---- */
function afterAction(d){
  S = d; render();
  if (d.season_reward){ toast("🏁 Новый сезон Арены! Жетоны за лигу начислены 🎟"); }
  if (d.levelup){
    $("lvlNew").textContent = S.level;
    $("lvlText").textContent = `${S.pet_name} эволюционирует! Награда: +${25*S.level} 🪙`;
    $("lvlOverlay").classList.add("show"); confetti(); sWin(); hap("ok");
  }
  (d.new_ach||[]).forEach((k,i)=>setTimeout(()=>{
    toast(`🏅 «${S.ach_all[k].name}»! +${S.ach_all[k].reward} 🪙`); sWin() }, 600+i*1500));
}
async function feed(id){ const d = await api("feed",{food:id}); if(!d) return;
  sPop(); hap("medium"); Pet3D.jump(); afterAction(d) }
async function shower(){ const d = await api("shower"); if(!d) return;
  sPop(); hap("medium"); Pet3D.jump(); toast("Блестит чистотой! 🫧"); afterAction(d) }
async function sleep(){ const d = await api("sleep"); if(!d) return;
  hap("light"); d.woke ? toast("Доброе утро! ☀️") : snd(400,180,.5,"sine",.1); afterAction(d) }
async function claimQ(id){ const d = await api("claim_quest",{id}); if(!d) return;
  sCoin(); hap("ok"); toast(`+${d.reward} 🪙 за квест!`); S = d; render() }
async function shopTap(id, kind){
  const owned = S.items.includes(id);
  const ep = owned ? "equip" : (kind === "arena" ? "arena_buy" : "buy");
  const d = await api(ep, {item:id}); if(!d) return;
  if (!owned){ confetti(); sWin(); toast("Куплено! 🎉") } else sPop();
  hap("ok"); S = d; render();
}
$("dailyBtn").onclick = async()=>{
  const d = await api("daily"); if(!d) return;
  confetti(); sWin(); hap("ok"); flyCoin($("dailyBtn"),5);
  toast(`🎁 +${d.bonus} 🪙 · Стрик ${d.streak} 🔥`); afterAction(d) };
$("petMount").onclick = ()=>{ hap("light"); sPop(); Pet3D.jump() };
$("nameBtn").onclick = async()=>{
  const d = await api("setname",{name:$("nameInput").value.trim()}); if(!d) return;
  $("onb").classList.remove("show"); confetti(); sWin(); S = d; render() };

/* ---- листы / навигация ---- */
function openSheet(id){ closeSheets(); $(id).classList.add("open"); if (id==="top") loadTop() }
function closeSheets(){ document.querySelectorAll(".sheet").forEach(s=>s.classList.remove("open")) }
document.querySelectorAll(".mb").forEach(b=>b.onclick = ()=>{ hap("light"); openSheet(b.dataset.sheet) });
async function loadTop(){
  const d = await api("top"); if(!d) return;
  $("tList").innerHTML = d.top.map((r,i)=>`
    <div class="rowtop"><span class="pos">${i+1}</span>
      <div class="who"><b>${r.pet_name}</b><small>${r.name} · 🔥${r.streak} · еда ${r.best_score} · ритм ${r.best_simon}</small></div>
      <span class="lv">ур. ${r.level}</span></div>`).join("")
    || '<p style="color:var(--dim);text-align:center">Пока пусто — стань первым!</p>';
}
document.querySelectorAll("nav .t").forEach(t=>t.onclick = ()=>{
  hap("light"); closeSheets(); setRoom(t.dataset.room) });
function hideOv(id){ $(id).classList.remove("show") }

/* ---- кулдауны: живое обновление кнопок Игровой ---- */
setInterval(()=>{
  if (!S) return;
  let changed = false;
  if (S.game_cd > 0){ S.game_cd--; changed = true }
  if (S.simon_cd > 0){ S.simon_cd--; changed = true }
  if (changed && room === "game") $("roomPanel").innerHTML = ROOM_PANELS.game();
}, 1000);

/* ---- старт ---- */
Pet3D.init($("petMount"));
(async()=>{ const d = await api("state"); if (d){ S = d; shownCoins = d.coins; render() } })();
