/* games.js — две мини-игры. Зависит от app.js (api, S, afterAction, звук, хаптика). */

/* ---------- ИГРА 1: Лови еду ---------- */
const GOOD = [["🍔",2],["🍕",3],["🍿",1],["🎂",4],["⭐",5]];
let G = null;

async function startCatch(){
  const d = await api("game_start"); if(!d) return;
  S = d; render();
  const token = d.token;
  const ov = $("catchOv");
  ov.classList.add("on"); $("catchEnd").classList.remove("on");
  const c = $("gCanvas"), x = c.getContext("2d");
  c.width = c.clientWidth * devicePixelRatio;
  c.height = c.clientHeight * devicePixelRatio;
  x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  const W = c.clientWidth, H = c.clientHeight;
  G = {token, score:0, t0:performance.now(), dur:30000, items:[], pops:[], over:false};
  $("gScore").textContent = "0";
  let lastSpawn = 0;

  function spawn(){
    const bad = Math.random() < .22;
    const [e,v] = bad ? ["💣",-5] : GOOD[Math.random()*GOOD.length|0];
    G.items.push({e, v, x:20+Math.random()*(W-40), y:-30,
      vy:(1.6+Math.random()*1.6)*(1+(performance.now()-G.t0)/G.dur), r:24});
  }
  c.onpointerdown = ev => {
    if (G.over) return;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX-rect.left, py = ev.clientY-rect.top;
    for (let i=G.items.length-1; i>=0; i--){
      const it = G.items[i];
      if (Math.hypot(px-it.x, py-it.y) < it.r+16){
        G.score = Math.max(0, G.score+it.v);
        $("gScore").textContent = G.score;
        G.pops.push({x:it.x, y:it.y, t:1, txt:(it.v>0?"+":"")+it.v, bad:it.v<0});
        it.v<0 ? (sBad(), hap("bad")) : (sCoin(), hap("light"));
        G.items.splice(i,1); break;
      }
    }
  };
  (function loop(){
    if (!G || G.over) return;
    const el = performance.now()-G.t0;
    if (el-lastSpawn > Math.max(280, 700-el/60)){ spawn(); lastSpawn = el }
    $("gTimerFill").style.width = Math.max(0, 100-100*el/G.dur)+"%";
    x.clearRect(0,0,W,H);
    x.font = "34px serif"; x.textAlign = "center"; x.textBaseline = "middle";
    G.items = G.items.filter(it => { it.y += it.vy*2; x.fillText(it.e, it.x, it.y); return it.y < H+40 });
    x.font = "800 18px Manrope";
    G.pops = G.pops.filter(p => { p.t -= .03; p.y -= 1.5;
      x.fillStyle = p.bad ? `rgba(255,107,139,${p.t})` : `rgba(255,201,60,${p.t})`;
      x.fillText(p.txt, p.x, p.y); return p.t > 0 });
    if (el >= G.dur){ endCatch(); return }
    requestAnimationFrame(loop);
  })();
}
async function endCatch(){
  G.over = true;
  const d = await api("game_finish", {token:G.token, score:G.score});
  if (d){
    $("catchEndText").textContent =
      `Очки: ${d.score} · Награда: +${d.reward} 🪙${d.score>S.best_score?" · НОВЫЙ РЕКОРД!":""}`;
    window._pending = d;
  } else $("catchEndText").textContent = "Очки: "+G.score;
  $("catchEnd").classList.add("on");
}
function closeCatch(){
  $("catchOv").classList.remove("on");
  if (window._pending){ const d = window._pending; window._pending = null;
    flyCoin($("petMount"),4); sWin(); afterAction(d) } else render();
}

/* ---------- ИГРА 2: Ритм (Simon) ---------- */
/* Сервер присылает последовательность из 12 шагов. Показываем по одному
   шагу за раунд, игрок повторяет; ошибка или конец = отправка reached. */
const PAD_FREQ = [392, 523, 659, 784];
let SM = null;

