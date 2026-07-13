/* game/dungeon.js — Roguelite-файтинг (в духе Stickman Warriors).
   Сервер хранит прогресс (dungeon_*), клиент симулирует динамичный бой:
   3D-героиня бьёт видимого процедурного стикмэна, комбо, ki-шкала,
   уклонение/блок, hit-stop, slash-ленты, искры. */
(function(){
  const $ = id => document.getElementById(id);
  function st(){ return GS.S && GS.S.dungeon; }
  function pdf(d){ return d && (d.dungeon_floor ? d.dungeon_floor : 0); }

  let DG = null;
  let enemy = null;          // Stickman-стейт
  let heroHome = null;       // чтобы вернуть героиню на место
  let tickFn = null;
  let onSceneTap = null;

  /* ---------- детерминированный враг (клиент, как сервер) ---------- */
  function hashSeed(s, f, salt){
    let h = 0; const str = s + "|" + f + "|" + salt;
    for (let i=0;i<str.length;i++){ h = (h*31 + str.charCodeAt(i)) | 0; }
    return Math.abs(h) % 100000;
  }
  function makeEnemy(floor, seed){
    const boss = floor % 5 === 0;
    const r = hashSeed(seed, floor, "e");
    const color = Stickman.PALETTE[r % Stickman.PALETTE.length];
    const scale = boss ? 1.5 : (0.9 + (r % 30)/100);
    const sm = Stickman.build({color, scale, weapon: boss || (r % 2 === 0), faceLeft: true});
    const maxhp = Math.round((30 + floor*14) * (boss ? 3.2 : 1));
    sm.maxhp = maxhp; sm.hp = maxhp;
    sm.atk = Math.round((6 + floor*1.1) * (boss ? 1.6 : 1));
    sm.speed = boss ? 1900 : (1400 + (r % 800));   // мс между атаками
    sm.boss = boss; sm.floor = floor;
    return sm;
  }

  /* ---------- вход / выход ---------- */
  function start(){
    try { if (!Prefs.data.dungeonTutSeen){ showTut(true); return; } launch(); }
    catch(e){ console.error("[dungeon.start]", e) }
  }
  function launch(){
    DG = {busy:false, inRun:false, floor:0, hp:0, maxHp:0, monster:null, dead:false,
          token:"", combo:0, comboT:0, ki:0, transforming:0, lastHit:0, cd:0};
    $("dungeonOv").classList.add("on");
    render();
    bind();
  }
  function exit(){
    if (enemy){ Engine.scene.remove(enemy.group); enemy = null; }
    if (heroHome && window.heroMain) window.heroMain.group.position.copy(heroHome);
    if (tickFn){ Engine.offTick(tickFn); tickFn = null; }
    if (onSceneTap){ removeEventListener("pointerdown", onSceneTap); onSceneTap = null; }
    DG = null; $("dungeonOv").classList.remove("on"); UI.render();
  }
  function showTut(first){
    $("dgTut").classList.add("show");
    $("dgTutBtn").onclick = () => {
      Prefs.data.dungeonTutSeen = true; Prefs.save();
      $("dgTut").classList.remove("show");
      if (first) launch();
    };
  }
  function openTut(){ showTut(false); }

  /* ---------- старт забега ---------- */
  async function enter(){
    if (!DG || DG.busy) return;
    if ((GS.S.energy||0) < (st().cost_energy||15)){ UI.toast("Нет энергии 🌙", true); Sfx.play("err"); return; }
    DG.busy = true; Sfx.play("swoosh");
    const d = await Api.call("dungeon_start", {});
    DG.busy = false;
    if (!d){ return; }
    GS.set("S", d);
    DG.token = d.token || ""; DG.inRun = true; DG.dead = false;
    DG.floor = d.dungeon_floor; DG.maxHp = d.max_hp; DG.hp = d.dungeon_hp;
    startFloor(d.dungeon_floor, d.dungeon_seed);
    render(); hap("medium");
  }
  async function resume(){
    if (!DG || DG.busy) return;
    DG.busy = true; Sfx.play("swoosh");
    const d = await Api.call("dungeon_resume", {});
    DG.busy = false;
    if (!d){ return; }
    GS.set("S", d);
    DG.token = d.token || ""; DG.inRun = true; DG.dead = false;
    DG.floor = d.dungeon_floor; DG.maxHp = d.max_hp; DG.hp = d.dungeon_hp;
    startFloor(d.dungeon_floor, d.dungeon_seed);
    render(); hap("medium");
  }
  function startFloor(floor, seed){
    if (enemy){ Engine.scene.remove(enemy.group); enemy = null; }
    // поставить героиню в боевую стойку слева
    if (window.heroMain && window.heroMain.group){
      if (!heroHome) heroHome = window.heroMain.group.position.clone();
      window.heroMain.group.position.set(-1.35, 0, 2.2);
      window.heroMain.group.rotation.y = Math.PI*0.15;
    }
    enemy = makeEnemy(floor, seed);
    enemy.group.position.set(1.35, 0, 2.2);
    Engine.scene.add(enemy.group);
    DG.monster = enemy; DG.combo = 0; DG.ki = 0; DG.dead = false; DG.cd = 0;
    if (!tickFn){ tickFn = dt => tick(dt); Engine.onTick(tickFn); }
    Sfx.play("swoosh");
  }

  /* ---------- бой: игрок ---------- */
  function powerBonus(){ return (st().upgrades && st().upgrades.power || 0) * 3; }
  function playerDmg(){ return 10 + powerBonus() + Math.floor(DG.floor*0.6); }
  function critChance(){ return 0.06 * ((st().upgrades && st().upgrades.crit) || 0); }

  function attack(){
    if (!DG || !DG.inRun || DG.busy || !enemy || enemy.hp <= 0) return;
    if (Date.now() - DG.cd < 140) return;
    DG.cd = Date.now();
    Sfx.play("tap"); hap("light");
    Anim.play("kick");
    const crit = Math.random() < critChance();
    let dmg = playerDmg() * (crit ? 2 : 1) * (DG.transforming > 0 ? 1.6 : 1);
    enemy.hp -= dmg; enemy.hurt();
    // juice
    const ep = enemy.group.position;
    Engine.fx.slash({x: ep.x - (enemy.faceLeft?0.4:-0.4), y: 1.1, z: 2.2},
                     crit ? 0xffd76a : 0xfff0c0, enemy.scale);
    Engine.fx.impact({x: ep.x, y: 1.1, z: 2.2}, crit ? 0xffd76a : 0xffe08a, crit ? 16 : 10);
    Engine.fx.hitstop(crit ? 130 : 80);
    Engine.cam.shake(.1);
    floatText("-" + dmg + (crit ? "!" : ""), crit);
    // комбо
    const now = Date.now();
    if (now - DG.lastHit < 1200){ DG.combo++; } else { DG.combo = 1; }
    DG.lastHit = now;
    DG.ki = Math.min(100, DG.ki + (crit ? 9 : 6));
    if (enemy.hp <= 0){ enemy.die(); win(); return; }
    // встречная атака врага (часть кулдауна)
    enemy.attack();
  }
  function dodge(){
    if (!DG || !DG.inRun || DG.busy || !enemy) return;
    if (enemy.state === "attack" && enemy.t < 0.18){   // удачный додж
      DG.ki = Math.min(100, DG.ki + 7);
      UI.toast("УКЛОН!", false); Sfx.play("tick"); hap("ok");
      Anim.play("stepBack");
    } else {
      Anim.play("stepBack"); Sfx.play("tap");
    }
  }
  function block(){
    if (!DG || !DG.inRun) return;
    DG.blocking = true; setTimeout(()=>DG.blocking = false, 320);
    DG.ki = Math.min(100, DG.ki + 3);
    Anim.play("stepBack"); Sfx.play("tap");
  }
  async function kiBlast(){
    if (!DG || !DG.inRun || DG.ki < 100 || !enemy) return;
    DG.ki = 0; Sfx.play("legend"); hap("ok");
    Engine.lights.flash(0x4fc3ff, 1.6, .5);
    const ep = enemy.group.position;
    Engine.fx.slash({x: ep.x, y: 1.1, z: 2.2}, 0x4fc3ff, 2);
    Engine.fx.impact({x: ep.x, y: 1.1, z: 2.2}, 0x4fc3ff, 22);
    Engine.fx.hitstop(160); Engine.cam.shake(.22);
    let dmg = playerDmg() * 4;
    enemy.hp -= dmg; enemy.hurt();
    floatText("⚡" + dmg, true);
    if (enemy.hp <= 0){ enemy.die(); win(); }
  }
  function transform(){
    if (!DG || !DG.inRun || DG.ki < 100 || DG.transforming > 0) return;
    DG.ki = 0; DG.transforming = 8; Sfx.play("fanfare"); hap("ok");
    Engine.lights.flash(0xffd76a, 1.8, .6);
    UI.toast("✨ ТРАНСФОРМАЦИЯ!", false);
  }

  /* ---------- бой: враг ---------- */
  function enemyStrike(){
    if (!enemy || enemy.hp <= 0 || DG.dead) return;
    const raw = enemy.atk * (DG.transforming > 0 ? .6 : 1);
    let dmg = Math.round(raw);
    if (DG.blocking){ dmg = Math.round(dmg * 0.35); DG.ki = Math.min(100, DG.ki + 4); }
    DG.hp -= dmg;
    Anim.play("stepBack"); Engine.cam.shake(.14);
    floatText("-" + dmg, false, true);
    if (DG.hp <= 0){ die(); }
  }

  /* ---------- итоги ---------- */
  async function win(){
    DG.busy = true; Sfx.play("win"); hap("ok");
    if (enemy && enemy.boss) UI.toast("👹 Босс повержен!", false);
    setTimeout(async () => {
      const d = await Api.call("dungeon_action", {action:"clear", hp: Math.max(1,DG.hp), token: DG.token});
      DG.busy = false;
      if (!d){ return; }
      GS.set("S", d);
      if (!pdf(d)){
        DG.inRun = false; showLoot(d.loot || []);
        UI.toast("🏆 Вершина пройдена! Глубина " + (d.cleared||DG.floor), false);
        Sfx.play("fanfare"); hap("ok"); UI.confetti();
        render(); return;
      }
      showLoot(d.loot || []);
      if (enemy){ Engine.scene.remove(enemy.group); enemy = null; }
      startFloor(d.dungeon_floor, d.dungeon_seed);
      render();
    }, 700);
  }
  async function die(){
    DG.dead = true; DG.busy = true; Sfx.play("bad"); hap("bad");
    const d = await Api.call("dungeon_action", {action:"hp", hp:0, token: DG.token});
    if (d) GS.set("S", d);
    DG.inRun = false;
    UI.toast("💀 Пал на этаже " + DG.floor + ". Глубина записана.", false);
    if (enemy){ Engine.scene.remove(enemy.group); enemy = null; }
    render();
  }
  async function leave(){
    if (!DG || DG.busy) return;
    const d = await Api.call("dungeon_action", {action:"leave", token: DG.token});
    if (d) GS.set("S", d);
    if (enemy){ Engine.scene.remove(enemy.group); enemy = null; }
    DG.inRun = false;
    UI.toast("🚪 Выбрался на " + (d.left_floor||0) + "-м этаже", false);
    render();
  }
  async function upgrade(key){
    const d = await Api.call("dungeon_upgrade", {key});
    if (!d) return;
    GS.set("S", d); Sfx.play("coin"); hap("ok"); render();
  }

  /* ---------- цикл ---------- */
  function tick(dt){
    if (!DG || !DG.inRun) return;
    const t = performance.now()/1000;
    if (enemy) Stickman.animTick(enemy, dt, t);
    if (DG.comboT > 0){ DG.comboT -= dt; if (DG.comboT <= 0) DG.combo = 0; }
    if (DG.transforming > 0) DG.transforming -= dt;
    // ИИ врага: периодическая атака
    if (enemy && enemy.hp > 0 && !enemy.dead && !DG.dead){
      enemy._atk = (enemy._atk || 0) + dt*1000;
      if (enemy._atk >= enemy.speed && enemy.state !== "attack"){
        enemy._atk = 0; enemy.attack();
        setTimeout(()=>{ if (enemy && enemy.state === "attack") enemyStrike(); }, 220);
      }
    }
  }

  /* ---------- рендер HUD ---------- */
  function render(){
    const s = st(); if (!s || !DG) return;
    $("dgCoins").textContent = (GS.S.coins||0) + " 🪙";
    $("dgTokens").textContent = (GS.S.tokens||0) + " 🎟️";
    if (DG.inRun){
      if (!DG.monster){ resume(); return; }
      $("dgHub").style.display = "none";
      $("dgArena").style.display = "block";
      $("dgFloor").textContent = "Этаж " + DG.floor + (enemy && enemy.boss ? " 👹БОСС" : "");
      $("dgEnemyHpFill").style.width = Math.max(0, enemy.hp / enemy.maxhp * 100) + "%";
      $("dgMyHpFill").style.width = Math.max(0, DG.hp / DG.maxHp * 100) + "%";
      $("dgMyHpTxt").textContent = Math.max(0, DG.hp) + "/" + DG.maxHp;
      $("dgCombo").textContent = DG.combo > 1 ? ("x" + DG.combo) : "";
      $("dgKiFill").style.width = DG.ki + "%";
      $("dgKiBtn").classList.toggle("ready", DG.ki >= 100);
      $("dgKiBtn").textContent = DG.ki >= 100 ? (DG.transforming>0 ? "✨ АКТИВНО" : "⚡ КИ!") : "КИ " + Math.floor(DG.ki) + "%";
    } else {
      $("dgHub").style.display = "block";
      $("dgArena").style.display = "none";
      $("dgDeepest").textContent = s.deepest + "/" + s.max_floor;
      $("dgIngr").textContent = s.ingr;
      const can = (GS.S.energy||0) >= (s.cost_energy||15);
      $("dgEnter").disabled = !can;
      $("dgEnter").textContent = can ? "⚔️ СПУСТИТЬСЯ (энергия " + (s.cost_energy||15) + ")" : "Нет энергии 🌙";
      renderUpg();
    }
  }
  function renderUpg(){
    const s = st(); if (!s) return;
    const wrap = $("dgUpgList"); if (!wrap) return;
    wrap.innerHTML = Object.keys(s.upgrade_defs).map(k => {
      const d = s.upgrade_defs[k], lvl = (s.upgrades[k]||0), max = d.max;
      const next = lvl < max ? d.cost[lvl] : "—";
      const pips = Array.from({length:max}, (_,i)=>'<i class="'+(i<lvl?"on":"")+'"></i>').join("");
      return `<div class="dgUpg"><div class="dgUpgI">${d.name}</div><div class="dgUpgD">${d.desc}</div>
        <div class="dgPips">${pips}</div>
        <button data-upg="${k}" ${lvl>=max?"disabled":""}>${lvl>=max?"МАКС":("🎟️ "+next)}</button></div>`;
    }).join("");
    wrap.querySelectorAll("[data-upg]").forEach(b => b.onclick = () => upgrade(b.dataset.upg));
  }
  function showLoot(loot){
    if (!loot || !loot.length) return;
    $("dgLoot").innerHTML = loot.map(x=>'<span class="dgLootItem">'+x.emo+(x.amt>1?(" ×"+x.amt):"")+'</span>').join("");
    $("dgLoot").classList.add("show");
    Sfx.play("coin"); hap("ok");
    setTimeout(()=>$("dgLoot").classList.remove("show"), 2200);
  }
  function floatText(txt, big, mine){
    const a = $("dgFloat"); if (!a) return;
    const f = document.createElement("div");
    f.className = "dgFloat" + (big ? " big" : "") + (mine ? " mine" : "");
    f.textContent = txt;
    a.appendChild(f);
    setTimeout(()=>f.remove(), 800);
  }

  /* ---------- биндинг ---------- */
  function bind(){
    if (DG && DG.sw) return;
    $("dgEnter").onclick = enter;
    $("dgLeave").onclick = leave;
    $("dgAtk").onclick = attack;
    $("dgDodge").onclick = dodge;
    $("dgBlock").onclick = block;
    $("dgKiBtn").onclick = () => { if (DG.ki >= 100 && DG.transforming <= 0) transform(); else kiBlast(); };
    // тап по 3D-врагу в сцене = атака
    onSceneTap = (e) => {
      if (!DG || !DG.inRun || !enemy || enemy.hp <= 0) return;
      if (Engine.raycast(e.clientX, e.clientY, enemy.group.children).object) attack();
    };
    addEventListener("pointerdown", onSceneTap, {passive:true});
    DG.sw = true;
  }

  window.Dungeon = { start, exit, openTut, upgrade, _tick: tick };
})();
