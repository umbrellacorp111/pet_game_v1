/* net/api.js — мост к bot.py. Контракты сервера НЕ менялись:
   те же эндпоинты и поля, что и раньше. */
window.Api = (() => {
  const initData = (tg && tg.initData) || "";
  async function call(path, extra={}){
    for (let attempt = 0; attempt < 2; attempt++){
      try {
        const r = await fetch("/api/"+path, {method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({initData, ...extra})});
        const d = await r.json();
        if (!r.ok){
          Bus.emit("api:error", d.error || "Ошибка");
          hap("bad"); Sfx.play("err");
          return null;
        }
        return d;
      } catch(e){
        if (attempt === 0){ await new Promise(rs=>setTimeout(rs, 700)); continue }
        Bus.emit("api:error", "Нет связи с сервером");
        return null;
      }
    }
  }
  return { call };
})();
