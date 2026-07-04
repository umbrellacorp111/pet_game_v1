/* game/arena.js — тап-комбат арены.
   battle_start → battle_finish{token,score}. */
window.Arena = (() => {
  let BT = null, fightActive = false;

  const BUFFS = [
    {id:"dmg",    emoji:"🗡️", name:"+Урон", desc:"+8 к урону",           price:3},
    {id:"crit",   emoji:"💥", name:"Крит",  desc:"+15% шанс крита (x2)",  price:4},
    {id:"speed",  emoji:"⚡", name:"Скорость",desc:"бьёшь на 40% чаще",   price:5},
    {id:"vamp",   emoji:"🩸", name:"Вампир",desc:"15% урона = ХП",        price:5},
    {id:"shield", emoji:"🛡️", name:"Щит",   desc:"первый удар врага 0",    price:3},
    {id:"berserk",emoji:"🔥", name:"Берсерк",desc:"+50% урона, но -25% ХП",price:6},
    {id:"thorns", emoji:"🌵", name:"Шипы",  desc:"враг получает +4 урона", price:4},
    {id:"lucky",  emoji:"🍀", name:"Удача", desc:"+10% двойная награда",  price:4},
    {id:"fury",   emoji:"⚔️", name:"Ярость",desc:"урон +2 за каждый баф", price:5},
    {id:"heal",   emoji:"💚", name:"Лечение",desc:"+15 ХП перед боем",    price:2},
  ];

  function selectedBuffs(){
    return (BT ? BT.buffs : []).map(id => BUFFS.find(b => b.id === id)).filter(Boolean);
  }
  function buffCost(id){ const b = BUFFS.find(x => x.id === id); return b ? b.price : 0 }

  function toggleBuff(id){
    if (!BT) return;
    const idx = BT.buffs.indexOf(id);
    if (idx >= 0) BT.buffs.splice(idx, 1);
    else if (BT.buffs.length < 5) BT.buffs.push(id);
    renderBuffs();
  }

  function renderBuffs(){
    const s = GS.S;
    const buffs = BUFFS.map(b => {
      const on = BT.buffs.includes(b.id);
      const dis = (s && s.coins < b.price && !on);
      return `<div class="bf ${on?'on':''} ${dis?'dis':''}" data-bid="${b.id}">
        <span class="e">${b.emoji}</span><span class="n">${b.name}</span><span class="c">${b.price}🪙</span></div>`;
    }).join("");
    $("vsBuffs").innerHTML = buffs;
    const total = BT.buffs.reduce((sum, bid) => sum + buffCost(bid), 0);
    $("buffPreview").textContent = `Бафов: ${BT.buffs.length} / 5 · цена: ${total} 🪙`;
  }

  /* клик по бафу в vsOv */
  document.addEventListener("click", e => {
    const bf = e.target.closest("#vsBuffs .bf:not(.dis)");
    if (bf && $("vsOv").classList.contains("show")) toggleBuff(bf.dataset.bid);
  });

  async function start(){
    try {
    const d = await Api.call("battle_start"); if(!d) return;
    GS.set("S", d); UI.render();
    BT = {token: d.token, opp: d.opponent, buffs: []};
    const s = GS.S;
    $("vsMePet").textContent = GS.gender === "f" ? "🦸‍♀️" : "🦸‍♂️";
    $("vsMe").textContent = s.pet_name;
    $("vsMeSub").textContent = `ур. ${s.level} · ${s.league.emoji} ${s.league.name}`;
    $("vsOpp").textContent = d.opponent.pet_name;
    $("vsOppSub").textContent = `ур. ${d.opponent.level} · ${d.opponent.league_emoji} ${d.opponent.league}`;
    const oppHat = d.opponent.equipped && d.opponent.equipped.hat;
    const hatDef = oppHat && UI.itemDef(oppHat);
    $("vsOppPet").textContent = "👤" + (hatDef ? " "+hatDef.emoji : "");
    renderBuffs();
    hap("medium"); Sfx.tone(200,400,.3,"sawtooth",.12);
    Engine.lights.flash(0xff5e8a, .9, .6);
    Anim.setEmotion("excited", 1, 5);
    $("vsOv").classList.add("show");
    } catch(e){ console.error("[Arena.start]", e) }
  }

  function begin(){
    try {
    if (!canAffordBuffs()){ UI.toast("Не хватает 🪙 на бафы!", true); return }
    const total = BT.buffs.reduce((sum, bid) => sum + buffCost(bid), 0);
    if (total > 0 && GS.S) GS.S.coins -= total;

    $("vsOv").classList.remove("show");
    const seq = ["3","2","1","БОЙ!"];
    $("countOv").classList.add("show");
    seq.forEach((n,i)=>setTimeout(()=>{
      const el = $("countNum");
      el.textContent = n;
      el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      if (n === "БОЙ!"){ Sfx.play("go"); hap("ok"); Engine.cam.shake(.1) }
      else { Sfx.play("tick"); hap("light") }
    }, i*750));
    setTimeout(()=>{
      $("countOv").classList.remove("show");
      startFight();
    }, seq.length*750);
    } catch(e){ console.error("[Arena.begin]", e) }
  }

  let fightState = {};

  function startFight(){
    const s = GS.S;
    const streak = Prefs.data.arenaStreak || 0;
    const baseHp = 80;
    const enemyMaxHp = Math.round(baseHp * (1 + streak * 0.25));
    const buffsResult = applyBuffs(10, 100);

    fightState = {
      enemyHp: enemyMaxHp,
      enemyMaxHp,
      myHp: buffsResult.myHp,
      myMaxHp: 100,
      baseDmg: 10,
      streak,
      token: BT.token,
      buffs: selectedBuffs(),
      buffEffects: buffsResult,
      nextHitTime: 0,
      shieldUsed: false,
      ended: false,
    };

    $("afEnemy").textContent = getEnemyEmoji();
    $("arenaFight").classList.add("show");
    $("arenaFight").style.display = "flex";
    renderFightHUD();
    if (window.Music) Music.play("arena", "arenaFight");
    fightActive = true;
  }

  function renderFightHUD(){
    const f = fightState;
    const hpPct = Math.max(0, 100 * f.myHp / f.myMaxHp);
    const enPct = Math.max(0, 100 * f.enemyHp / f.enemyMaxHp);
    $("afMyHpFill").style.width = hpPct + "%";
    $("afMyHpTxt").textContent = Math.round(hpPct) + "%";
    $("afEnHpFill").style.width = enPct + "%";
  }

  function getEnemyEmoji(){
    const streak = fightState.streak;
    if (streak >= 10) return "👹";
    if (streak >= 5) return "🧌";
    if (streak >= 2) return "🐉";
    return "👾";
  }

  function canAffordBuffs(){
    if (!BT) return true;
    const total = BT.buffs.reduce((sum, bid) => sum + buffCost(bid), 0);
    return total <= (GS.S ? GS.S.coins : 0);
  }

  function applyBuffs(baseDmg, myHp){
    const buffs = selectedBuffs();
    let dmg = baseDmg, critChance = 0, speedMul = 1, vampPct = 0;
    let shieldBlock = false, thornsDmg = 0, furyBonus = 0;
    for (const b of buffs){
      if (b.id === "dmg") dmg += 8;
      if (b.id === "crit") critChance = 0.15;
      if (b.id === "speed") speedMul = 0.7;
      if (b.id === "vamp") vampPct = 0.15;
      if (b.id === "shield") shieldBlock = true;
      if (b.id === "thorns") thornsDmg = 4;
      if (b.id === "fury") furyBonus = 2 * buffs.length;
      if (b.id === "heal") myHp = Math.min(100, myHp + 15);
      if (b.id === "berserk"){ dmg += Math.round(baseDmg * 0.5); myHp = Math.round(myHp * 0.75) }
    }
    return { dmg: dmg + furyBonus, critChance, speedMul, vampPct, shieldBlock, thornsDmg, myHp };
  }

  function onTapEnemy(){
    if (!fightActive || fightState.ended) return;
    const now = performance.now();
    if (now < fightState.nextHitTime) return;
    const eff = fightState.buffEffects;
    const interval = eff.speedMul * 280;
    fightState.nextHitTime = now + interval;

    let dmg = eff.dmg;
    let crit = false;
    if (Math.random() < eff.critChance){ dmg *= 2; crit = true }

    if (eff.vampPct > 0){
      const heal = Math.round(dmg * eff.vampPct);
      fightState.myHp = Math.min(fightState.myMaxHp, fightState.myHp + heal);
    }
    if (eff.thornsDmg > 0) dmg += eff.thornsDmg;

    fightState.enemyHp -= dmg;
    if (fightState.enemyHp < 0) fightState.enemyHp = 0;

    const dmgEl = $("afDmg");
    dmgEl.textContent = (crit ? "💥" : "-") + dmg;
    dmgEl.style.animation = "none"; void dmgEl.offsetWidth; dmgEl.style.animation = "";
    setTimeout(() => { if (dmgEl.textContent === (crit ? "💥" : "-") + dmg) dmgEl.textContent = "" }, 800);

    if (window.heroMain){
      if (window.heroMain.isFBX && window.heroMain.playAnim) window.heroMain.playAnim("kick");
      else Anim.play("kick", true);
    }
    Sfx.play("hit"); hap("light");
    Engine.cam.shake(.05);

    if (fightState.enemyHp <= 0){
      fightState.ended = true;
      finishFight(true);
    } else {
      setTimeout(() => enemyAttack(), 500 + Math.random() * 300);
    }
    renderFightHUD();
  }

  function enemyAttack(){
    if (fightState.ended) return;
    const eff = fightState.buffEffects;
    let enDmg = 4 + Math.round(fightState.streak * 1.2);
    if (eff.shieldBlock && !fightState.shieldUsed){
      enDmg = 0;
      fightState.shieldUsed = true;
      const myDmgEl = $("afMyDmg");
      myDmgEl.textContent = "🛡️ 0";
      myDmgEl.style.animation = "none"; void myDmgEl.offsetWidth; myDmgEl.style.animation = "";
    } else {
      fightState.myHp -= enDmg;
      if (fightState.myHp < 0) fightState.myHp = 0;
      const myDmgEl = $("afMyDmg");
      myDmgEl.textContent = "-" + enDmg;
      myDmgEl.style.animation = "none"; void myDmgEl.offsetWidth; myDmgEl.style.animation = "";
    }
    const enEl = $("afEnemy");
    enEl.style.transform = "scale(1.15)";
    setTimeout(() => enEl.style.transform = "", 120);
    Sfx.play("hit"); hap("light");
    if (fightState.myHp <= 0){
      fightState.ended = true;
      finishFight(false);
    }
    renderFightHUD();
  }

  async function finishFight(win){
    try {
    fightActive = false;
    $("arenaFight").classList.remove("show");
    $("arenaFight").style.display = "none";
    if (window.Music) Music.play(GS.room);

    const hasLucky = fightState.buffs.some(b => b.id === "lucky");
    const luckyMul = (hasLucky && Math.random() < 0.1) ? 2 : 1;
    const dmgDealt = fightState.enemyMaxHp - fightState.enemyHp;
    const score = Math.round(dmgDealt * 2 * luckyMul);

    const d = await Api.call("battle_finish", {token:fightState.token, score});
    if (!d){ UI.render(); return }

    GS.pending = d;

    if (win){
      Prefs.data.arenaStreak = (Prefs.data.arenaStreak || 0) + 1;
      Prefs.save();
      $("beIcon").textContent = "🏆";
      $("beTitle").textContent = "ПОБЕДА!";
      $("beTitle").className = "font-d beWin";
      $("beText").textContent = `Стрик побед: ${Prefs.data.arenaStreak} 🔥`;
      let deltaHtml = `<span>+${d.d_trophy || 0} 🏆</span><span>+${d.d_tokens || 0} 🎟</span>`;
      if (luckyMul > 1) deltaHtml += `<span>🍀×2</span>`;
      $("beDelta").innerHTML = deltaHtml;
      UI.confetti(); Sfx.play("fanfare"); hap("ok");
      Engine.lights.flash(0xffc93c, 1.5, .9); Engine.cam.shake(.14);
      Anim.play("celebrate", true); Anim.setEmotion("excited", 1, 5);
      Engine.particles.spawn("star", {x:0,y:1.7,z:.5}, 14, 1.2);
    } else {
      Prefs.data.arenaStreak = 0;
      Prefs.save();
      $("beIcon").textContent = "💔";
      $("beTitle").textContent = "Поражение";
      $("beTitle").className = "font-d beLose";
      $("beText").textContent = "Стрик сброшен 💔";
      $("beDelta").innerHTML = `<span>+0 🏆</span>`;
      Sfx.play("bad"); hap("bad");
      Anim.play("defeat", true); Anim.setEmotion("sad", .9, 5);
    }
    $("battleEnd").classList.add("show");
    } catch(e){ console.error("[Arena.finishFight]", e) }
  }

  function close(){
    try {
    $("battleEnd").classList.remove("show");
    $("arenaFight").classList.remove("show");
    $("arenaFight").style.display = "none";
    fightActive = false;
    BT = null;
    if (GS.pending){ const d = GS.pending; GS.pending = null; UI.afterAction(d) }
    else UI.render();
    } catch(e){ console.error("[Arena.close]", e) }
  }

  return { start, begin, close, toggleBuff, onTapEnemy, BUFFS, selectedBuffs,
           get enemyActive(){ return fightActive } };
})();