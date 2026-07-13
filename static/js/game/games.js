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

  /* ---------- Дудл-Джамп (прыжки вверх) — порт рабочего jump.html ---------- */
  const DOODLE_W = 360, DOODLE_H = 600;
  const GRAVITY = 0.22;
  const JUMP_STRENGTH = -8.5;
  const MOVE_SPEED = 4.5;
  const MIN_GAP = 60, MAX_GAP = 110;
  const PLAT_COUNT = 7;
  function startDoodle(){
    try {
      Api.call("doodle_start").then(d => {
        if (!d){ return; }
        GS.set("S", d); UI.render();
        runDoodle(d.token);
      });
    } catch(e){ console.error("[startDoodle]", e) }
  }
  function runDoodle(token){
    const ov = $("doodleOv");
    ov.classList.add("on"); $("doodleEnd").classList.remove("on");
    const c = $("dCanvas"), x = c.getContext("2d");
    let W = DOODLE_W, H = DOODLE_H, dpr = Math.min(devicePixelRatio || 1, 2);
    function size(){
      const w = c.clientWidth, h = c.clientHeight;
      if (w < 2 || h < 2) return false;
      c.width = w * dpr; c.height = h * dpr;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w; H = h; return true;
    }
    size();

    const G_ = { token, over:false, score:0, maxScore:0,
      player:{ x:W/2 - 20, y:H - 150, width:40, height:40, vx:0, vy:JUMP_STRENGTH, color:"#10b981" },
      platforms:[], keys:{}, tilt:0, pointerX:null, raf:0 };

    function makePlatform(y){
      return { width:70, height:15, x:Math.random()*(W-70), y, color:"#f59e0b" };
    }
    // стартовая платформа строго под игроком + остальные с контролируемым шагом
    G_.platforms = [];
    let cy = H - 50;
    const first = makePlatform(cy); first.x = W/2 - 35; G_.platforms.push(first);
    for (let i = 1; i < PLAT_COUNT; i++){
      cy -= MIN_GAP + Math.random()*(MAX_GAP - MIN_GAP);
      G_.platforms.push(makePlatform(cy));
    }

    function highestPlatformY(){
      let m = H; for (const p of G_.platforms) if (p.y < m) m = p.y; return m;
    }

    // ----- управление -----
    function onKey(e, down){ G_.keys[e.code] = down; }
    const kd = e => onKey(e, true), ku = e => onKey(e, false);
    addEventListener("keydown", kd); addEventListener("keyup", ku);

    function onTilt(e){ const g = e.gamma || 0; if (Math.abs(g) > 3) G_.tilt = Math.max(-1, Math.min(1, g/30)); }
    addEventListener("deviceorientation", onTilt);

    const pd = e => { e.preventDefault(); const r = c.getBoundingClientRect(); G_.pointerX = (e.clientX - r.left) * (W / r.width); };
    const pu = () => { G_.pointerX = null; };
    c.addEventListener("pointerdown", pd);
    c.addEventListener("pointermove", pd);
    addEventListener("pointerup", pu); addEventListener("pointercancel", pu);

    function clearInput(){
      removeEventListener("keydown", kd); removeEventListener("keyup", ku);
      removeEventListener("deviceorientation", onTilt);
      c.removeEventListener("pointerdown", pd); c.removeEventListener("pointermove", pd);
      removeEventListener("pointerup", pu); removeEventListener("pointercancel", pu);
    }

    (function loop(){
      if (G_.over) return;
      if (!size()){ G_.raf = requestAnimationFrame(loop); return; }
      const p = G_.player;

      // горизонталь: клавиши (по e.code) > палец > наклон, иначе плавное торможение
      if (G_.keys["ArrowLeft"] || G_.keys["KeyA"]) p.vx = -MOVE_SPEED;
      else if (G_.keys["ArrowRight"] || G_.keys["KeyD"]) p.vx = MOVE_SPEED;
      else if (G_.pointerX !== null) p.vx = Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, (G_.pointerX - p.x) * 0.6));
      else if (G_.tilt) p.vx = G_.tilt * MOVE_SPEED;
      else p.vx *= 0.75;

      p.x += p.vx;
      p.vy += GRAVITY;
      p.y += p.vy;

      // телепорт по краям
      if (p.x + p.width < 0) p.x = W;
      if (p.x > W) p.x = -p.width;

      // камера
      if (p.y < H/2){
        const diff = H/2 - p.y;
        p.y = H/2;
        G_.score += Math.round(diff);
        for (const pl of G_.platforms){
          pl.y += diff;
          if (pl.y > H){
            pl.y = highestPlatformY() - (MIN_GAP + Math.random()*(MAX_GAP - MIN_GAP));
            pl.x = Math.random()*(W - pl.width);
          }
        }
      }

      // приземление (только при падении)
      if (p.vy > 0){
        for (const pl of G_.platforms){
          if (p.x + p.width > pl.x && p.x < pl.x + pl.width &&
              p.y + p.height >= pl.y && p.y + p.height <= pl.y + pl.height + p.vy + 2){
            p.vy = JUMP_STRENGTH;
          }
        }
      }

      // поражение
      if (p.y > H){
        G_.over = true;
        G_.maxScore = Math.max(G_.maxScore, G_.score);
        endDoodle();
        return;
      }

      drawDoodle(x, G_, W, H);
      $("dScore").textContent = Math.floor(G_.score/10) + " м";
      G_.raf = requestAnimationFrame(loop);
    })();

    G = { get token(){ return G_.token }, set over(v){ G_.over = v }, get over(){ return G_.over },
          _g:G_, clearInput, authorizeTilt };
  }
  function authorizeTilt(){
    try {
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function")
        DeviceOrientationEvent.requestPermission().catch(()=>{});
    } catch(e){}
  }
  function drawDoodle(x, g, W, H){
    x.fillStyle = "#0b0820"; x.fillRect(0, 0, W, H);
    // платформы
    for (const pl of g.platforms){
      x.fillStyle = pl.color;
      roundRect(x, pl.x, pl.y, pl.width, pl.height, 6); x.fill();
    }
    // питомец
    const p = g.player;
    x.fillStyle = p.color;
    roundRect(x, p.x, p.y, p.width, p.height, 10); x.fill();
    // глазки
    x.fillStyle = "#fff";
    x.beginPath(); x.arc(p.x+12, p.y+13, 5, 0, 7); x.arc(p.x+28, p.y+13, 5, 0, 7); x.fill();
    x.fillStyle = "#111";
    x.beginPath(); x.arc(p.x+12, p.y+13, 2.5, 0, 7); x.arc(p.x+28, p.y+13, 2.5, 0, 7); x.fill();
  }
  function roundRect(x, rx, ry, w, h, r){
    x.beginPath();
    x.moveTo(rx+r, ry); x.arcTo(rx+w, ry, rx+w, ry+h, r);
    x.arcTo(rx+w, ry+h, rx, ry+h, r); x.arcTo(rx, ry+h, rx, ry, r);
    x.arcTo(rx, ry, rx+w, ry, r); x.closePath();
  }
  async function endDoodle(){
    try {
      const g = (G && G._g) ? G._g : null;
      const score = g ? g.score : 0;
      const d = await Api.call("doodle_finish", { token: g ? g.token : "", score });
      if (d){
        $("doodleEndText").textContent =
          `Высота: ${d.score} м · Награда: +${d.reward} 🪙${d.score > (GS.S.best_doodle||0) ? " · НОВЫЙ РЕКОРД!" : ""}`;
        GS.pending = d;
      } else $("doodleEndText").textContent = "Высота: " + score + " м";
      $("doodleEnd").classList.add("on");
    } catch(e){ console.error("[endDoodle]", e) }
  }
  function closeDoodle(){
    try {
      $("doodleOv").classList.remove("on");
      if (G && G.clearInput) G.clearInput();
      finishPending("happy");
    } catch(e){ console.error("[closeDoodle]", e) }
  }
  function exitDoodle(){
    if (G && G.over !== undefined) G.over = true;
    if (G && G.clearInput) G.clearInput();
    $("doodleOv").classList.remove("on");
    $("doodleEnd").classList.remove("on");
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

  /* ---------- Шахта Удачи (казино-слот) ----------
     Механика: в инвентаре 3×5 спавнятся кирки пяти рангов (дерево, камень,
     железо, золото, алмаз) и красные блокеры. В каждой колонке две одинаковые
     кирки сливаются в ранг выше, суммарный урон колонки копает блоки поля.
     Вся математика на сервере (mine_spin) — клиент только анимирует. */
  const MINE_MULT = {coal:.05, iron:.15, gold:.4, diam:.9};
  const MINE_BETS = [10,25,50,100,200];
  const MINE_DMG  = {w:1, s:2, i:3, g:4, d:5};
  const MINE_UP   = {w:"s", s:"i", i:"g", g:"d"};
  const MINE_TIER_WORD = {s:"", i:"ЖЕЛЕЗНАЯ КИРКА!", g:"ЗОЛОТАЯ КИРКА!", d:"АЛМАЗНАЯ КИРКА! 💎"};
  let MN = null;

  const mineCell = (c, r) => $("mBoard").children[r*5 + c];
  const mineSlot = (c, r) => $("mPicks").children[r*5 + c];
  const pickHTML = t => `<span class="pk t-${t}"></span><b class="dmg d-${t}">${MINE_DMG[t]}</b>`;
  const fmtM = v => "x" + (+v.toFixed(2)).toString();

  /* ---- мощные эффекты: луч, вспышка, тряска ---- */
  function mineBeam(el, color){
    if (!el) return;
    const b = document.createElement("i");
    b.className = "mBeam"; b.style.color = color;
    el.appendChild(b); setTimeout(() => b.remove(), 520);
  }
  function mineFlash(color){
    const f = $("mFlash"); if (!f) return;
    f.style.color = color; f.classList.remove("show");
    void f.offsetWidth; f.classList.add("show");
  }
  function mineShake(el){
    if (!el) return;
    el.classList.remove("mineShake"); void el.offsetWidth; el.classList.add("mineShake");
    setTimeout(() => el.classList.remove("mineShake"), 470);
  }

  function mineReset(){
    /* инвентарь 3×5, поле 5×5, запертые сундуки */
    $("mPicks").innerHTML = Array.from({length:15}, () =>
      `<div class="mSlot"></div>`).join("");
    $("mBoard").innerHTML = Array.from({length:25}, () =>
      `<div class="mCell hid">▦</div>`).join("");
    $("mChests").innerHTML = Array.from({length:5}, () =>
      `<div class="mChest"></div>`).join("");
    $("mMult").textContent = "\u00a0";
    $("mMult").className = "mineMult font-d";
  }

  function mineRenderCtl(){
    $("mCoins").textContent = (GS.S ? GS.S.coins : 0) + " 🪙";
    $("mBets").innerHTML = MINE_BETS.map(b =>
      `<button class="mBet ${b===MN.bet?'on':''}" data-b="${b}">${b}</button>`).join("");
    $("mBets").querySelectorAll(".mBet").forEach(el => el.onclick = () => {
      if (MN.busy) return;
      MN.bet = +el.dataset.b; Sfx.play("tap"); hap("light"); mineRenderCtl();
    });
    $("mSpin").disabled = !!MN.busy;
    const boosted = GS.S && GS.S.alchemy && GS.S.alchemy.boost_ready;
    $("mSpin").classList.toggle("boosted", !!boosted);
    $("mSpin").textContent = MN.busy ? "⛏ КОПАЕМ…"
      : (boosted ? "⚡ КОПАТЬ ×1.5 · " + MN.bet + " 🪙" : "⛏ КОПАТЬ · " + MN.bet + " 🪙");
  }

  function minePop(cell, text, cls){
    const el = document.createElement("b");
    el.className = "mPop " + (cls || "");
    el.textContent = text;
    cell.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* симуляция слияний колонки — тот же порядок, что на сервере:
     младший ранг первым, сливаются два верхних слота, результат — в верхнем */
  function mineSimMerges(colTokens){
    const slots = colTokens.map(t => MINE_DMG[t] ? t : null);
    const steps = [];
    let again = true;
    while (again){
      again = false;
      for (const t of "wsig"){
        const idx = [];
        slots.forEach((s, i) => { if (s === t) idx.push(i) });
        if (idx.length >= 2){
          const [a, b] = idx;
          slots[a] = MINE_UP[t]; slots[b] = null;
          steps.push({from:b, to:a, tier:MINE_UP[t]});
          again = true; break;
        }
      }
    }
    return {steps, slots};
  }

  /* ---- кирки и разрушение блоков ---- */
  const MINE_SHARD = {                       /* [цвет породы, цвет вкраплений] */
    dirt:["#9b6a3c","#7d5026"], stone:["#909298","#74767d"],
    coal:["#7a7b82","#4a4b52"], iron:["#8a8b92","#daa070"],
    gold:["#7a7b82","#ffd740"], diam:["#6a7b82","#4aeddb"],
  };
  const MINE_TIER_GLOW = {w:"#b07a3e", s:"#9fa1a8", i:"#e8e9ee", g:"#ffd76a", d:"#7deeec"};

  function mineSpawnAxe(c, tier, dmg){
    const cell = mineCell(c, 0); if (!cell) return;
    const axe = document.createElement("div");
    axe.className = "mAxe";
    axe.innerHTML = `<span class="pk t-${tier}">⛏</span><b class="dmg d-${tier}">${dmg}</b>`;
    $("mBoard").appendChild(axe);
    axe.style.transform =
      `translate(${cell.offsetLeft + 3}px, ${cell.offsetTop - cell.offsetHeight*1.1}px)`;
    if (MN) MN.axes[c] = axe;
  }
  function mineAxeMove(c, r){
    const axe = MN && MN.axes[c]; if (!axe) return;
    const cell = mineCell(c, r); if (!cell) return;
    axe.style.transform =
      `translate(${cell.offsetLeft + 3}px, ${cell.offsetTop - cell.offsetHeight*.42}px)`;
  }
  function mineAxeSwing(c){
    const axe = MN && MN.axes[c]; if (!axe) return;
    const sp = axe.firstChild;
    sp.classList.remove("swing"); void sp.offsetWidth; sp.classList.add("swing");
  }
  function mineAxeRemove(c){
    const axe = MN && MN.axes[c]; if (!axe) return;
    axe.classList.add("gone");
    setTimeout(() => axe.remove(), 300);
    delete MN.axes[c];
  }

  function mineShatter(cell, type){
    const [rock, spot] = MINE_SHARD[type] || MINE_SHARD.stone;
    const isOre = !!MINE_MULT[type];
    /* вспышка блока */
    cell.animate([
      {filter:"brightness(1) saturate(1)"},
      {filter:`brightness(2.5) saturate(1.8)${isOre ? ` drop-shadow(0 0 8px ${spot})` : ""}`},
      {filter:"brightness(1) saturate(1)"},
    ], {duration: isOre ? 300 : 160});
    /* ударное кольцо */
    const ring = document.createElement("i");
    ring.className = "mRing";
    ring.style.borderColor = isOre ? spot : "rgba(255,255,255,.85)";
    cell.appendChild(ring);
    setTimeout(() => ring.remove(), 450);
    /* осколки породы */
    const n = isOre ? 14 : 8;
    for (let i = 0; i < n; i++){
      const s = document.createElement("i");
      s.className = "mShard";
      s.style.background = (isOre && i % 3 === 0) ? spot : rock;
      s.style.width = (isOre ? 4 + Math.random()*4 : 5 + Math.random()*3) + "px";
      s.style.height = s.style.width;
      s.style.borderRadius = Math.random() > .5 ? "50%" : "1px";
      cell.appendChild(s);
      const a = Math.random()*Math.PI*2, dst = 14 + Math.random()*38;
      const dur = 400 + Math.random()*350;
      s.animate([
        {transform:"translate(-50%,-50%) rotate(0) scale(1)", opacity:1},
        {transform:`translate(${Math.cos(a)*dst}px, ${Math.sin(a)*dst - 14}px) rotate(${Math.random()*360-180}deg) scale(.3)`, opacity:0},
      ], {duration: dur, easing:"cubic-bezier(.2,.7,.3,1)"})
        .onfinish = () => s.remove();
    }
    /* пыль */
    for (let i = 0; i < 4; i++){
      const p = document.createElement("i");
      p.className = "mDust";
      if (isOre) p.style.background = spot;
      cell.appendChild(p);
      const dx = (Math.random()-.5)*30;
      p.animate([
        {transform:"translate(-50%,-50%)", opacity:.7},
        {transform:`translate(${dx}px, ${22 + Math.random()*28}px)`, opacity:0},
      ], {duration:550 + Math.random()*300, easing:"cubic-bezier(.4,0,.9,1)", delay: i*35})
        .onfinish = () => p.remove();
    }
    /* искры руды */
    if (isOre) mineSparks(cell, spot, type === "diam" ? 14 : type === "gold" ? 10 : 7);
    if (type === "gold"){ mineFlash("#ffd76a"); mineShake($("mBoard")) }
    if (type === "diam"){ mineFlash("#7deeec"); mineShake($("mBoard")) }
  }

  function mineSparks(el, color, n){
    for (let i = 0; i < n; i++){
      const s = document.createElement("i");
      s.className = "mSpark";
      const sz = 3 + Math.random()*3;
      s.style.width = sz + "px"; s.style.height = sz + "px";
      s.style.background = color;
      s.style.boxShadow = `0 0 ${4+sz}px ${color}, 0 0 ${8+sz*2}px ${color}`;
      el.appendChild(s);
      const a = Math.random()*Math.PI*2, dst = 20 + Math.random()*48;
      const dur = 500 + Math.random()*500;
      s.animate([
        {transform:"translate(-50%,-50%) scale(1.2)", opacity:1,
         filter:`drop-shadow(0 0 4px ${color})`},
        {transform:`translate(${Math.cos(a)*dst}px, ${Math.sin(a)*dst - 18}px) scale(.1)`, opacity:0,
         filter:"drop-shadow(0 0 0px transparent)"},
      ], {duration: dur, easing:"cubic-bezier(.12,.8,.3,1)", delay: Math.random()*80})
        .onfinish = () => s.remove();
    }
  }

  function mineWord(text, cls){
    if (!text) return;
    const old = document.querySelector(".mWord");
    if (old) old.remove();
    const w = document.createElement("div");
    w.className = "mWord font-d " + (cls || "");
    w.textContent = text;
    $("mineOv").appendChild(w);
    setTimeout(() => w.remove(), 1200);
  }

  /* анимация одного слияния в колонке */
  function mineMergeStep(c, step){
    const from = mineSlot(c, step.from), to = mineSlot(c, step.to);
    if (!from || !to) return;
    const box = $("mPicks");
    const fly = document.createElement("div");
    fly.className = "mFly";
    fly.innerHTML = from.innerHTML;
    box.appendChild(fly);
    fly.style.transform = `translate(${from.offsetLeft}px, ${from.offsetTop}px)`;
    from.innerHTML = ""; from.classList.remove("has");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fly.style.transform = `translate(${to.offsetLeft}px, ${to.offsetTop}px) scale(.6)`;
      fly.style.opacity = ".4";
    }));
    setTimeout(() => {
      fly.remove();
      to.innerHTML = pickHTML(step.tier);
      to.classList.add("has","merging");
      to.animate([{transform:"scale(1.45)",filter:"brightness(2)"},
                  {transform:"scale(1)",filter:"brightness(1)"}], {duration:240});
      mineSparks(to, MINE_TIER_GLOW[step.tier], step.tier === "d" ? 10 : 6);
      mineWord(MINE_TIER_WORD[step.tier], step.tier === "d" ? "diam" : "gold");
      Sfx.play(step.tier === "d" ? "sparkle" : "pop"); hap("light");
      if (step.tier === "g" || step.tier === "d"){
        mineBeam(to, step.tier === "d" ? "#7deeec" : "#ffd76a");
        mineFlash(step.tier === "d" ? "#7deeec" : "#ffd76a");
      }
    }, 300);
  }

  async function mineSpin(){
    if (!MN || MN.busy) return;
    const d = await Api.call("mine_spin", {bet: MN.bet});
    if (!d){ return }
    MN.busy = true; mineRenderCtl();
    Sfx.play("reel");
    mineReset();
    MN.axes = {};

    /* 1. поле проявляется */
    d.board.forEach((col, c) => col.forEach((t, r) => {
      const cell = mineCell(c, r);
      setTimeout(() => {
        cell.className = "mCell " + t;
        cell.textContent = "";
      }, 130*r + 65*c);
    }));

    /* 2. инвентарь крутится и оседает: кирки, блокеры, пустоты */
    const slots = [...$("mPicks").children];
    const tiers = "wsigd";
    const roll = setInterval(() => slots.forEach(s =>
      s.innerHTML = pickHTML(tiers[Math.random()*5|0])), 130);
    const T0 = 1200;
    slots.forEach((s, i) => setTimeout(() => {
      if (!MN || MN.over) return;
      const c = i % 5, r = (i / 5)|0;
      const t = d.grid[c][r];
      if (i === 0) clearInterval(roll);
      s.classList.add("set");
      if (MINE_DMG[t]){ s.innerHTML = pickHTML(t); s.classList.add("has") }
      else if (t === "x"){ s.innerHTML = `<i class="blk"></i>`; s.classList.add("blocked") }
      else s.innerHTML = "";
      Sfx.play("tick");
    }, T0 + i*80));
    const TSet = T0 + 15*80 + 180;

    /* 3. слияния по колонкам */
    let mergeEnd = TSet;
    const finals = [];                      /* сильнейшая кирка колонки */
    for (let c = 0; c < 5; c++){
      const sim = mineSimMerges(d.grid[c]);
      finals[c] = sim.slots.filter(Boolean)
        .sort((a,b) => MINE_DMG[b] - MINE_DMG[a])[0] || null;
      sim.steps.forEach((st, k) => {
        const at = TSet + c*200 + k*500;
        setTimeout(() => { if (MN && !MN.over) mineMergeStep(c, st) }, at);
        mergeEnd = Math.max(mergeEnd, at + 500);
      });
    }

    /* 4. кирки падают и разбивают блоки */
    let mult = 0, oreCount = 0;
    const STRIKE = 400, T1 = mergeEnd + 520;
    let tEnd = T1;
    for (let c = 0; c < 5; c++){
      const digs = d.digs[c];
      if (!digs || !finals[c]) { continue }
      const base = T1 + c*320;
      setTimeout(() => { if (MN && !MN.over) mineSpawnAxe(c, finals[c], d.digs[c]) }, base - 220);
      for (let r = 0; r < digs; r++){
        const at = base + r*STRIKE;
        setTimeout(() => { if (MN && !MN.over) mineAxeMove(c, r) }, at - 200);
        setTimeout(() => { if (MN && !MN.over) mineAxeSwing(c) }, at - 90);
        setTimeout(() => {
          if (!MN || MN.over) return;
          const type = d.board[c][r], cell = mineCell(c, r);
          mineShatter(cell, type);
          cell.classList.add("mined");
          if (MINE_MULT[type]){
            oreCount++;
            mult += MINE_MULT[type];
            minePop(cell, "+" + fmtM(MINE_MULT[type]), "ore");
            $("mMult").textContent = fmtM(mult);
            Sfx.play("coin"); hap("light");
            if (type === "gold") mineWord("ЗОЛОТО!", "gold");
            if (type === "diam"){
              mineWord("АЛМАЗ! 💎", "diam");
              $("mBoard").classList.add("quake");
              setTimeout(() => $("mBoard").classList.remove("quake"), 320);
              hap("medium");
            }
          } else Sfx.play("hit");
        }, at);
      }
      const done = base + digs*STRIKE;
      setTimeout(() => { if (MN && !MN.over) mineAxeRemove(c) }, done + 80);
      if (d.chests[c]) setTimeout(() => {
        if (!MN || MN.over) return;
        const ch = $("mChests").children[c];
        ch.textContent = ""; ch.classList.add("open");
        minePop(ch, "+x0.5", "ore");
        mineSparks(ch, "#ffe27a", 10);
        mineWord("СУНДУК! +x0.5", "gold");
        mult += .5;
        $("mMult").textContent = fmtM(mult);
        Sfx.play("sparkle"); hap("medium");
      }, done + 180);
      tEnd = Math.max(tEnd, done + (d.chests[c] ? 620 : 280));
    }

    /* жила: много руды за спин */
    setTimeout(() => {
      if (MN && !MN.over && oreCount >= 4) mineWord("РУДНАЯ ЖИЛА! ⛏", "diam");
    }, tEnd + 100);

    /* 5. итог */
    setTimeout(() => {
      if (!MN || MN.over) return;
      GS.set("S", d); UI.render();
      const m = $("mMult");
      if (d.payout > 0){
        m.textContent = "ВЫИГРЫШ " + d.payout + " 🪙 (x" + d.mult + ")";
        m.className = "mineMult font-d win";
        if (d.payout >= d.bet*3){
          mineWord("КУШ! 🤑", "win");
          UI.confetti();
          Sfx.play("fanfare");
          mineFlash("#ffd76a");
          mineShake($("mineOv").querySelector(".mineWrap"));
        } else { Sfx.play("win"); mineFlash("#8dffb0") }
        hap("ok");
      } else {
        m.textContent = "Пусто… порода 🪨";
        m.className = "mineMult font-d lose";
        Sfx.play("bad");
      }
      MN.busy = false; mineRenderCtl(); mineTalRefreshBadge();
    }, tEnd + 500);
  }

  function showMineTut(firstTime){
    $("mineTut").classList.add("show");
    $("mineTutBtn").onclick = () => {
      Prefs.data.mineTutSeen = true;
      Prefs.save();
      $("mineTut").classList.remove("show");
      if (firstTime) launchMine();
    };
  }
  function openMineTut(){ showMineTut(false); }
  function startMine(){
    try {
      if (!Prefs.data.mineTutSeen){ showMineTut(true); return; }
      launchMine();
    } catch(e){ console.error("[startMine]", e) }
  }
  function launchMine(){
    MN = {bet: 25, busy: false, over: false, axes: {}};
    $("mineOv").classList.add("on");
    mineReset(); mineRenderCtl(); mineTalRefreshBadge();
    $("mSpin").onclick = mineSpin;
  }
  function exitMine(){
    if (MN) MN.over = true;
    MN = null;
    $("mineOv").classList.remove("on");
    UI.render();
  }

  function bind(){
    document.querySelectorAll(".pad").forEach(p=>p.onclick = ()=>padTap(+p.dataset.i));
  }

  /* ---------- АЛХИМИК (2048-merge) ---------- */
  const ALC_SIZE = 4, ALC_PAD = 10, ALC_GAP = 8;
  const ALC_RANK_COLORS = ["#7a4f24","#8a5a2a","#6e727a","#8b8f98","#b3b7c0",
    "#f08a1e","#f6b21a","#ffd76a","#33c7b8","#4ad9cb","#a06bff"];
  let AL = null;
  function hasMove(b){
    for (let r=0;r<ALC_SIZE;r++) for (let c=0;c<ALC_SIZE;c++){
      const v = b[r] && b[r][c]; if (!v) return true;
      if (c+1<ALC_SIZE && b[r][c+1]===v) return true;
      if (r+1<ALC_SIZE && b[r+1][c]===v) return true;
    }
    return false;
  }
  function alcSym(st, r){ return (st.syms && st.syms[r-1]) || ""; }
  // геометрия слоя плиток
  function alcCellSize(){
    const inner = $("alcTiles").clientWidth || 300;
    return (inner - ALC_GAP*(ALC_SIZE-1)) / ALC_SIZE;
  }
  function alcXY(r, c, sz){ return { x: c*(sz+ALC_GAP), y: r*(sz+ALC_GAP) }; }
  // симуляция хода на клиенте: движения плиток + итоговая доска (для анимации)
  function alcSim(board, dir){
    const n = ALC_SIZE, cols = (dir==="left"||dir==="right"), rev = (dir==="right"||dir==="down");
    const nb = Array.from({length:n}, ()=>Array(n).fill(0));
    const moves = [], merges = [];
    for (let i=0;i<n;i++){
      let line = [];
      for (let k=0;k<n;k++){
        const r = cols? i : k, c = cols? k : i;
        line.push({v: board[r][c], r, c});
      }
      if (rev) line.reverse();
      const nums = line.filter(x=>x.v);
      const out = [];
      let j = 0;
      while (j < nums.length){
        if (j+1 < nums.length && nums[j].v === nums[j+1].v){
          out.push({v: nums[j].v+1, src:[nums[j], nums[j+1]], merged:true}); j += 2;
        } else { out.push({v: nums[j].v, src:[nums[j]], merged:false}); j++; }
      }
      for (let idx=0; idx<out.length; idx++){
        const realIdx = rev ? (n-1-idx) : idx;
        const r = cols? i : realIdx, c = cols? realIdx : i;
        nb[r][c] = out[idx].v;
        out[idx].src.forEach(s => moves.push({fromR:s.r, fromC:s.c, toR:r, toC:c, v:s.v}));
        if (out[idx].merged) merges.push([r,c]);
      }
    }
    const moved = JSON.stringify(nb) !== JSON.stringify(board);
    return { nb, moves, merges, moved };
  }
  // построить одну плитку (внешний слой = позиция, внутренний = визуал)
  function alcMakeTile(st, v, sz){
    const wrap = document.createElement("div");
    wrap.className = "aTile";
    wrap.style.width = wrap.style.height = sz + "px";
    const cell = document.createElement("div");
    cell.className = "aCell r" + v + (v>=st.tal_rank ? " rare" : "");
    cell.innerHTML = `<span class="aSym">${alcSym(st,v)}</span><span class="aNum">${v}</span>`;
    wrap.appendChild(cell);
    return wrap;
  }
  function alcRender(){
    const st = GS.S && GS.S.alchemy; if (!st) return;
    $("alcMoves").textContent = st.locked ? "🔒" : (st.moves || 0);
    $("alcBest").textContent = st.best;
    $("alcStreak").textContent = st.streak;
    $("alcCoins").textContent = (GS.S.coins||0) + " 🪙";
    $("alcCap").textContent = st.day_coins + "/" + st.daily_cap;
    $("alcGoalR").textContent = st.tal_rank;
    // фоновые слоты (один раз)
    const grid = $("alcGrid");
    if (grid.children.length !== ALC_SIZE*ALC_SIZE)
      grid.innerHTML = Array.from({length:ALC_SIZE*ALC_SIZE},
        () => '<div class="aCellBg"></div>').join("");
    alcRenderTiles(AL && AL.fx);
    $("alcLock").classList.toggle("on", !!st.locked);
    $("alchemyOv").classList.toggle("locked", !!st.locked);
    alcGallery(); alcTalismans();
    const b = (AL && AL.board) || st.board || [];
    $("alcNewGame").style.display = (!st.locked && !hasMove(b)) ? "block" : "none";
    // прогресс-бар цели «до ранга tal_rank»
    let maxR = 0;
    for (let r=0;r<ALC_SIZE;r++) for (let c=0;c<ALC_SIZE;c++){ const v=(b[r]&&b[r][c])||0; if (v>maxR) maxR=v; }
    (st.items||[]).forEach(r => { if (r>maxR) maxR=r; });
    const pct = Math.min(100, Math.round(maxR / st.tal_rank * 100));
    const fill = $("alcGoalFill"); if (fill) fill.style.width = pct + "%";
  }
  // статичная отрисовка плиток по AL.board (+ эффекты pop/merge)
  function alcRenderTiles(fx){
    const st = GS.S && GS.S.alchemy; if (!st) return;
    const layer = $("alcTiles"); layer.innerHTML = "";
    const b = (AL && AL.board) || st.board || [];
    const sz = alcCellSize();
    const merged = (fx && fx.merges) || [], spawned = (fx && fx.spawned);
    for (let r=0;r<ALC_SIZE;r++) for (let c=0;c<ALC_SIZE;c++){
      const v = (b[r] && b[r][c]) || 0; if (!v) continue;
      const t = alcMakeTile(st, v, sz);
      const {x,y} = alcXY(r,c,sz);
      t.style.transform = `translate(${x}px,${y}px)`;
      layer.appendChild(t);
      const inner = t.firstChild;
      if (spawned && spawned[0]===r && spawned[1]===c){
        inner.classList.add("pop"); setTimeout(()=>inner.classList.remove("pop"),340);
      }
      if (merged.some(m=>m[0]===r && m[1]===c)){
        inner.classList.add("merge"); setTimeout(()=>inner.classList.remove("merge"),440);
        alcMergeFx(r, c, v, sz);
      }
    }
    if (merged.length){
      const sm = $("alcSmoke"); if (sm){ sm.classList.remove("puff"); void sm.offsetWidth; sm.classList.add("puff"); }
    }
  }
  // искры в точке слияния
  function alcMergeFx(r, c, v, sz){
    const layer = $("alcTiles"); if (!layer) return;
    const {x,y} = alcXY(r,c,sz);
    const cx = x + sz/2, cy = y + sz/2;
    const col = ALC_RANK_COLORS[Math.min(v, ALC_RANK_COLORS.length)-1] || "#ffd76a";
    const n = v >= 9 ? 9 : 6;
    for (let i=0;i<n;i++){
      const sp = document.createElement("div");
      sp.className = "alcSpark";
      const ang = Math.random()*Math.PI*2, dist = sz*(0.35 + Math.random()*0.4);
      sp.style.left = cx + "px"; sp.style.top = cy + "px";
      sp.style.color = col;
      sp.style.setProperty("--dx", Math.cos(ang)*dist + "px");
      sp.style.setProperty("--dy", Math.sin(ang)*dist + "px");
      layer.appendChild(sp);
      setTimeout(()=>sp.remove(), 540);
    }
  }
  // анимация скольжения: рисуем плитки на старых местах и едем в новые
  function alcAnimateSlide(sim){
    const st = GS.S && GS.S.alchemy; if (!st) return;
    const layer = $("alcTiles"); layer.innerHTML = "";
    const sz = alcCellSize();
    const tiles = sim.moves.map(m => {
      const t = alcMakeTile(st, m.v, sz);
      const p0 = alcXY(m.fromR, m.fromC, sz);
      t.style.transform = `translate(${p0.x}px,${p0.y}px)`;
      layer.appendChild(t);
      return {t, m};
    });
    void layer.offsetHeight; // reflow — зафиксировать стартовые позиции
    requestAnimationFrame(() => {
      tiles.forEach(({t,m}) => {
        const p1 = alcXY(m.toR, m.toC, sz);
        t.style.transform = `translate(${p1.x}px,${p1.y}px)`;
      });
    });
  }
  function alcGallery(){
    const st = GS.S.alchemy, g = $("alcGallery");
    g.innerHTML = st.ranks.map((nm,i) => {
      const r = i+1, got = st.items.includes(r), rare = r >= st.tal_rank;
      return `<div class="aGal ${got?'got':''} ${rare?'rare':''} ${r>=10?'leg':''}">
        <span class="aGalS">${got?alcSym(st,r):"?"}</span>
        <span class="aGalT">${got?nm:"???"}</span></div>`;
    }).join("");
  }
  function alcTalismans(){
    const st = GS.S.alchemy, t = $("alcTalismans");
    if (!st.talismans.length){
      t.innerHTML = `<small class="alcEmpty">Слей эссенции до ранга ${st.tal_rank} ⚗️ — выплавишь талисман. Применить его можно в Шахте.</small>`;
      return;
    }
    t.innerHTML = st.talismans.map(x => {
      const nm = st.ranks[x.rank-1];
      return `<div class="aTal"><span>${alcSym(st,x.rank)} ${nm}</span>
        <span class="aTalTtl">⏳ ${fmtLeft(x.left)}</span></div>`;
    }).join("") + `<small class="alcEmpty">Активируй талисман в Шахте кнопкой 🔮 — копка даст ×${st.boost} 🪙</small>`;
  }
  function fmtLeft(sec){
    sec = Math.max(0, sec|0);
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    return h > 0 ? h+"ч "+m+"м" : m+"м";
  }
  function alcSleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  async function alcMove(dir){
    if (!AL || AL.busy) return;
    const st = GS.S.alchemy;
    if (st.locked){
      UI.toast("🔒 Талисман дня добыт — приходи завтра!"); Sfx.play("err"); hap("bad"); return;
    }
    if (dir === "new"){          // рестарт проигранной доски
      AL.busy = true;
      const d = await Api.call("alchemy_move",{move:"new"});
      AL.busy = false;
      if (!d) return;
      GS.set("S", d); AL.board = alcCloneBoard(GS.S.alchemy.board); AL.fx = null;
      alcRender(); Sfx.play("tap"); hap("light");
      return;
    }
    // локальная симуляция для анимации
    const sim = alcSim(AL.board, dir);
    if (!sim.moved){ Sfx.play("err"); hap("bad"); alcNudge(dir); return; }
    AL.busy = true;
    $("alcSwipeHint").classList.add("hide");
    Sfx.play("tap"); hap("light");
    alcAnimateSlide(sim);
    if (sim.merges.length) setTimeout(()=>Sfx.play("merge"), 120);
    // ход на сервере (источник правды) + ждём завершения анимации
    const [d] = await Promise.all([ Api.call("alchemy_move",{move:dir}), alcSleep(160) ]);
    AL.busy = false;
    if (!d){ alcRenderTiles(); return; }
    if (d.blocked){ GS.set("S", d); AL.board = alcCloneBoard(GS.S.alchemy.board); alcRenderTiles(); return; }
    GS.set("S", d);
    AL.board = alcCloneBoard(GS.S.alchemy.board);
    AL.fx = { merges: d.merges || [], spawned: d.spawned };
    alcRender();
    if ((d.merges||[]).some(m => { const cur = GS.S.alchemy.board[m[0]][m[1]]; return cur >= 9; })){
      Sfx.play("sparkle"); hap("medium");
    }
    if (d.new_item){
      UI.confetti(); Sfx.play("fanfare"); hap("ok");
      UI.notify("⚗️", "Талисман выплавлен: " + GS.S.alchemy.ranks[d.new_item-1] + "! Примени его в Шахте 🔮");
    }
  }
  function alcCloneBoard(b){ return (b||[]).map(row=>row.slice()); }
  // лёгкий «толчок» доски при заблокированном направлении
  function alcNudge(dir){
    const el = $("alcTiles");
    const d = {left:"-6px,0",right:"6px,0",up:"0,-6px",down:"0,6px"}[dir] || "0,0";
    el.style.transition = "transform .08s";
    el.style.transform = `translate(${d})`;
    setTimeout(()=>{ el.style.transform = "translate(0,0)";
      setTimeout(()=>{ el.style.transition=""; el.style.transform=""; },90); }, 90);
  }
  function alcBind(){
    if (AL && AL.sw) return;
    const board = $("alcBoard");
    let sx=0, sy=0, trk=false;
    const start = e => { const p = e.touches? e.touches[0] : e;
      sx=p.clientX; sy=p.clientY; trk=true; };
    const end = e => {
      if (!trk) return; trk=false;
      const p = e.changedTouches? e.changedTouches[0] : e;
      const dx=p.clientX-sx, dy=p.clientY-sy;
      if (Math.max(Math.abs(dx),Math.abs(dy)) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) alcMove(dx>0?"right":"left");
      else alcMove(dy>0?"down":"up");
    };
    board.addEventListener("pointerdown", start);
    board.addEventListener("pointerup", end);
    board.addEventListener("touchstart", start, {passive:true});
    board.addEventListener("touchend", end, {passive:true});
    // фолбэк: гасим скролл/жест «свернуть» пока палец на доске
    board.addEventListener("touchmove", e => { if (trk) e.preventDefault(); }, {passive:false});
    $("alcNewGame").onclick = ()=>alcMove("new");
    if (AL) AL.sw = true;
  }
  function showAlcTut(firstTime){
    $("alcTut").classList.add("show");
    $("alcTutBtn").onclick = () => {
      Prefs.data.alcTutSeen = true;
      Prefs.save();
      $("alcTut").classList.remove("show");
      if (firstTime) launchAlchemy();
    };
  }
  function openAlcTut(){ showAlcTut(false); }
  function startAlchemy(){
    try {
      if (!Prefs.data.alcTutSeen){ showAlcTut(true); return; }
      launchAlchemy();
    } catch(e){ console.error("[startAlchemy]", e) }
  }
  function launchAlchemy(){
    try {
      AL = {busy:false, sw:false, board:null, fx:null};
      $("alchemyOv").classList.add("on");
      AL.board = alcCloneBoard(GS.S && GS.S.alchemy && GS.S.alchemy.board);
      alcRender(); alcBind();
      // геометрия становится валидной после показа — перерисуем плитки
      requestAnimationFrame(()=>alcRenderTiles());
    } catch(e){ console.error("[launchAlchemy]", e) }
  }
  function exitAlchemy(){
    AL = null; $("alchemyOv").classList.remove("on"); UI.render();
  }

  /* ---------- ТАЛИСМАНЫ В ШАХТЕ ---------- */
  function mineTalCount(){
    const st = GS.S && GS.S.alchemy;
    return st && st.talismans ? st.talismans.length : 0;
  }
  function mineTalRefreshBadge(){
    const b = $("mineTalBadge"), n = mineTalCount();
    if (!b) return;
    b.textContent = n;
    b.parentElement.classList.toggle("has", n>0);
  }
  function openMineTal(){
    mineTalRender();
    $("mineTalOv").classList.add("show");
  }
  function closeMineTal(){ $("mineTalOv").classList.remove("show"); }
  function mineTalRender(){
    const st = GS.S && GS.S.alchemy, list = $("mineTalList");
    if (!st){ list.innerHTML = ""; return; }
    if (st.boost_ready){
      list.innerHTML = `<div class="mineTalActive">⚡ Буст ×${st.boost} активен!<br>Копай — следующая выплата умножится.</div>`;
      return;
    }
    if (!st.talismans.length){
      list.innerHTML = `<small class="alcEmpty">Пусто. Выплавь талисман в Алхимике ⚗️ (доведи эссенцию до ранга ${st.tal_rank}).</small>`;
      return;
    }
    list.innerHTML = st.talismans.map(x => {
      const nm = st.ranks[x.rank-1], sym = (st.syms&&st.syms[x.rank-1])||"";
      return `<div class="aTal"><span>${sym} ${nm} <small class="aTalTtl">⏳ ${fmtLeft(x.left)}</small></span>
        <button data-tal="${x.idx}">Буст ×${st.boost}</button></div>`;
    }).join("");
    list.querySelectorAll("[data-tal]").forEach(btn => btn.onclick = async () => {
      const d = await Api.call("alchemy_boost",{idx:+btn.dataset.tal});
      if (!d) return;
      GS.set("S", d); mineTalRender(); mineTalRefreshBadge();
      if (typeof mineRenderCtl === "function") mineRenderCtl();
      Sfx.play("sparkle"); hap("ok");
      UI.toast("⚡ Буст ×"+GS.S.alchemy.boost+" готов — копай!", true);
      setTimeout(closeMineTal, 700);
    });
  }

  return { bind, startCatch, closeCatch, exitCatch, startSimon, closeSimon, exitSimon, runCatch,
           startFishing, closeFishing, exitFishing,
           startDoodle, closeDoodle, exitDoodle,
           startMine, exitMine, openMineTut,
           openMineTal, closeMineTal,
           startAlchemy, exitAlchemy, openAlcTut,
           get G(){ return G } };
})();