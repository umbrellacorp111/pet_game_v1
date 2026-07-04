/* game/arena.js — PvP-арена. Контракты прежние:
   battle_start → battle_finish{token,score}. */
window.Arena = (() => {
  let BT = null;

  async function start(){
    const d = await Api.call("battle_start"); if(!d) return;
    GS.set("S", d); UI.render();
    BT = {token: d.token, opp: d.opponent};
    const s = GS.S;
    $("vsMePet").textContent = GS.gender === "f" ? "🦸‍♀️" : "🦸‍♂️";
    $("vsMe").textContent = s.pet_name;
    $("vsMeSub").textContent = `ур. ${s.level} · ${s.league.emoji} ${s.league.name}`;
    $("vsOpp").textContent = d.opponent.pet_name;
    $("vsOppSub").textContent = `ур. ${d.opponent.level} · ${d.opponent.league_emoji} ${d.opponent.league}`;
    const oppHat = d.opponent.equipped && d.opponent.equipped.hat;
    const hatDef = oppHat && UI.itemDef(oppHat);
    $("vsOppPet").textContent = "👤" + (hatDef ? " "+hatDef.emoji : "");
    $("vsBonus").innerHTML = d.my_bonus > 0
      ? `Твой герой ухожен: <b style="color:var(--mint)">+${d.my_bonus}% к очкам</b>`
      : `Уход даёт бонус к очкам — корми и мой героя!`;
    hap("medium"); Sfx.tone(200,400,.3,"sawtooth",.12);
    Engine.lights.flash(0xff5e8a, .9, .6);
    Anim.setEmotion("excited", 1, 5);
    $("vsOv").classList.add("show");
  }

  function begin(){
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
      Games.runCatch(BT.token, end, "⚔️ БОЙ АРЕНЫ");
    }, seq.length*750);
  }

  async function end(){
    $("catchOv").classList.remove("on");
    const G = Games.G;
    const d = await Api.call("battle_finish", {token:G.token, score:G.score});
    if (!d){ UI.render(); return }
    const win = d.result === "win", draw = d.result === "draw";
    $("beIcon").textContent = win ? "🏆" : draw ? "🤝" : "💔";
    $("beTitle").textContent = win ? "ПОБЕДА!" : draw ? "НИЧЬЯ" : "Поражение";
    $("beTitle").className = "font-d " + (win ? "beWin" : draw ? "" : "beLose");
    $("beText").innerHTML =
      `Ты: <b>${d.my_final}</b> (${d.my_raw}${d.my_final>d.my_raw?" +уход":""}) · Соперник: <b>${d.opp_score}</b>`;
    $("beDelta").innerHTML =
      `<span>${d.d_trophy>=0?"+":""}${d.d_trophy} 🏆</span><span>+${d.d_tokens} 🎟</span><span>+${d.xp_gain} XP</span>`;
    GS.pending = d;
    if (win){
      UI.confetti(); Sfx.play("fanfare"); hap("ok");
      Engine.lights.flash(0xffc93c, 1.5, .9); Engine.cam.shake(.14);
      Anim.play("celebrate", true); Anim.setEmotion("excited", 1, 5);
      Engine.particles.spawn("star", {x:0,y:1.7,z:.5}, 14, 1.2);
    } else if (draw){ Sfx.play("pop"); Anim.setEmotion("surprised", .7, 3) }
    else {
      Sfx.play("bad"); hap("bad");
      Anim.play("defeat", true); Anim.setEmotion("sad", .9, 5);
    }
    $("battleEnd").classList.add("show");
  }

  function close(){
    $("battleEnd").classList.remove("show");
    BT = null;
    if (GS.pending){ const d = GS.pending; GS.pending = null; UI.afterAction(d) }
    else UI.render();
  }

  return { start, begin, close };
})();