async function startSimon(){
  const d = await api("simon_start"); if(!d) return;
  S = d; render();
  SM = {seq:d.seq, round:1, input:0, lock:true, over:false};
  $("simonOv").classList.add("on"); $("simonEnd").classList.remove("on");
  $("simonScore").textContent = "0";
  setTimeout(playRound, 700);
}
function padFlash(i, dur=320){
  const p = document.querySelector(`.pad[data-i="${i}"]`);
  p.classList.add("lit"); snd(PAD_FREQ[i], PAD_FREQ[i], dur/1000, "triangle", .2);
  setTimeout(()=>p.classList.remove("lit"), dur);
}
function playRound(){
  if (!SM || SM.over) return;
  SM.lock = true; SM.input = 0;
  $("simonMsg").textContent = "Смотри и запоминай…";
  document.querySelectorAll(".pad").forEach(p=>p.disabled = true);
  const show = SM.seq.slice(0, SM.round);
  show.forEach((v,i)=>setTimeout(()=>padFlash(v), 500+i*520));
  setTimeout(()=>{
    SM.lock = false;
    $("simonMsg").textContent = "Твоя очередь!";
    document.querySelectorAll(".pad").forEach(p=>p.disabled = false);
  }, 500 + show.length*520 + 150);
}
function padTap(i){
  if (!SM || SM.lock || SM.over) return;
  padFlash(i, 200); hap("light");
  if (i === SM.seq[SM.input]){
    SM.input++;
    if (SM.input >= SM.round){           // раунд повторён
      $("simonScore").textContent = SM.round;
      if (SM.round >= SM.seq.length){ finishSimon(SM.round); return } // прошёл всё!
      SM.round++;
      $("simonMsg").textContent = "Верно! 🎉";
      sCoin();
      setTimeout(playRound, 900);
      SM.lock = true;
    }
  } else {                               // ошибка
    sBad(); hap("bad");
    finishSimon(SM.round - 1);
  }
}
async function finishSimon(reached){
  SM.over = true;
  document.querySelectorAll(".pad").forEach(p=>p.disabled = true);
  const d = await api("simon_finish", {reached});
  if (d){
    const full = reached >= S.simon_len;
    $("simonEndText").textContent =
      `Повторено шагов: ${d.reached} · Награда: +${d.reward} 🪙` +
      (full ? " · ПОЛНОЕ ПРОХОЖДЕНИЕ! 🏆" : d.reached > S.best_simon ? " · НОВЫЙ РЕКОРД!" : "");
    window._pending = d;
  } else $("simonEndText").textContent = "Повторено шагов: " + reached;
  $("simonEnd").classList.add("on");
}
function closeSimon(){
  $("simonOv").classList.remove("on");
  if (window._pending){ const d = window._pending; window._pending = null;
    flyCoin($("petMount"),4); sWin(); afterAction(d) } else render();
}
document.querySelectorAll(".pad").forEach(p=>p.onclick = ()=>padTap(+p.dataset.i));

/* ---------- v5: АРЕНА (бой поверх «Лови еду») ---------- */
let BT = null; // battle token + данные

async function startBattle(){
  const d = await api("battle_start"); if(!d) return;
  S = d; render();
  BT = {token: d.token, opp: d.opponent};
  $("vsMe").textContent = S.pet_name;
  $("vsMeSub").textContent = `ур. ${S.level} · ${S.league.emoji} ${S.league.name}`;
  $("vsOpp").textContent = d.opponent.pet_name;
  $("vsOppSub").textContent = `ур. ${d.opponent.level} · ${d.opponent.league_emoji} ${d.opponent.league}`;
  $("vsOppPet").textContent = d.opponent.equipped.hat ? "🐾" : "🐾";
  $("vsBonus").innerHTML = d.my_bonus > 0
    ? `Твой питомец ухожен: <b style="color:var(--mint)">+${d.my_bonus}% к очкам</b>`
    : `Уход даёт бонус к очкам — корми и мой питомца!`;
  hap("medium"); snd(200,400,.3,"sawtooth",.12);
  $("vsOv").classList.add("show");
}

function beginBattleRound(){
  $("vsOv").classList.remove("show");
  runBattleCatch();
}

