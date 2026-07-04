/* core/bus.js — «мозг»: шина событий + глобальное состояние.
   Все подсистемы общаются ТОЛЬКО через Bus (док. 012). */
window.$ = id => document.getElementById(id);

window.Bus = (() => {
  const map = {};
  return {
    on(ev, fn){ (map[ev] = map[ev] || []).push(fn); return fn },
    off(ev, fn){ map[ev] = (map[ev]||[]).filter(f=>f!==fn) },
    emit(ev, data){
      (map[ev]||[]).forEach(fn => { try { fn(data) } catch(e){ console.error("[Bus]", ev, e) } });
    }
  };
})();

/* Глобальный стор. Пишем через GS.set — подписчики получают событие. */
window.GS = {
  S: null,            // серверное состояние (bot.py /api/state)
  room: "living",
  gender: "",         // m | f — клиентский выбор героя
  mode: "boot",       // boot | select | play
  set(key, val){
    this[key] = val;
    Bus.emit("gs:"+key, val);
  }
};

/* Телеграм-обвязка */
window.tg = window.Telegram.WebApp;
tg.ready(); tg.expand();
tg.setHeaderColor?.("#07051A"); tg.setBackgroundColor?.("#07051A");
window.hap = t => { try {
  t==="ok" ? tg.HapticFeedback.notificationOccurred("success")
  : t==="bad" ? tg.HapticFeedback.notificationOccurred("error")
  : tg.HapticFeedback.impactOccurred(t||"light") } catch(e){} };
