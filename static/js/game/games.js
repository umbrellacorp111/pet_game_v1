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

    function spawn(){
      const bad = Math.random() < .22;
      const [e,v] = bad ? ["💣",-5] : GOOD[Math.random()*GOOD.length|0];
      G.items.push({e, v, x:20+Math.random()*(W-40), y:-30,
        vy:(1.6+Math.random()*1.6)*(1+(performance.now()-G.t0)/G.dur), r:24});
    }
    c.onpointerdown = ev => {
      if (!G || G.over) return;
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
    };
    (function loop(){
      if (!G || G.over) return;
      if (!resizeCanvas()){ requestAnimationFrame(loop); return }
      const el = performance.now()-G.t0;
      if (el-lastSpawn > Math.max(280, 700-el/60)){ spawn(); lastSpawn = el }
      $("gTimerFill").style.width = Math.max(0, 100-100*el/G.dur)+"%";
      x.clearRect(0,0,W,H);
      x.font = "34px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
      x.textAlign = "center"; x.textBaseline = "middle";
      G.items = G.items.filter(it => { it.y += it.vy*2; x.fillText(it.e, it.x, it.y); return it.y < H+40 });
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
           get G(){ return G } };
})();
