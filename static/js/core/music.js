/* core/music.js — фоновая музыка MP3 поверх амбиента.
   Комнаты → треки. Уважает звук (Prefs.data.sound). */
window.Music = (() => {
  let current = null; // {id, el, gain, src}
  let fadeTimer = null;

  const TRACKS = {
    playboy:     "/static/music/Playboy.mp3",
    feofilov:    "/static/music/feofilov.mp3",
    feofilovv2:  "/static/music/feofilovv2.mp3",
  };

  /* какая музыка для какой комнаты/состояния */
  function trackFor(room, state){
    if (state === "arenaFight") return "playboy";
    if (room === "arena") return "playboy";
    if (room === "kiber" || room === "game") return "feofilovv2";
    if (room === "living") return "feofilov";
    return; // остальные комнаты без музыки
  }

  function play(room, state){
    if (!Prefs.data.sound || !Prefs.data.sound.music){ stop(); return }
    const id = trackFor(room, state);
    if (current && current.id === id) return; // уже играет

    stop();
    const src = TRACKS[id];
    if (!src) return;

    const el = new Audio(src);
    el.loop = true;
    el.volume = 0;
    el.play().catch(() => {});

    current = { id, el, src };

    /* плавный фейд (300ms) */
    let vol = 0;
    const step = 0.04;
    fadeTimer = setInterval(() => {
      vol = Math.min(1, vol + step);
      if (current) current.el.volume = vol * 0.35;
      if (vol >= 1) clearInterval(fadeTimer);
    }, 30);
  }

  function stop(){
    clearInterval(fadeTimer);
    if (current){
      /* быстрый фейд-аут */
      const el = current.el;
      let vol = el.volume;
      const step = 0.06;
      const timer = setInterval(() => {
        vol = Math.max(0, vol - step);
        el.volume = vol;
        if (vol <= 0){ clearInterval(timer); el.pause(); el.src = "" }
      }, 25);
      current = null;
    }
  }

  /* слушаем смену комнаты */
  Bus.on("room:changed", r => play(r));

  return { play, stop };
})();