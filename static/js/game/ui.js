/* game/ui.js — HUD и окна (док. 004). UI — часть мира: реагирует на
   эмоции, события и изменения значений свечением и партиклами. */
window.UI = (() => {
  let shownCoins = 0, shopTab = "all", sleepPoll = null;
  const prevStats = {};

  /* ---------- утилиты ---------- */
  function toast(t, bad){
    const el = $("toast"); el.textContent = t; el.classList.toggle("bad", !!bad);
    el.classList.add("show"); clearTimeout(el._t);
    el._t = setTimeout(()=>el.classList.remove("show"), 2100);
  }
  Bus.on("api:error", msg => toast(msg, true));

  function notify(icon, text){
    const n = document.createElement("div");
    n.className = "notif glassMini";
    n.innerHTML = `<span class="ni">${icon}</span><span>${text}</span>`;
    $("notifStack").appendChild(n);
    requestAnimationFrame(()=>n.classList.add("in"));
    setTimeout(()=>{ n.classList.remove("in"); setTimeout(()=>n.remove(), 400) }, 2600);
  }

  function confetti(){
    const c = $("confetti"), x = c.getContext("2d");
    c.width = innerWidth; c.height = innerHeight;
    const P = Array.from({length:90}, () => ({x:Math.random()*c.width, y:-20-Math.random()*200,
      v:2+Math.random()*3, w:5+Math.random()*6, a:Math.random()*6,
      col:["#FFC93C","#FF5E8A","#4EF0BC","#8B6BFF","#4FC3FF"][Math.random()*5|0]}));
    let t = 0;
    (function loop(){
      x.clearRect(0,0,c.width,c.height); t++;
      P.forEach(p => { p.y += p.v; p.a += .1; x.save();
        x.translate(p.x+Math.sin(p.a)*12, p.y); x.rotate(p.a);
        x.fillStyle = p.col; x.fillRect(-p.w/2,-p.w/2,p.w,p.w*.6); x.restore() });
      if (t < 160) requestAnimationFrame(loop); else x.clearRect(0,0,c.width,c.height);
    })();
  }
  function bump(id){ const el = $(id); el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump") }
  function animCoins(v){
    const step = () => { const d = v-shownCoins;
      if (Math.abs(d) < 1){ shownCoins = v; $("coins").textContent = v; return }
      shownCoins += d*.2; $("coins").textContent = Math.round(shownCoins);
      requestAnimationFrame(step) };
    step();
  }

  /* эмоция героя → свечение интерфейса */
  Bus.on("emotion:changed", ({glow}) => {
    const el = $("emoGlow");
    el.style.setProperty("--eg", glow || "transparent");
    el.classList.toggle("on", !!glow);
  });

  /* ---------- предметы: определение и редкость ---------- */
  const S = () => GS.S;
  function itemDef(id){ const s = S(); if (!s) return null;
    return (s.shop && s.shop[id]) || (s.arena_shop && s.arena_shop[id]) || null }
  function rarity(id){
    const it = itemDef(id); if (!it) return "common";
    if (S().arena_shop && S().arena_shop[id])
      return it.price >= 40 ? "leg" : it.price >= 20 ? "epic" : "rare";
    return it.price >= 1000 ? "leg" : it.price >= 600 ? "epic" : it.price >= 300 ? "rare" : "common";
  }
  const R_NAME = {common:"Обычный", rare:"Редкий", epic:"Эпический", leg:"Легендарный"};

  /* эффекты покупки по редкости (док. 004 RARITY) */
  function purchaseFx(id){
    const r = rarity(id);
    if (r === "leg"){
      Engine.lights.flash(0xffc93c, 1.6, .8);
      Engine.cam.shake(.16);
      Engine.particles.spawn("glow", {x:0,y:1.4,z:.5}, 16, 1.4);
      Engine.particles.spawn("star", {x:0,y:1.6,z:.5}, 12, 1.2);
      $("flash").classList.add("gold"); setTimeout(()=>$("flash").classList.remove("gold"), 800);
      Sfx.play("legend"); confetti(); Anim.play("celebrate", true);
    } else if (r === "epic"){
      Engine.lights.flash(0xa26bff, 1.1, .6);
      Engine.particles.spawn("spark", {x:0,y:1.5,z:.5}, 10, 1);
      Sfx.play("fanfare"); confetti(); Anim.play("jumpJoy", true);
    } else if (r === "rare"){
      Engine.particles.spawn("spark", {x:0,y:1.5,z:.5}, 7, .8);
      Sfx.play("win"); Anim.play("jumpJoy", true);
    } else { Sfx.play("win"); Anim.play("wave", true) }
    Anim.setEmotion("excited", 1, 3);
  }

  /* ---------- событие дня ---------- */
  const DAY_TIPS = [
    ["💡","Совет дня: полные шкалы ухода дают до +15% очков в бою"],
    ["⚔️","День бойца: каждая мини-игра заряжает Арену на +34%"],
    ["🎵","День ритма: пройди «Ритм» целиком — получишь ачивку"],
    ["🔥","Держи стрик: ежедневный бонус растёт с каждым днём"],
    ["🏆","Сезон закрывается каждую неделю — жетоны получают все лиги"],
    ["🍰","День кухни: торт — максимум сытости и XP за монету"],
    ["🎟","Жетоны не купить за монеты — только добыть в боях"],
  ];
  function showDayEvent(){
    const day = Math.floor(Date.now()/86400000);
    const [e, txt] = DAY_TIPS[day % DAY_TIPS.length];
    const b = $("eventBanner");
    b.innerHTML = `<span style="font-size:16px">${e}</span><span>${txt}</span>`;
    b.style.display = "flex";
  }

  /* ---------- настроение ---------- */
  function moodText(){
    const s = S();
    if (s.sleeping) return "Спит и восстанавливает энергию… 💤";
    if (s.energy < 15) return "Валится с ног — уложи спать 🌙";
    if (s.hunger < 20) return "Очень голоден 😭";
    if (s.clean < 30) return "Пора в душ! 🫧";
    if (s.fun < 25) return "Скучает… загляни в Кибер-зал 🕹";
    const w = Math.min(s.hunger, s.fun, s.clean, s.energy);
    return w >= 70 ? "Сияет и любит тебя 💜" : "Всё чиллово, но можно лучше";
  }

  /* ---------- панели комнат ---------- */
  const ROOM_PANELS = {
    living(){ return `<div class="bigAct g-viol" role="button" tabindex="0" data-action="quests">📋 Квесты дня<small>3 задания · награды 🪙</small></div>` },
    kitchen(){ const s = S(); if (!s) return ''; return Object.entries(s.foods).map(([id,f]) =>
      `<div class="food" role="button" tabindex="0" data-action="feed-${id}"><span class="fe">${f.emoji}</span><b>${f.name}</b><small>${f.price} 🪙</small></div>`).join("") },
    game(){ const s = S(); if (!s) return '';
      return `<div class="bigAct g-gold ${s.game_cd>0?'dis':''}" role="button" tabindex="0" data-action="catch">
        🍔 Лови еду<small>${s.game_cd>0?"отдых "+s.game_cd+" c":"до 45 🪙 · рекорд "+s.best_score}</small></div>
      <div class="bigAct g-viol ${s.simon_cd>0?'dis':''}" role="button" tabindex="0" data-action="simon">
        🎵 Ритм<small>${s.simon_cd>0?"отдых "+s.simon_cd+" c":"6 🪙/шаг · рекорд "+s.best_simon+"/"+s.simon_len}</small></div>` },
    bath(){ return `<div class="bigAct g-mint" role="button" tabindex="0" data-action="shower">🚿 Помыть<small>чистота → 100 · +XP</small></div>` },
    arena(){ const s = S(); if (!s) return '';
      const full = s.arena_charge >= 100;
      const next = s.league.next;
      const prevT = next !== null ? [0,100,250,500,900,1500][s.league.i] : 0;
      const lp = next !== null ? Math.min(100, 100*(s.trophies-prevT)/(next-prevT)) : 100;
      return `<div class="arenaCard">
        <div class="leagueBadge">${s.league.emoji} ${s.league.name} · 🏆 ${s.trophies}${next!==null?" / "+next:""}</div>
        ${next!==null?`<div class="leagueNext"><div style="width:${lp}%"></div></div>`:""}
        <div class="chargeLbl">ЗАРЯД АРЕНЫ ${s.arena_charge}%</div>
        <div class="chargeTrack ${full?'full':''}"><div style="width:${s.arena_charge}%"></div></div>
        <div class="chargeHint">${full ? "ГОТОВО! Уход даёт +"+s.care_bonus+"% к очкам боя"
          : "Играй в мини-игры (+34%) и ухаживай (+10%), чтобы зарядить"}</div>
        <div class="bigAct g-red" style="margin-top:12px" role="button" tabindex="0" data-action="arena">
          ⚔️ НАЙТИ СОПЕРНИКА<small>победа: +20 🏆 · +3 🎟 · +40 XP</small></div>
        <div class="chargeHint" style="margin-top:8px">Побед ${s.wins} · Поражений ${s.losses}</div></div>` },
    bed(){ const s = S(); if (!s) return ''; return s.sleeping
      ? `<div class="bigAct g-gold" role="button" tabindex="0" data-action="wake">☀️ Разбудить<small>энергия ${s.energy}/100</small></div>`
      : `<div class="bigAct g-sky" role="button" tabindex="0" data-action="sleep">🌙 Уложить спать<small>+1⚡ каждые 36 сек</small></div>` }
  };
  function setRoom(r){
    if (GS.room !== r) Bus.emit("room:changed", r);
    GS.set("room", r);
    Prefs.data.lastRoom = r; Prefs.save();
    document.body.dataset.room = r;
    document.querySelectorAll("nav .t").forEach(t=>t.classList.toggle("on", t.dataset.room===r));
    try { $("roomPanel").innerHTML = (ROOM_PANELS[r] || (()=>""))(); }
    catch(e){ console.error("[setRoom]", r, e); $("roomPanel").innerHTML = "" }
    /* click-обработчики навешиваются через capture-делегат в bind() */
  }

  /* ---------- рендер ---------- */
  function statGlow(id, key, val){
    if (prevStats[key] !== undefined && prevStats[key] !== val) bump(id);
    prevStats[key] = val;
  }
  function render(){
    const s = S(); if (!s) return;
    animCoins(s.coins); statGlow("coinPill","coins",s.coins);
    $("tokens").textContent = s.tokens; statGlow("tokPill","tokens",s.tokens);
    $("streak").textContent = s.streak;
    $("leagueChip").textContent = `${s.league.emoji} ${s.trophies}`;
    $("aDot").style.display = s.arena_charge >= 100 ? "block" : "none";
    $("pname").textContent = s.pet_name || "…";
    $("lvl").textContent = s.level; $("rank").textContent = s.rank;
    $("xbar").style.width = (100*s.xp/s.xp_need)+"%";
    $("xVal").textContent = s.xp+"/"+s.xp_need;
    [["nh","hunger"],["ne","energy"],["nf","fun"],["nc","clean"]].forEach(([id,k])=>{
      const el = $(id); el.querySelector(".tr>div").style.width = s[k]+"%";
      el.classList.toggle("warn", s[k]<25 && !s.sleeping) });
    $("mood").textContent = moodText();
    $("dailyBtn").style.display = s.daily_available ? "block" : "none";
    $("qDot").style.display = s.quests.some(q=>q.done&&!q.claimed) ? "block" : "none";
    document.body.dataset.sleeping = s.sleeping ? 1 : 0;
    /* мир (bg) от экипировки */
    document.body.dataset.world = s.equipped.bg || "";
    if (window.heroMain){
      heroMain.setEquip(s.equipped, itemDef);
      Anim.syncStats(s);
    }
    setRoom(GS.room); renderQuests(); renderShop(); renderAch();
    if (!s.pet_name && GS.mode === "play") $("onb").classList.add("show");
    clearInterval(sleepPoll);
    if (s.sleeping) sleepPoll = setInterval(async()=>{
      const d = await Api.call("state"); if (d){ GS.set("S", d); render() } }, 20000);
  }

  function renderQuests(){
    const s = S();
    $("qList").innerHTML = s.quests.map(q=>`
      <div class="card ${q.done?'done':''}"><span class="e">${q.done?'✅':'📌'}</span>
        <div class="body"><b>${q.text}</b>
          <div class="qbar"><div style="width:${100*q.progress/q.goal}%"></div></div>
          <small>${q.progress}/${q.goal}</small></div>
        ${q.claimed ? '<span class="side" style="color:var(--mint)">✓</span>'
          : `<button class="claim" ${q.done?'':'disabled'} onclick="UI.claimQ('${q.id}')">+${q.reward} 🪙</button>`}</div>`).join("")
      + `<p class="listHint">Новые квесты каждый день</p>`;
  }
  function renderShop(){
    const s = S(); if (!s) return;
    const slotName = {hat:"Голова",face:"Лицо",bg:"Мир",fx:"Аура"};
    const row = (id,it,cur,kind) => {
      const owned = s.items.includes(id), eq = Object.values(s.equipped).includes(id);
      const r = rarity(id);
      return `<div class="card r-${r}" onclick="UI.shopTap('${id}','${kind}')"><span class="e">${it.emoji}</span>
        <div class="body"><b>${it.name}<span class="rTag ${r}">${R_NAME[r]}</span></b>
          <small>${slotName[it.slot]}${kind==='arena'?' · эксклюзив Арены':''}</small></div>
        <span class="side ${kind==='arena'?'tokPrice':''}">${eq?'НАДЕТО':owned?'надеть':it.price+' '+cur}</span></div>`;
    };
    const coinRows = Object.entries(s.shop)
      .filter(([,it]) => shopTab==="all" || shopTab===it.slot)
      .map(([id,it])=>row(id,it,'🪙','coin')).join("");
    const arenaRows = Object.entries(s.arena_shop)
      .filter(([,it]) => shopTab==="all" || shopTab==="arena" || shopTab===it.slot)
      .map(([id,it])=>row(id,it,'🎟','arena')).join("");
    $("sList").innerHTML =
      (shopTab==="arena" ? "" : coinRows)
      + (arenaRows ? `<h2 class="font-d shopSep">⚔️ Витрина Арены — за жетоны 🎟</h2>` + arenaRows : "");
  }
  function renderAch(){
    const s = S(); if (!s) return;
    $("aList").innerHTML = Object.entries(s.ach_all).map(([id,a])=>{
      const got = s.ach_got.includes(id);
      return `<div class="card ${got?'':'locked'}"><span class="e">${got?'🏅':'🔒'}</span>
        <div class="body"><b>${a.name}</b><small>${a.desc}</small></div>
        <span class="side">${got?'✓':'+'+a.reward+' 🪙'}</span></div>` }).join("");
  }
  async function loadTop(){
    const d = await Api.call("top"); if(!d) return;
    $("tList").innerHTML = d.top.map((r,i)=>`
      <div class="rowtop"><span class="pos">${i+1}</span>
        <div class="who"><b>${r.pet_name}</b><small>${r.name} · 🔥${r.streak} · побед ${r.wins}</small></div>
        <span class="lv">🏆 ${r.trophies}</span></div>`).join("")
      || '<p class="listHint">Пока пусто — стань первым!</p>';
  }

  /* ---------- действия ---------- */
  function afterAction(d){
    GS.set("S", d); try { render(); } catch(e){ console.error("[afterAction] render", e) }
    if (d.season_reward) notify("🏁","Новый сезон Арены! Жетоны за лигу начислены 🎟");
    if (d.levelup){
      $("lvlNew").textContent = d.level;
      $("lvlText").textContent = `${d.pet_name} становится сильнее! Награда: +${25*d.level} 🪙`;
      $("lvlOverlay").classList.add("show");
      confetti(); Sfx.play("fanfare"); hap("ok");
      Engine.lights.flash(0xffc93c, 1.3, .8);
      Anim.play("celebrate", true); Anim.setEmotion("excited", 1, 4);
    }
    (d.new_ach||[]).forEach((k,i)=>setTimeout(()=>{
      notify("🏅", `«${d.ach_all[k].name}»! +${d.ach_all[k].reward} 🪙`); Sfx.play("win") }, 600+i*1500));
  }

  async function feed(id){
    try {
    const d = await Api.call("feed",{food:id}); if(!d) return;
    Sfx.play("pop"); hap("medium");
    Anim.play("eat", true); Anim.setEmotion("happy", .9, 3);
    afterAction(d);
    } catch(e){ console.error("[feed]", e) }
  }
  async function shower(){
    try {
    const d = await Api.call("shower"); if(!d) return;
    Sfx.play("pop"); hap("medium");
    Anim.play("wash", true); Anim.setEmotion("happy", .8, 3);
    notify("🫧","Блестит чистотой!");
    afterAction(d);
    } catch(e){ console.error("[shower]", e) }
  }
  async function sleep(){
    try {
    const d = await Api.call("sleep"); if(!d) return;
    hap("light");
    if (d.woke) notify("☀️","Доброе утро!");
    afterAction(d);
    } catch(e){ console.error("[sleep]", e) }
  }
  async function claimQ(id){
    try {
    const d = await Api.call("claim_quest",{id}); if(!d) return;
    Sfx.play("coin"); hap("ok"); notify("📋",`+${d.reward} 🪙 за квест!`);
    GS.set("S", d); render();
    } catch(e){ console.error("[claimQ]", e) }
  }
  async function shopTap(id, kind){
    try {
    const s = S();
    const owned = s.items.includes(id);
    const ep = owned ? "equip" : (kind === "arena" ? "arena_buy" : "buy");
    const d = await Api.call(ep, {item:id}); if(!d) return;
    if (!owned){ purchaseFx(id); notify("🛍","Куплено!") } else Sfx.play("pop");
    hap("ok"); GS.set("S", d); render();
    } catch(e){ console.error("[shopTap]", e) }
  }

  /* ---------- листы, орбит-меню, навигация ---------- */
  function openSheet(id){ closeSheets(); $(id).classList.add("open"); if (id==="top") loadTop() }
  function closeSheets(){ document.querySelectorAll(".sheet").forEach(sh=>sh.classList.remove("open")) }
  function hideOv(id){ $(id).classList.remove("show") }

  function bind(){
    document.querySelectorAll("#orbMenu .orbItem[data-sheet]").forEach(b=>
      b.onclick = ()=>{ hap("light"); Sfx.play("tap"); toggleOrb(false); openSheet(b.dataset.sheet) });
    $("orb").onclick = ()=>{ hap("light"); Sfx.play("tap"); toggleOrb() };
    $("sndBtn").onclick = ()=>{
      Prefs.data.sound = !Prefs.data.sound; Prefs.save();
      $("sndBtn").textContent = Prefs.data.sound ? "🔊" : "🔇";
      Bus.emit("sound:toggled", Prefs.data.sound);
      hap("light"); if (Prefs.data.sound) Sfx.play("pop");
    };
    document.querySelectorAll("nav .t").forEach(t=>t.onclick = ()=>{
      hap("light"); closeSheets(); setRoom(t.dataset.room) });
    document.querySelectorAll("#shopTabs .tab").forEach(b => b.onclick = () => {
      shopTab = b.dataset.tab; hap("light"); Sfx.play("tap");
      document.querySelectorAll("#shopTabs .tab").forEach(x=>x.classList.toggle("on", x===b));
      renderShop();
    });
    /* перехватываем pointerdown на document в capture-фазе — срабатывает на любом элементе */
    document.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      const btn = e.target.closest("[data-action]");
      if (!btn || !$("roomPanel").contains(btn) || btn.classList.contains("dis")) return;
      const a = btn.dataset.action;
      if (a === "quests") openSheet("quests");
      else if (a.startsWith("feed-")) feed(a.slice(5));
      else if (a === "catch") Games.startCatch();
      else if (a === "simon") Games.startSimon();
      else if (a === "shower") shower();
      else if (a === "arena") Arena.start();
      else if (a === "sleep" || a === "wake") sleep();
    }, true);
    $("dailyBtn").addEventListener("click", async()=>{
      try {
      const d = await Api.call("daily"); if(!d) return;
      confetti(); Sfx.play("win"); hap("ok");
      Engine.particles.spawn("glow", {x:0,y:1.6,z:.5}, 10, 1);
      Anim.play("jumpJoy", true); Anim.setEmotion("excited", 1, 3);
      notify("🎁",`+${d.bonus} 🪙 · Стрик ${d.streak} 🔥`);
      afterAction(d);
      } catch(e){ console.error("[dailyBtn]", e) }
    });
    $("nameBtn").onclick = async()=>{
      try {
      const d = await Api.call("setname",{name:$("nameInput").value.trim()}); if(!d) return;
      $("onb").classList.remove("show");
      confetti(); Sfx.play("fanfare");
      Anim.play("celebrate", true); Anim.setEmotion("excited", 1, 4);
      GS.set("S", d); render();
      } catch(e){ console.error("[nameBtn]", e) }
    };
    /* кулдауны Игровой — обновляем текст кнопок, не пересоздавая DOM */
    setInterval(()=>{
      const s = S(); if (!s) return;
      let changed = false;
      if (s.game_cd > 0){ s.game_cd--; changed = true }
      if (s.simon_cd > 0){ s.simon_cd--; changed = true }
      if (changed && GS.room === "game"){
        const btns = $("roomPanel").querySelectorAll("[data-action]");
        btns.forEach(btn => {
          const sm = btn.querySelector("small");
          if (!sm) return;
          if (btn.dataset.action === "catch"){
            sm.textContent = s.game_cd > 0
              ? "отдых "+s.game_cd+" c" : "до 45 🪙 · рекорд "+s.best_score;
            btn.classList.toggle("dis", s.game_cd > 0);
          } else if (btn.dataset.action === "simon"){
            sm.textContent = s.simon_cd > 0
              ? "отдых "+s.simon_cd+" c" : "6 🪙/шаг · рекорд "+s.best_simon+"/"+s.simon_len;
            btn.classList.toggle("dis", s.simon_cd > 0);
          }
        });
      }
    }, 1000);
  }
  let orbOpen = false;
  function toggleOrb(force){
    orbOpen = force !== undefined ? force : !orbOpen;
    $("orbWrap").classList.toggle("open", orbOpen);
  }

  return {
    bind, render, afterAction, setRoom, openSheet, closeSheets, hideOv,
    toast, notify, confetti, showDayEvent, itemDef,
    feed, shower, sleep, claimQ, shopTap,
  };
})();
