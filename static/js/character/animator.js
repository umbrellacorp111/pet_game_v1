/* character/animator.js — аниматор (док. 006/008/009/010/011/013).
   Позы = смещения от rest-позы, блендятся каждый кадр (никаких мгновенных
   переключений). Действия = таймлайны с приоритетами. Эмоции = стейт-машина,
   которая ведёт лицо, позу, свет, камеру, партиклы и UI. Idle = автономная
   жизнь с AFK-стадиями. Тач-зоны = эскалация и цепные реакции. */
window.Anim = (() => {
  let H = null;                 // активный герой
  const off = {}, tgt = {};     // текущие/целевые смещения костей
  let posY = 0, posYT = 0;      // смещение root по Y (сесть/лечь)
  let blend = 6;                // скорость бленда
  let action = null;            // {steps, t, dur, prio, hold, loopFx}
  const simple = [];            // «лёгкая жизнь» для сцены выбора

  /* ================= ЭМОЦИИ ================= */
  const EMO = {
    neutral:    {mouth:.35, browY:0,   browT:0,   lid:0,  cheek:0,  blink:4.5, pupil:1,   tint:null,            zoom:0,   glow:"",        p:null},
    happy:      {mouth:1,   browY:.02, browT:0,   lid:0,  cheek:.4, blink:3.2, pupil:1.1, tint:[0xffd9a1,.25],  zoom:-.2, glow:"#ffc93c", p:"heart"},
    excited:    {mouth:1,   browY:.03, browT:0,   lid:0,  cheek:.5, blink:2.4, pupil:1.25,tint:[0xffe3b0,.3],   zoom:-.3, glow:"#4ef0bc", p:"star"},
    sad:        {mouth:-1,  browY:-.01,browT:.35, lid:.35,cheek:0,  blink:6,   pupil:.85, tint:[0x8ba3ff,.3],   zoom:.3,  glow:"",        p:null},
    angry:      {mouth:-.7, browY:-.02,browT:-.5, lid:.15,cheek:.2, blink:5,   pupil:.9,  tint:[0xff9a8a,.25],  zoom:0,   glow:"#ff5e8a", p:null},
    surprised:  {mouth:0,   browY:.05, browT:0,   lid:-.2,cheek:0,  blink:7,   pupil:1.35,tint:null,            zoom:-.15,glow:"",        p:null},
    embarrassed:{mouth:.2,  browY:.01, browT:.3,  lid:.2, cheek:1,  blink:2.8, pupil:1,   tint:[0xffb7d0,.3],   zoom:0,   glow:"#ff8fb0", p:"blush"},
    tired:      {mouth:0,   browY:-.01,browT:.2,  lid:.55,cheek:0,  blink:2,   pupil:.9,  tint:[0x9aa8ff,.25],  zoom:.15, glow:"",        p:null},
    curious:    {mouth:.4,  browY:.03, browT:-.15,lid:0,  cheek:0,  blink:4,   pupil:1.15,tint:null,            zoom:-.1, glow:"",        p:null},
    sleepy:     {mouth:.1,  browY:-.01,browT:.2,  lid:.8, cheek:0,  blink:1.5, pupil:.8,  tint:[0x6b7bff,.35],  zoom:.2,  glow:"",        p:"zzz"},
  };
  const emoState = {cur:"neutral", prev:"neutral", intensity:0, hold:0, memory:[]};
  let baseline = "neutral";

  function setEmotion(name, intensity=1, hold=3){
    if (!EMO[name]) return;
    emoState.prev = emoState.cur;
    emoState.cur = name; emoState.intensity = intensity; emoState.hold = hold;
    emoState.memory.push(name); if (emoState.memory.length > 10) emoState.memory.shift();
    const E = EMO[name];
    Engine.lights.tint(E.tint ? E.tint[0] : 0xffffff, E.tint ? E.tint[1]*intensity : 0);
    Engine.cam.setEmotion(E.zoom*intensity);
    Bus.emit("emotion:changed", {name, intensity, glow:E.glow});
    if (E.p && intensity > .5) Engine.particles.spawn(E.p, headPos(), 5, .5);
  }

  /* ================= ПОЗЫ / ДЕЙСТВИЯ ================= */
  const Z = {}; // пустая поза
  function setPose(p, y){ // мгновенная установка целей (бленд сделает плавно)
    for (const k in tgt) delete tgt[k];
    Object.assign(tgt, p || Z);
    posYT = y || 0;
  }
  /* библиотека действий: массив шагов {at, pose, y, face, fx, snd, emo} */
  const A = {
    wave:      {dur:1.6, prio:2, steps:[
      {at:0,  pose:{shR:[0,0,-2.5]}, snd:"vHappy"},
      {at:.4, pose:{shR:[0,0,-2.5], elR:[0,0,-.5]}},
      {at:.7, pose:{shR:[0,0,-2.5], elR:[0,0,.3]}},
      {at:1.0,pose:{shR:[0,0,-2.5], elR:[0,0,-.5]}},
      {at:1.3,pose:{}}]},
    nod:       {dur:.9, prio:1, steps:[{at:0,pose:{head:[.3,0,0]}},{at:.45,pose:{}}]},
    tiltHead:  {dur:1.4, prio:1, steps:[{at:0,pose:{head:[0,0,.3]}, snd:"vHm"},{at:.9,pose:{}}]},
    lookAround:{dur:2.6, prio:1, steps:[
      {at:0,pose:{head:[0,.6,0]}},{at:.9,pose:{head:[0,-.6,0]}},{at:1.9,pose:{}}]},
    stretch:   {dur:2.2, prio:1, steps:[
      {at:0,pose:{shL:[0,0,2.7], shR:[0,0,-2.7], spine:[-.15,0,0], head:[-.2,0,0]}, snd:"vHm"},
      {at:1.4,pose:{}}]},
    shiftWeight:{dur:1.8, prio:1, steps:[
      {at:0,pose:{pelvis:[0,0,.07], spine:[0,0,-.05]}},{at:.9,pose:{pelvis:[0,0,-.07], spine:[0,0,.05]}},{at:1.5,pose:{}}]},
    adjust:    {dur:1.6, prio:1, steps:[
      {at:0,pose:{elL:[-1.8,0,0], shL:[-.4,0,.3]}},{at:1.0,pose:{}}]},
    sigh:      {dur:2.0, prio:1, steps:[
      {at:0,pose:{spine:[.12,0,0], head:[.15,0,0]}, snd:"vSad"},{at:1.3,pose:{}}]},
    footTap:   {dur:1.6, prio:1, steps:[
      {at:0,pose:{thR:[-.25,0,0]}},{at:.3,pose:{}},{at:.6,pose:{thR:[-.25,0,0]}},{at:.9,pose:{}}]},
    laugh:     {dur:1.4, prio:3, steps:[
      {at:0,pose:{head:[-.2,0,0], spine:[-.06,0,0]}, face:{open:1}, snd:"vLaugh", fx:["spark",4]},
      {at:.3,pose:{head:[-.1,0,.1], spine:[.04,0,0]}},
      {at:.6,pose:{head:[-.2,0,-.1], spine:[-.04,0,0]}},
      {at:1.0,pose:{}, face:{open:0}}]},
    pushAway:  {dur:1.1, prio:3, steps:[
      {at:0,pose:{shL:[-1.3,0,.2], shR:[-1.3,0,-.2], spine:[.08,0,0]}, snd:"vOw"},
      {at:.6,pose:{}}]},
    stepBack:  {dur:1.0, prio:3, steps:[
      {at:0,pose:{spine:[.15,0,0], head:[.1,0,0], thL:[-.3,0,0], knL:[.4,0,0]}, snd:"vOw"},
      {at:.5,pose:{}}]},
    jumpJoy:   {dur:1.0, prio:3, jump:true, steps:[
      {at:0,pose:{shL:[0,0,2.6], shR:[0,0,-2.6]}, snd:"vWow", fx:["star",6]},
      {at:.6,pose:{}}]},
    headPat:   {dur:1.3, prio:3, steps:[
      {at:0,pose:{head:[0,0,.35]}, face:{open:0}, snd:"vHappy", fx:["heart",5]},
      {at:.8,pose:{}}]},
    escape:    {dur:1.6, prio:3, steps:[
      {at:0,pose:{spine:[0,.9,0], head:[0,.5,0]}, snd:"vLaugh"},
      {at:.5,pose:{spine:[0,-.9,0], head:[0,-.5,0]}},
      {at:1.1,pose:{}}]},
    eat:       {dur:1.8, prio:2, steps:[
      {at:0,pose:{elR:[-2.3,0,0], shR:[-.5,0,-.3], head:[.15,0,0]}, face:{open:.7}},
      {at:.5,face:{open:.2}},{at:.8,face:{open:.7}},{at:1.1,face:{open:.2}},
      {at:1.4,pose:{}, face:{open:0}, snd:"vHappy", fx:["heart",5]}]},
    wash:      {dur:1.8, prio:2, spin:true, steps:[
      {at:0,pose:{shL:[0,0,1.2], shR:[0,0,-1.2]}, fx:["bubble",12]},
      {at:1.2,pose:{}}]},
    kick:      {dur:.55, prio:5, steps:[
      {at:0,   pose:{thR:[-.65,0,-.1], knR:[1.1,0,0], spine:[.06,0,0], head:[.05,0,0]}, snd:"hit"},
      {at:.15, pose:{thR:[-.35,0,-.08], knR:[.5,0,0], spine:[.04,0,0], head:[.02,0,0]}},
      {at:.25, pose:{knR:[1.4,0,0], thR:[-.12,0,-.1], shR:[0,0,-1.2]}},
      {at:.4,  pose:{}}]},
    dance:     {dur:2.4, prio:2, steps:[
      {at:0,   pose:{shL:[0,0,2.2], shR:[0,0,-2.2], pelvis:[.08,0,0], head:[.05,0,.1]}},
      {at:.3,  pose:{shL:[0,0,-1.8], shR:[0,0,1.8], pelvis:[-.06,0,0], head:[.05,0,-.1]}},
      {at:.6,  pose:{shL:[0,0,2.4], shR:[0,0,-1.6], pelvis:[.06,0,0]}},
      {at:.9,  pose:{shL:[0,0,-1.6], shR:[0,0,2.4], pelvis:[-.04,0,0]}},
      {at:1.2, pose:{thL:[-.15,0,0]}},
      {at:1.5, pose:{thR:[-.15,0,0]}},
      {at:1.8, pose:{}},
      {at:2.1, pose:{}}]},
    celebrate: {dur:2.2, prio:6, jump:true, steps:[
      {at:0,pose:{shL:[0,0,2.7], shR:[0,0,-2.7]}, snd:"vWow", fx:["star",10]},
      {at:.5,pose:{shL:[0,0,2.2], shR:[0,0,-2.7], pelvis:[0,0,.1]}},
      {at:.9,pose:{shL:[0,0,2.7], shR:[0,0,-2.2], pelvis:[0,0,-.1]}},
      {at:1.3,pose:{shL:[0,0,2.7], shR:[0,0,-2.7]}, fx:["spark",8]},
      {at:1.8,pose:{}}]},
    defeat:    {dur:2.4, prio:5, steps:[
      {at:0,pose:{spine:[.3,0,0], head:[.45,0,0], shL:[.2,0,.15], shR:[.2,0,-.15]}, snd:"vSad"},
      {at:1.8,pose:{}}]},
    sit:       {dur:9e9, prio:1, hold:true, steps:[
      {at:0,pose:{thL:[-1.5,0,.1], thR:[-1.5,0,-.1], knL:[1.5,0,0], knR:[1.5,0,0], spine:[.08,0,0]}, y:-.42}]},
    rest:      {dur:9e9, prio:1, hold:true, steps:[
      {at:0,pose:{thL:[-1.5,0,.15], thR:[-1.5,0,-.15], knL:[1.5,0,0], knR:[1.5,0,0],
                  spine:[.2,0,0], head:[.3,0,0], shL:[.1,0,.2], shR:[.1,0,-.2]}, y:-.46}]},
    sleepPose: {dur:9e9, prio:5, hold:true, steps:[
      {at:0,pose:{thL:[-1.5,0,.15], thR:[-1.5,0,-.15], knL:[1.5,0,0], knR:[1.5,0,0],
                  spine:[.25,0,0], head:[.45,0,.15]}, y:-.46}]},
    wake:      {dur:2.4, prio:5, steps:[
      {at:0,pose:{spine:[.1,0,0]}, y:-.2, snd:"vHm"},
      {at:.7,pose:{shL:[0,0,2.7], shR:[0,0,-2.7], spine:[-.12,0,0]}, y:0, face:{open:.5}},
      {at:1.8,pose:{}, face:{open:0}}]},
  };

  /* ================= ТАНЕЦ (idle-цикл) ================= */
  let dancePhase = "wait", danceTimer = 0, dancePlayTimer = 0;
  const DANCE_DUR = 3;

  function danceTick(dt){
    if (!H || sleepMode || GS.room === "bed" || GS.mode !== "play") return;
    danceTimer += dt;

    // Ожидание — начинаем танец после 3с бездействия
    if (dancePhase === "wait"){
      if (lastInput >= 3){ doDance(); dancePhase = "dancing"; dancePlayTimer = 0; danceTimer = 0 }
      return;
    }

    // Пользователь что-то нажал — сброс
    if (lastInput < 3){ dancePhase = "wait"; danceTimer = 0; return }

    // Фаза танца — считаем длительность
    if (dancePhase === "dancing"){
      dancePlayTimer += dt;
      if (dancePlayTimer >= DANCE_DUR){ dancePhase = "pause"; danceTimer = 0 }
      return;
    }

    // Пауза 5с между танцами
    if (dancePhase === "pause" && danceTimer >= 5){
      doDance(); dancePhase = "dancing"; dancePlayTimer = 0
    }
  }

  function doDance(){
    if (H && H.isFBX) H.playAnim("dance");
    else play("dance", true);
  }

  function play(name, force){
    const def = A[name]; if (!def || !H) return 0;
    if (action && !force && def.prio < action.prio && action.t < action.dur) return 0;
    action = {name, def, t:0, dur:def.dur, prio:def.prio, stepIdx:0, hold:def.hold};
    if (def.jump) jumpT = 0;
    if (def.spin) spinT = 0;
    Bus.emit("anim:play", name);
    return def.dur;
  }
  function stopHold(){ if (action && action.hold){ action = null; setPose({}) } }

  /* ================= IDLE / AFK (автономная жизнь) ================= */
  const IDLE_POOL = [
    ["lookAround",3],["shiftWeight",3],["tiltHead",2],["adjust",2],
    ["stretch",1.4],["footTap",2],["sigh",1],["nod",1.4],["wave",.4],
  ];
  let idleNext = 2.5, lastIdle = "", lastInput = 0, afkStage = 0, sleepMode = false;
  Bus.on("input:any", ()=>{ lastInput = 0; dancePhase = "wait"; danceTimer = 0; dancePlayTimer = 0;
    if (afkStage >= 2 && !sleepMode){ afkStage = 0; stopHold(); play("wake", true) }
    else afkStage = 0;
  });

  function idleTick(dt){
    if (!H || sleepMode || GS.mode !== "play") return;
    lastInput += dt;
    /* AFK-стадии (док. 009) */
    if (lastInput > 150 && afkStage < 3){ afkStage = 3; play("rest", true); setEmotion("sleepy",.8,9e9) }
    else if (lastInput > 60 && afkStage < 2){ afkStage = 2; play("sit", true); setEmotion("tired",.6,9e9) }
    else if (lastInput > 30 && afkStage < 1){ afkStage = 1; setEmotion("curious",.5,10) }
    if (afkStage >= 2) return; // сидит/отдыхает — микро-действия не нужны
    idleNext -= dt;
    if (idleNext > 0) return;
    idleNext = 2.5 + Math.random()*3.5;
    if (action && action.t < action.dur) return;
    /* взвешенный выбор без повтора (анти-паттерн) */
    let pool = IDLE_POOL.filter(([n]) => n !== lastIdle);
    if (emoState.cur === "sad" || emoState.cur === "tired")
      pool = pool.filter(([n]) => !["jumpJoy","wave","footTap"].includes(n));
    const total = pool.reduce((s,[,w])=>s+w,0);
    let r = Math.random()*total;
    for (const [n,w] of pool){ r -= w; if (r <= 0){ lastIdle = n; play(n); break } }
  }

  /* ================= ТАЧ-ЗОНЫ и эскалация (док. 010) ================= */
  const zoneHits = {}; // zone -> {n, t}
  const ZONE_REACT = {
    head: ["headPat","laugh","tiltHead","escape"],
    face: ["laugh","headPat","pushAway","escape"],
    body: ["laugh","tiltHead","pushAway","escape"],
    armL: ["wave","pushAway","pushAway","escape"],
    armR: ["wave","pushAway","pushAway","escape"],
    legs: ["stepBack","stepBack","pushAway","escape"],
  };
  // Имена FBX-анимаций для зон (можно переопределить через H.setFBXAnimMap)
  const FBX_ANIM_MAP = {
    head: ["headPat","laugh","headPat","escape"],
    face: ["laugh","laugh","headPat","escape"],
    body: ["laugh","laugh","pushAway","escape"],
    armL: ["wave","wave","pushAway","escape"],
    armR: ["wave","wave","pushAway","escape"],
    legs: ["happy","stepBack","pushAway","escape"],
  };
  function touch(zoneName, hitPoint){
    if (!H) return;
    if (sleepMode){ Bus.emit("hero:sleep_touch"); return }
    stopHold(); afkStage = 0; lastInput = 0;
    const rec = zoneHits[zoneName] = zoneHits[zoneName] || {n:0, t:0};
    if (performance.now() - rec.t > 6000) rec.n = 0;
    rec.t = performance.now();
    const stage = Math.min(3, rec.n++);
    const emoNow = emoState.cur;
    if (H.isFBX){
      const fbxMap = H._fbxAnimMap || FBX_ANIM_MAP;
      const animName = fbxMap[zoneName] ? fbxMap[zoneName][stage] : "idle";
      if (!H.playAnim(animName)) H.playAnim("idle");
    } else {
      let reaction = ZONE_REACT[zoneName][stage];
      if (emoNow === "sad" && stage < 2) reaction = "tiltHead";
      if (emoNow === "embarrassed") reaction = stage < 2 ? "escape" : "pushAway";
      play(reaction, true);
    }
    /* эмоция от касания */
    if (stage === 0) setEmotion(zoneName==="face" ? "embarrassed" : "happy", .8, 3);
    else if (stage === 2) setEmotion("surprised", .7, 2);
    else if (stage === 3) setEmotion("excited", .9, 2.5);
    /* цепная реакция: голова → смех → отталкивание */
    if (zoneName === "head" && stage === 1 && !H.isFBX)
      setTimeout(()=>{ if (!sleepMode) play("pushAway") }, 1200);
    const pos = hitPoint || headPos();
    Engine.particles.spawn(stage >= 2 ? "spark" : "heart", pos, 4+stage*2, .35);
    Engine.cam.shake(.05 + stage*.02);
    if (zoneName === "head") Engine.cam.pulse(-.3,.4);
    hap(stage >= 2 ? "medium" : "light");
  }

  function headPos(){
    if (!H) return {x:0,y:1.9,z:.4};
    if (H.isFBX){
      const v = new THREE.Vector3();
      if (H.bones.head) H.bones.head.getWorldPosition(v);
      else return {x:0,y:1.4,z:.3};
      return {x:v.x, y:v.y+.15, z:v.z+.15};
    }
    const v = new THREE.Vector3();
    H.bones.head.getWorldPosition(v);
    return {x:v.x, y:v.y+.25, z:v.z+.3};
  }

  /* ================= ЛИЦО (док. 011) ================= */
  const faceCtl = {blinkIn:2.5, lids:0, open:0, openT:0, sacc:{x:0,y:0}, saccIn:1};
  function faceTick(dt, t){
    if (!H) return;
    // FBX-модель не имеет процедурного лица — лицевая анимация отключена
    if (H.isFBX) return;
    const E = EMO[emoState.cur], I = emoState.intensity;
    const F = H.face;
    /* веки: эмоция + моргание */
    faceCtl.blinkIn -= dt;
    let lid = E.lid*I;
    if (faceCtl.blinkIn < 0){
      faceCtl.blinkIn = E.blink*(0.7+Math.random()*.8);
      faceCtl.blinkT = .13;
    }
    if (faceCtl.blinkT > 0){ faceCtl.blinkT -= dt; lid = 1 }
    if (sleepMode) lid = 1;
    faceCtl.lids += (lid - faceCtl.lids)*dt*14;
    const lidS = .12 + faceCtl.lids*1.0;
    F.lidL.scale.y = lidS; F.lidR.scale.y = lidS;
    /* зрачки: слежение + микро-саккады */
    faceCtl.saccIn -= dt;
    if (faceCtl.saccIn < 0){ faceCtl.saccIn = .4+Math.random()*1.2;
      faceCtl.sacc.x = (Math.random()-.5)*.008; faceCtl.sacc.y = (Math.random()-.5)*.006 }
    const px = Engine.cam.pointer.sx*.045 + faceCtl.sacc.x;
    const py = -Engine.cam.pointer.sy*.03 + faceCtl.sacc.y;
    const ps = E.pupil;
    for (const s of ["L","R"]){
      const base = s==="L" ? -.12 : .12;
      F["pupil"+s].position.x = base + px; F["pupil"+s].position.y = .26 + py;
      F["iris"+s].position.x = base + px*.8; F["iris"+s].position.y = .26 + py*.8;
      F["pupil"+s].scale.setScalar(ps);
    }
    /* брови */
    const bt = E.browT*I, by = E.browY*I;
    F.browL.position.y = .36 + by; F.browR.position.y = .36 + by;
    F.browL.rotation.z = -bt; F.browR.rotation.z = bt;
    /* рот: изгиб + лёгкая жизнь (никогда не заморожен) */
    const curve = E.mouth*I;
    F.mouth.rotation.z = curve >= 0 ? Math.PI : 0;
    const mAmp = Math.abs(curve);
    F.mouth.scale.y = .35 + mAmp*.75 + Math.sin(t*1.7)*.04;
    F.mouth.scale.x = .8 + mAmp*.3;
    /* открытый рот (смех/еда/удивление) */
    let open = faceCtl.open;
    if (emoState.cur === "surprised") open = Math.max(open, .6*I);
    faceCtl.openT += (open - faceCtl.openT)*dt*10;
    F.mouthOpen.scale.y = Math.max(.01, faceCtl.openT*.9);
    /* румянец */
    const ch = E.cheek*I;
    F.cheekL.opacity += (ch*.85 - F.cheekL.opacity)*dt*5;
    F.cheekR.opacity = F.cheekL.opacity;
  }

  /* ================= ГЛАВНЫЙ ЦИКЛ ================= */
  let jumpT = -1, spinT = -1, auraAcc = 0;
  function tick(dt, t){
    if (!H) return;
    /* лёгкая жизнь героев сцены выбора */
    for (const s of simple){
      const b = s.hero.bones;
      b.spine.rotation.x = s.hero.rest.spine.x + Math.sin(t*2+s.ph)*.02;
      b.head.rotation.y = s.hero.rest.head.y + Math.sin(t*.7+s.ph)*.1;
      b.root.position.y = Math.sin(t*2.2+s.ph)*.02;
      const lid = (Math.sin(t*1.3+s.ph*3) > .97) ? 1 : 0;
      s.lid += (lid - s.lid)*dt*14;
      const lv = .12 + s.lid;
      s.hero.face.lidL.scale.y = lv; s.hero.face.lidR.scale.y = lv;
    }

    /* FBX: обновляем AnimationMixer */
    if (H.isFBX && H.mixer){
      H.mixer.update(dt);
    }

    /* эмоция: удержание → возврат к базовой */
    if (emoState.hold < 9e8){
      emoState.hold -= dt;
      if (emoState.hold <= 0 && emoState.cur !== baseline)
        setEmotion(baseline, .6, 9e9);
    }

    /* FBX: мимика и кастомные позы не работают — только звуки/частицы/свет */
    if (H.isFBX){
      // Прыжок
      if (jumpT >= 0){
        jumpT += dt*2.2;
        if (jumpT >= 1) jumpT = -1;
        else H.bones.root.position.y += Math.sin(jumpT*Math.PI)*.55;
      }
      // Аура
      if (H.fxAura){
        auraAcc += dt;
        if (auraAcc > .7){ auraAcc = 0;
          Engine.particles.spawn(H.fxAura === "fx_thunder" ? "bolt" : "spark",
            {x:0, y:1.2, z:.3}, 2, .8);
        }
      }
      if (sleepMode){
        auraAcc += dt;
        if (auraAcc > 1.6){ auraAcc = 0; Engine.particles.spawn("zzz", headPos(), 1, .2) }
      }
      // Событие дня / UI-эффекты всё равно работают
      danceTick(dt);
      faceTick(dt, t);
      idleTick(dt);
      return;
    }

    /* таймлайн действия (procedural) */
    if (action){
      action.t += dt;
      const steps = action.def.steps;
      while (action.stepIdx < steps.length && steps[action.stepIdx].at <= action.t){
        const st = steps[action.stepIdx++];
        if (st.pose) setPose(st.pose, st.y);
        else if (st.y !== undefined) posYT = st.y;
        if (st.face && st.face.open !== undefined) faceCtl.open = st.face.open;
        if (st.snd) Sfx.play(st.snd);
        if (st.fx) Engine.particles.spawn(st.fx[0], headPos(), st.fx[1], .5);
      }
      if (action.t >= action.dur && !action.hold){ action = null; setPose({}); faceCtl.open = 0 }
    }

    /* бленд поз к целям */
    const k = 1 - Math.pow(.002, dt*blend/6);
    for (const bk in H.bones){
      if (bk === "root" || bk === "hatSlot" || bk === "faceSlot") continue;
      const b = H.bones[bk], r = H.rest[bk];
      const tg = tgt[bk] || [0,0,0];
      const o = off[bk] = off[bk] || {x:0,y:0,z:0};
      o.x += (tg[0]-o.x)*k; o.y += (tg[1]-o.y)*k; o.z += (tg[2]-o.z)*k;
      b.rotation.set(r.x+o.x, r.y+o.y, r.z+o.z);
    }
    posY += (posYT - posY)*k;

    /* дыхание + вес тела */
    const br = Math.sin(t*2.1)*.018;
    H.bones.spine.rotation.x += br;
    H.bones.root.position.y = posY + (sleepMode ? Math.sin(t*1.1)*.015 : Math.sin(t*2.1)*.02);

    /* хвост волос — secondary motion */
    if (H.bones.pony){
      H.bones.pony.rotation.z = Math.sin(t*2.3)*.12 + (off.head ? -off.head.z*.8 : 0);
      H.bones.pony.rotation.x = .15 + Math.sin(t*1.7)*.06 + (off.head ? -off.head.x*.5 : 0);
    }

    /* прыжок */
    if (jumpT >= 0){
      jumpT += dt*2.2;
      if (jumpT >= 1) jumpT = -1;
      else H.bones.root.position.y += Math.sin(jumpT*Math.PI)*.55;
    }
    /* кручение (мытьё) */
    if (spinT >= 0){
      spinT += dt*1.2;
      if (spinT >= 1){ spinT = -1; H.bones.root.rotation.y = 0 }
      else H.bones.root.rotation.y = Math.sin(spinT*Math.PI)*Math.PI*1.4;
    }

    /* аура экипировки */
    if (H.fxAura){
      auraAcc += dt;
      if (auraAcc > .7){ auraAcc = 0;
        Engine.particles.spawn(H.fxAura === "fx_thunder" ? "bolt" : "spark",
          {x:H.bones.root.position.x, y:1.4+posY, z:.3}, 2, .8);
      }
    }
    /* сон: zzz */
    if (sleepMode){
      auraAcc += dt;
      if (auraAcc > 1.6){ auraAcc = 0; Engine.particles.spawn("zzz", headPos(), 1, .2) }
    }

    danceTick(dt);
    faceTick(dt, t);
    idleTick(dt);
  }

  /* ================= СИНХРОН С СЕРВЕРОМ ================= */
  function syncStats(S){
    if (!H) return;
    H.setLevel(S.level);
    if (S.sleeping && !sleepMode){
      sleepMode = true;
      if (!H.isFBX) play("sleepPose", true);
      setEmotion("sleepy", 1, 9e9); Sfx.play("sleep");
    } else if (!S.sleeping && sleepMode){
      sleepMode = false; afkStage = 0;
      if (!H.isFBX){ stopHold(); play("wake", true) }
      setEmotion("happy", .8, 3);
    }
    if (!S.sleeping && (emoState.hold > 9e8 || emoState.cur === emoState.prev)){
      const worst = Math.min(S.hunger, S.fun, S.clean, S.energy);
      baseline = S.energy < 15 ? "tired"
        : S.hunger < 20 ? "sad"
        : S.fun < 25 ? "sad"
        : worst >= 70 ? "happy" : "neutral";
      setEmotion(baseline, .6, 9e9);
    }
  }

  function attach(hero){
    H = hero;
    for (const k in off) delete off[k];
    for (const k in tgt) delete tgt[k];
    posY = posYT = 0; action = null;
  }
  function simpleLife(hero, phase=0){ const s = {hero, ph:phase, lid:0}; simple.push(s); return s }
  function clearSimple(){ simple.length = 0 }

  return {
    attach, simpleLife, clearSimple, play, touch, setEmotion, syncStats,
    tickInit(){ Engine.onTick(tick) },
    get sleeping(){ return sleepMode },
    get emotion(){ return emoState.cur },
  };
})();
