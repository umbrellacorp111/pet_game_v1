/* game/games.js — мини-игры. Контракты сервера прежние:
   game_start → game_finish{token,score}; simon_start → simon_finish{reached}.
   Очки = сумма номиналов (комбо — только визуал, античит не тронут). */
window.Games = (() => {
  const GOOD = [["🍔",2],["🍕",3],["🍿",1],["🎂",4],["⭐",5]];
  let G = null, SM = null;

  /* ---------- общий движок «Лови еду» ---------- */
  function runCatch(token, onEnd, title){
    $("catchTitle").textContent = title || "ЛОВИ ЕДУ!";
    const ov = $("catchOv");
    ov.classList.add("on"); $("catchEnd").classList.remove("on");
    const c = $("gCanvas"), x = c.getContext("2d");
    let W = 300, H = 400;
    function resizeCanvas(){
      const w = c.clientWidth, h = c.clientHeight;
      if (w < 1 || h < 1) return false;
      c.width = w * devicePixelRatio;
      c.height = h * devicePixelRatio;
      x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      W = w; H = h;
      return true;
    }
    resizeCanvas(); // initial setup
    G = {token, score:0, t0:performance.now(), dur:30000, items:[], pops:[],
         over:false, streak:0, lastHit:0, onEnd};
    $("gScore").textContent = "0";
    $("combo").classList.remove("show");
    let lastSpawn = 0;

    let lastFrame = performance.now();
    function spawn(el){
      const bad = Math.random() < .22;
      const [e,v] = bad ? ["💣",-5] : GOOD[Math.random()*GOOD.length|0];
      G.items.push({e, v, x:20+Math.random()*(W-40), y:-30,
        vy:(1.6+Math.random()*1.6)*(1+el/G.dur), r:24});
    }
    c.onpointerdown = ev => {
      if (!G || G.over) return;
      ev.preventDefault();
      const rect = c.getBoundingClientRect();
      const px = ev.clientX-rect.left, py = ev.clientY-rect.top;
      for (let i=G.items.length-1; i>=0; i--){
        const it = G.items[i];
        if (Math.hypot(px-it.x, py-it.y) < it.r+16){
          G.score = Math.max(0, G.score+it.v);
          $("gScore").textContent = G.score;
          G.pops.push({x:it.x, y:it.y, t:1, txt:(it.v>0?"+":"")+it.v, bad:it.v<0});
          const now = performance.now();
          if (it.v > 0){
            G.streak = now - G.lastHit < 1300 ? G.streak+1 : 1; G.lastHit = now;
            if (G.streak >= 3){
              const cb = $("combo");
              cb.textContent = `🔥 СЕРИЯ ×${G.streak}`;
              cb.classList.add("show"); clearTimeout(cb._t);
              cb._t = setTimeout(()=>cb.classList.remove("show"), 900);
            }
            Sfx.play("coin"); hap("light");
          } else { G.streak = 0; Sfx.play("bad"); hap("bad") }
          G.items.splice(i,1); break;
        }
      }
    }
    (function loop(){
      if (!G || G.over) return;
      if (!resizeCanvas()){ requestAnimationFrame(loop); return }
      const now = performance.now();
      const el = now - G.t0;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      if (el-lastSpawn > Math.max(280, 700-el/60)){ spawn(el); lastSpawn = el }
      $("gTimerFill").style.width = Math.max(0, 100-100*el/G.dur)+"%";
      x.clearRect(0,0,W,H);
      x.font = "34px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      G.items = G.items.filter(it => { it.y += it.vy * 120 * dt; x.fillText(it.e, it.x, it.y); return it.y < H+40 });
      x.font = "800 18px 'Manrope', system-ui";
      G.pops = G.pops.filter(p => { p.t -= .03; p.y -= 1.5;
        x.fillStyle = p.bad ? `rgba(255,94,138,${p.t})` : `rgba(255,201,60,${p.t})`;
        x.fillText(p.txt, p.x, p.y); return p.t > 0 });
      if (el >= G.dur){ G.over = true; G.onEnd(); return }
      requestAnimationFrame(loop);
    })();
  }

  async function startCatch(){
    try {
    const d = await Api.call("game_start"); if(!d) return;
    GS.set("S", d); UI.render();
    runCatch(d.token, endCatch);
    } catch(e){ console.error("[startCatch]", e) }
  }
  async function endCatch(){
    try {
    const d = await Api.call("game_finish", {token:G.token, score:G.score});
    if (d){
      $("catchEndText").textContent =
        `Очки: ${d.score} · Награда: +${d.reward} 🪙${d.score>GS.S.best_score?" · НОВЫЙ РЕКОРД!":""}`;
      GS.pending = d;
    } else $("catchEndText").textContent = "Очки: "+G.score;
    $("catchEnd").classList.add("on");
    } catch(e){ console.error("[endCatch]", e) }
  }
  function closeCatch(){
    try {
    $("catchOv").classList.remove("on");
    finishPending("happy");
    } catch(e){ console.error("[closeCatch]", e) }
  }
  function exitCatch(){
    if (G) G.over = true;
    $("catchOv").classList.remove("on");
    $("catchEnd").classList.remove("on");
    finishPending("happy");
  }

  /* ---------- Ритм ---------- */
  const PAD_FREQ = [392, 523, 659, 784];
  async function startSimon(){
    try {
    const d = await Api.call("simon_start"); if(!d) return;
    GS.set("S", d); UI.render();
    SM = {seq:d.seq, round:1, input:0, lock:true, over:false};
    $("simonOv").classList.add("on"); $("simonEnd").classList.remove("on");
    $("simonScore").textContent = "0";
    steps();
    setTimeout(playRound, 700);
    } catch(e){ console.error("[startSimon]", e) }
  }
  function steps(){
    $("simonSteps").innerHTML = SM.seq.map((_,i)=>
      `<i class="${i < SM.round-1 ? 'done' : i === SM.round-1 ? 'cur' : ''}"></i>`).join("");
  }
  function flash(i, dur=320){
    const p = document.querySelector(`.pad[data-i="${i}"]`);
    p.classList.add("lit"); Sfx.tone(PAD_FREQ[i], PAD_FREQ[i], dur/1000, "triangle", .2);
    setTimeout(()=>p.classList.remove("lit"), dur);
  }
  function playRound(){
    if (!SM || SM.over) return;
    SM.lock = true; SM.input = 0;
    steps();
    $("simonMsg").textContent = "Смотри и запоминай…";
    document.querySelectorAll(".pad").forEach(p=>p.disabled = true);
    const show = SM.seq.slice(0, SM.round);
    show.forEach((v,i)=>setTimeout(()=>flash(v), 500+i*520));
    setTimeout(()=>{
      SM.lock = false;
      $("simonMsg").textContent = "Твоя очередь!";
      document.querySelectorAll(".pad").forEach(p=>p.disabled = false);
    }, 500 + show.length*520 + 150);
  }
  function padTap(i){
    try {
    if (!SM || SM.lock || SM.over) return;
    flash(i, 200); hap("light");
    if (i === SM.seq[SM.input]){
      SM.input++;
      if (SM.input >= SM.round){
        $("simonScore").textContent = SM.round;
        if (SM.round >= SM.seq.length){ finishSimon(SM.round); return }
        SM.round++;
        $("simonMsg").textContent = "Верно! 🎉";
        Sfx.play("coin");
        setTimeout(playRound, 900);
        SM.lock = true;
      }
    } else { Sfx.play("bad"); hap("bad"); finishSimon(SM.round - 1) }
    } catch(e){ console.error("[padTap]", e) }
  }
  async function finishSimon(reached){
    try {
    SM.over = true;
    document.querySelectorAll(".pad").forEach(p=>p.disabled = true);
    const d = await Api.call("simon_finish", {reached});
    if (d){
      const full = reached >= GS.S.simon_len;
      $("simonEndText").textContent =
        `Повторено шагов: ${d.reached} · Награда: +${d.reward} 🪙` +
        (full ? " · ПОЛНОЕ ПРОХОЖДЕНИЕ! 🏆" : d.reached > GS.S.best_simon ? " · НОВЫЙ РЕКОРД!" : "");
      GS.pending = d;
    } else $("simonEndText").textContent = "Повторено шагов: " + reached;
    $("simonEnd").classList.add("on");
    } catch(e){ console.error("[finishSimon]", e) }
  }
  function closeSimon(){
    try {
    $("simonOv").classList.remove("on");
    finishPending("happy");
    } catch(e){ console.error("[closeSimon]", e) }
  }
  function exitSimon(){
    if (SM) SM.over = true;
    $("simonOv").classList.remove("on");
    $("simonEnd").classList.remove("on");
    finishPending("happy");
  }

  /* ---------- Рыбалка (глубинный заброс) ---------- */
  const FISH_TYPES = [
    {e:"🐟", n:"Пескарь",  v:1, dMin:.15, dMax:.35, speed:50},
    {e:"🐠", n:"Золотая",  v:1, dMin:.25, dMax:.50, speed:40},
    {e:"🐡", n:"Ёрш",      v:2, dMin:.40, dMax:.65, speed:35},
    {e:"🐙", n:"Осьминог", v:3, dMin:.55, dMax:.80, speed:28},
    {e:"🦈", n:"Акула",    v:5, dMin:.70, dMax:.95, speed:45},
  ];
  let FH = null;

  function runFishing(token, onEnd){
    const ov = $("fishingOv");
    ov.classList.add("on"); $("fishingEnd").classList.remove("on");
    const c = $("fCanvas"), x = c.getContext("2d");
    let W = 0, H = 0;

    function resize(){
      const w = c.clientWidth, h = c.clientHeight;
      if (w < 1 || h < 1) return;
      c.width = w * devicePixelRatio;
      c.height = h * devicePixelRatio;
      x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      W = w; H = h;
    }
    resize();

    FH = {
      token, score:0, t0:performance.now(), dur:35000, over:false, onEnd,
      phase:"charge", power:0, charging:false, depth:0,
      hookX:0, hookY:0, hookVisible:false,
      fish:[], catchIdx:-1, biteTime:0,
      combo:0, comboT:0, caught:[],
    };
    $("fScore").textContent = "0";
    let lastFrame = performance.now();
    let fishTimer = 0;

    function spawnFish(){
      const fi = FISH_TYPES[Math.random()*FISH_TYPES.length|0];
      const fromLeft = Math.random() < .5;
      FH.fish.push({
        type: fi, x: fromLeft ? -40 : W+40,
        y: fi.dMin + Math.random()*(fi.dMax-fi.dMin),
        vx: (fromLeft ? 1 : -1) * (fi.speed + Math.random()*20),
        interested: false, caught: false, missCd: 0,
      });
    }

    function draw(){
      x.clearRect(0,0,W,H);
      // water gradient
      const grd = x.createLinearGradient(0,0,0,H);
      grd.addColorStop(0,"#0e6a80");
      grd.addColorStop(.45,"#094a5a");
      grd.addColorStop(1,"#04222d");
      x.fillStyle = grd; x.fillRect(0,0,W,H);
      // wave lines
      x.strokeStyle = "rgba(255,255,255,.06)";
      x.lineWidth = 1.5;
      for (let i=0;i<8;i++){
        const yy = H*(.08+.11*i)+Math.sin((performance.now()/800)+i*1.2)*4;
        x.beginPath();
        for (let xx=0;xx<=W;xx+=6) x.lineTo(xx, yy+Math.sin(xx/30+(performance.now()/1000)+i)*3);
        x.stroke();
      }
      // fish
      for (const f of FH.fish){
        const s = f.type.dMax - f.type.dMin;
        const sz = 30 + 20*(1-s);
        x.font = `${sz}px system-ui,'Segoe UI Emoji','Apple Color Emoji',sans-serif`;
        x.textAlign = "center"; x.textBaseline = "middle";
        const fy = H * (f.y - (f.interested ? .04 : 0));
        x.globalAlpha = f.caught ? .3 : 1;
        x.fillText(f.type.e, f.x, fy);
        x.globalAlpha = 1;
        // interest ring
        if (f.interested && !f.caught){
          x.beginPath();
          x.arc(f.x, fy, 30, 0, Math.PI*2);
          x.strokeStyle = `rgba(255,201,60,${.3+.2*Math.sin(performance.now()/200)})`;
          x.lineWidth = 2; x.stroke();
        }
      }
      // hook line
      if (FH.hookVisible){
        const hy = H * FH.depth;
        x.strokeStyle = "rgba(255,255,255,.25)";
        x.lineWidth = 1.5; x.setLineDash([4,6]);
        x.beginPath(); x.moveTo(0,0); x.lineTo(FH.hookX, hy); x.stroke();
        x.setLineDash([]);
        // bobber glow
        x.font = "36px system-ui,'Segoe UI Emoji','Apple Color Emoji',sans-serif";
        x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText("🎣", FH.hookX, hy);
        // bite glow
        if (FH.catchIdx >= 0){
          x.beginPath();
          x.arc(FH.hookX, hy, 28, 0, Math.PI*2);
          x.strokeStyle = `rgba(255,94,138,${.3+.3*Math.sin(performance.now()/120)})`;
          x.lineWidth = 3; x.stroke();
        }
      }
      // power meter (right side)
      const px = W-32, py = 26, pw = 14, ph = H-52;
      x.fillStyle = "rgba(0,0,0,.35)";
      x.roundRect ? x.roundRect(px,py,pw,ph,6) : 0;
      x.fillRect(px,py,pw,ph);
      // level markers
      for (const fi of FISH_TYPES){
        const my = py + ph * (1 - (fi.dMin+fi.dMax)/2);
        x.fillStyle = "rgba(255,255,255,.12)";
        x.fillRect(px-2, my-1, pw+4, 2);
        x.font = "10px system-ui"; x.textAlign = "center";
        x.fillText(fi.e, px+pw/2, my-6);
      }
      // power fill
      if (FH.phase === "charge"){
        const fill = FH.power * ph;
        x.fillStyle = "rgba(255,201,60,.7)";
        x.fillRect(px+2, py+ph-fill, pw-4, fill);
      } else if (FH.hookVisible){
        const dy = py + ph * (1 - FH.depth);
        x.fillStyle = "rgba(78,240,188,.3)";
        x.fillRect(px+2, dy-2, pw-4, 4);
      }
    }

    function update(){
      const now = performance.now();
      const el = now - FH.t0;
      // timer
      $("fTimerFill").style.width = Math.max(0, 100-100*el/FH.dur)+"%";

      if (el >= FH.dur){
        FH.over = true;
        FH.phase = "done";
        for (const f of FH.fish) f.interested = false;
        onEnd();
        return;
      }

      // spawn fish periodically
      if (now - fishTimer > 1500 + Math.random()*1200){
        if (FH.fish.length < 6) spawnFish();
        fishTimer = now;
      }

      // move fish
      for (let i=FH.fish.length-1; i>=0; i--){
        const f = FH.fish[i];
        if (f.caught){ FH.fish.splice(i,1); continue }
        if (FH.hookVisible && !f.interested && now > f.missCd){
          const hookDepth = FH.depth;
          const depthMatch = Math.abs(f.y - hookDepth) < .08;
          const dist = Math.abs(f.x - FH.hookX);
          if (depthMatch && dist < 120) f.interested = true;
        }
        if (f.interested && FH.hookVisible && FH.catchIdx < 0){
          const dx = FH.hookX - f.x;
          f.vx = Math.sign(dx) * Math.min(Math.abs(f.vx), 60);
          f.x += f.vx * .016;
          if (Math.abs(dx) < 18){
            FH.catchIdx = i;
            FH.biteTime = now;
            Sfx.play("splash");
            hap("light");
          }
        } else if (!f.interested) {
          f.x += f.vx * .016;
          if ((f.x < -60 || f.x > W+60) && !f.interested) FH.fish.splice(i,1);
        }
      }

      // bite window — escape
      if (FH.catchIdx >= 0 && now - FH.biteTime > 700){
        const f = FH.fish[FH.catchIdx];
        if (f) { f.interested = false; f.missCd = now + 3000; f.vx *= -2 }
        FH.catchIdx = -1;
      }
    }

    function cast(){
      if (FH.phase !== "charge") return;
      FH.phase = "wait";
      FH.charging = false;
      FH.depth = Math.max(.05, Math.min(.95, FH.power));
      FH.hookX = 55 + Math.random() * (W-110);
      FH.hookY = H * FH.depth;
      FH.hookVisible = true;
      FH.catchIdx = -1;
      $("fHint").textContent = "👆 Тапни чтобы вытащить леску";
      $("fHint").style.opacity = ".4";
      Sfx.play("swoosh");
      hap("medium");
    }

    function downHandler(e){
      if (!FH || FH.over) return;
      e.preventDefault();
      if (FH.phase === "charge" && !FH.charging){
        FH.charging = true;
        FH.power = 0;
      } else if (FH.phase === "wait" && FH.hookVisible){
        // reel back
        FH.phase = "charge";
        FH.hookVisible = false;
        FH.catchIdx = -1;
        for (const f of FH.fish) { f.interested = false; f.missCd = performance.now() + 2000 }
        Sfx.play("reel");
        hap("light");
        $("fHint").textContent = "👆 Держи чтобы зарядить — отпусти для заброса";
        $("fHint").style.opacity = "1";
      } else if (FH.catchIdx >= 0){
        const f = FH.fish[FH.catchIdx];
        if (f && !f.caught){
          f.caught = true;
          FH.score += f.type.v;
          $("fScore").textContent = FH.score;
          const now = performance.now();
          if (now - FH.comboT < 2000) FH.combo++; else FH.combo = 1;
          FH.comboT = now;
          const comboEl = $("fCombo");
          if (FH.combo >= 3) { comboEl.textContent = `🔥×${FH.combo}`; comboEl.style.opacity = "1" }
          else comboEl.style.opacity = "0";
          Sfx.play("reel"); Sfx.play("coin");
          hap("ok");
          Engine.cam.shake(.03);
          FH.catchIdx = -1;
          const rect = c.getBoundingClientRect();
          const spl = document.createElement("div");
          spl.className = "fSplash";
          spl.textContent = `+${f.type.v}`;
          spl.style.cssText = `left:${e.clientX-rect.left}px;top:${e.clientY-rect.top}px`;
          c.parentElement.appendChild(spl);
          setTimeout(() => spl.remove(), 600);
        }
      }
    }

    function upHandler(e){
      if (!FH || FH.over) return;
      if (FH.phase === "charge" && FH.charging){
        FH.charging = false;
        cast();
      }
    }

    function powerLoop(){
      if (!FH || FH.over) return;
      if (FH.charging && FH.phase === "charge"){
        FH.power += .006;
        if (FH.power > 1){ FH.power = 0 }
        // hint pulse
        $("fHint").style.opacity = .15 + .85 * FH.power;
      }
      requestAnimationFrame(powerLoop);
    }

    c.addEventListener("pointerdown", downHandler);
    document.addEventListener("pointerup", upHandler);

    function loop(){
      if (!FH || FH.over) return;
      resize();
      update();
      draw();
      requestAnimationFrame(loop);
    }

    requestAnimationFrame(powerLoop);
    requestAnimationFrame(loop);

    FH._stop = () => {
      c.removeEventListener("pointerdown", downHandler);
      document.removeEventListener("pointerup", upHandler);
    };
  }

  async function startFishing(){
    try {
    const d = await Api.call("fishing_start"); if(!d) return;
    GS.set("S", d); UI.render();
    runFishing(d.token, endFishing);
    } catch(e){ console.error("[startFishing]", e) }
  }
  async function endFishing(){
    try {
    const d = await Api.call("fishing_finish", {score:FH.score});
    if (d){
      $("fishingEndText").textContent =
        `Рыбы: ${d.score} 🐟 · Награда: +${d.reward} 🪙${d.score>GS.S.best_fishing?" · НОВЫЙ РЕКОРД!":""}`;
      GS.pending = d;
    } else $("fishingEndText").textContent = "Рыбы: " + FH.score;
    $("fishingEnd").classList.add("on");
    } catch(e){ console.error("[endFishing]", e) }
  }
  function closeFishing(){
    try {
    if (FH && FH._stop) FH._stop();
    $("fishingOv").classList.remove("on");
    $("fishingEnd").classList.remove("on");
    finishPending("happy");
    } catch(e){ console.error("[closeFishing]", e) }
  }
  function exitFishing(){
    if (FH){ FH.over = true; if (FH._stop) FH._stop() }
    $("fishingOv").classList.remove("on");
    $("fishingEnd").classList.remove("on");
    finishPending("happy");
  }

  function finishPending(emo){
    try {
    if (GS.pending){
      const d = GS.pending; GS.pending = null;
      Sfx.play("win");
      Engine.particles.spawn("glow", {x:0,y:1.4,z:.5}, 6, .8);
      Anim.play("jumpJoy", true); Anim.setEmotion(emo, .9, 3);
      UI.afterAction(d);
    } else UI.render();
    } catch(e){ console.error("[finishPending]", e) }
  }

  function bind(){
    document.querySelectorAll(".pad").forEach(p=>p.onclick = ()=>padTap(+p.dataset.i));
  }

  return { bind, startCatch, closeCatch, exitCatch, startSimon, closeSimon, exitSimon, runCatch,
           startFishing, closeFishing, exitFishing,
           get G(){ return G } };
})();