/* тот же движок «Лови еду», но результат уходит в battle_finish */
function runBattleCatch(){
  const ov = $("catchOv");
  ov.classList.add("on"); $("catchEnd").classList.remove("on");
  const c = $("gCanvas"), x = c.getContext("2d");
  c.width = c.clientWidth * devicePixelRatio;
  c.height = c.clientHeight * devicePixelRatio;
  x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  const W = c.clientWidth, H = c.clientHeight;
  G = {token: BT.token, score:0, t0:performance.now(), dur:30000,
       items:[], pops:[], over:false, battle:true};
  $("gScore").textContent = "0";
  let lastSpawn = 0;
  function spawn(){
    const bad = Math.random() < .22;
    const [e,v] = bad ? ["💣",-5] : GOOD[Math.random()*GOOD.length|0];
    G.items.push({e, v, x:20+Math.random()*(W-40), y:-30,
      vy:(1.6+Math.random()*1.6)*(1+(performance.now()-G.t0)/G.dur), r:24});
  }
  c.onpointerdown = ev => {
    if (G.over) return;
    const rect = c.getBoundingClientRect();
    const px = ev.clientX-rect.left, py = ev.clientY-rect.top;
    for (let i=G.items.length-1; i>=0; i--){
      const it = G.items[i];
      if (Math.hypot(px-it.x, py-it.y) < it.r+16){
        G.score = Math.max(0, G.score+it.v);
        $("gScore").textContent = G.score;
        G.pops.push({x:it.x, y:it.y, t:1, txt:(it.v>0?"+":"")+it.v, bad:it.v<0});
        it.v<0 ? (sBad(), hap("bad")) : (sCoin(), hap("light"));
        G.items.splice(i,1); break;
      }
    }
  };
  (function loop(){
    if (!G || G.over) return;
    const el = performance.now()-G.t0;
    if (el-lastSpawn > Math.max(280, 700-el/60)){ spawn(); lastSpawn = el }
    $("gTimerFill").style.width = Math.max(0, 100-100*el/G.dur)+"%";
    x.clearRect(0,0,W,H);
    x.font = "34px serif"; x.textAlign = "center"; x.textBaseline = "middle";
    G.items = G.items.filter(it => { it.y += it.vy*2; x.fillText(it.e, it.x, it.y); return it.y < H+40 });
    x.font = "800 18px Manrope";
    G.pops = G.pops.filter(p => { p.t -= .03; p.y -= 1.5;
      x.fillStyle = p.bad ? `rgba(255,107,139,${p.t})` : `rgba(255,201,60,${p.t})`;
      x.fillText(p.txt, p.x, p.y); return p.t > 0 });
    if (el >= G.dur){ endBattleCatch(); return }
    requestAnimationFrame(loop);
  })();
}

async function endBattleCatch(){
  G.over = true;
  $("catchOv").classList.remove("on");
  const d = await api("battle_finish", {token:G.token, score:G.score});
  if (!d){ render(); return }
  const win = d.result === "win", draw = d.result === "draw";
  $("beIcon").textContent = win ? "🏆" : draw ? "🤝" : "💔";
  $("beTitle").textContent = win ? "ПОБЕДА!" : draw ? "НИЧЬЯ" : "Поражение";
  $("beTitle").className = "font-d " + (win ? "beWin" : draw ? "" : "beLose");
  $("beText").innerHTML =
    `Ты: <b>${d.my_final}</b> (${d.my_raw}${d.my_final>d.my_raw?" +уход":""}) · Соперник: <b>${d.opp_score}</b><br>` +
    `${d.d_trophy>=0?"+":""}${d.d_trophy} 🏆 · +${d.d_tokens} 🎟 · +${d.xp_gain} XP`;
  window._pending = d;
  if (win){ confetti(); sWin(); hap("ok") } else { sBad(); hap("bad") }
  $("battleEnd").classList.add("show");
}
function closeBattle(){
  $("battleEnd").classList.remove("show");
  BT = null;
  if (window._pending){ const d = window._pending; window._pending = null; afterAction(d) }
  else render();
}
