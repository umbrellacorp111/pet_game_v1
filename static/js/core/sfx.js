/* core/sfx.js — реактивный звук (док. 014): UI, «голос» героя,
   стингеры событий, амбиент комнаты. Всё синтезировано WebAudio. */
window.Sfx = (() => {
  let AC = null, ambOsc = null, ambGain = null;

  function ctx(){
    /* guard: Telegram Desktop (CEF) может закрыть AudioContext, если бот
       свернут; OS мобильного клиента — при suspend долгом. После close все
       createOscillator/createGain кидают InvalidStateError — весь звук
       вылетает в консоль. Пересоздаём контекст при close. */
    if (AC && AC.state === "closed"){ AC = null; ambOsc = null; ambGain = null }
    if (!AC) try { AC = new (window.AudioContext||window.webkitAudioContext)() } catch(e){ return null }
    if (AC && AC.state === "suspended") AC.resume().catch(()=>{});
    return AC && AC.state !== "closed" ? AC : null;
  }
  function tone(f1, f2, dur=.12, type="sine", vol=.14, delay=0){
    if (!Prefs.data.sound || !Prefs.data.sound.sfx) return;
    const a = ctx(); if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f1, t0);
    if (a.state !== "closed") o.frequency.exponentialRampToValueAtTime(Math.max(1,f2), t0+dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0+dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0+dur);
  }
  const seq = (notes, step=.1, dur=.16, type="triangle", vol=.16) =>
    notes.forEach((f,i)=>tone(f,f,dur,type,vol,i*step));

  const bank = {
    tap:    () => tone(300,520,.07,"square",.07),
    pop:    () => tone(300,520,.08,"square",.08),
    merge:  () => tone(460,720,.1,"triangle",.1),
    coin:   () => tone(880,1320,.1,"triangle",.13),
    err:    () => tone(220,140,.2,"sawtooth",.08),
    bad:    () => tone(160,90,.25,"sawtooth",.12),
    tick:   () => tone(600,600,.06,"square",.1),
    go:     () => tone(440,880,.35,"sawtooth",.16),
    win:    () => seq([523,659,784,1046],.09,.18),
    fanfare:() => seq([392,523,659,784,1046,784,1046],.11,.16),
    sparkle:() => seq([1568,1976,2349],.05,.09,"sine",.08),
    legend: () => { seq([523,659,784,1046,1319],.08,.2,"triangle",.18); tone(90,60,.7,"sawtooth",.1) },
    swoosh: () => tone(900,120,.3,"sawtooth",.06),
    splash: () => seq([300,600,900],.04,.07,"sine",.1),
    reel:   () => seq([400,500,600,700],.06,.08,"triangle",.09),
    sleep:  () => tone(400,180,.5,"sine",.1),
    /* «голос» героя — невербальные чирпы (док. 010 AUDIO) */
    vHappy: () => seq([720,900,1080],.06,.09,"sine",.12),
    vLaugh: () => seq([600,780,600,780],.08,.07,"triangle",.11),
    vOw:    () => tone(700,320,.16,"square",.1),
    vHm:    () => tone(420,380,.2,"sine",.1),
    vSad:   () => seq([520,430,360],.12,.16,"sine",.09),
    vWow:   () => tone(500,1000,.22,"sine",.12),
    vSleepy:() => tone(500,300,.5,"sine",.07),
  };

  /* тихий амбиент-дрон комнаты */
  const AMB = { living:[110,.014], kitchen:[130,.012], game:[90,.02],
                bath:[150,.012], bed:[70,.016], arena:[80,.02], pond:[95,.018] };
  function ambient(room){
    if (!Prefs.data.sound || !Prefs.data.sound.sfx){ stopAmbient(); return }
    const a = ctx(); if (!a) return;
    const [f, v] = AMB[room] || AMB.living;
    if (!ambOsc){
      ambOsc = a.createOscillator(); ambGain = a.createGain();
      ambOsc.type = "sine"; ambGain.gain.value = 0;
      ambOsc.connect(ambGain).connect(a.destination); ambOsc.start();
    }
    if (a.state === "closed") return;
    ambOsc.frequency.linearRampToValueAtTime(f, a.currentTime+1.2);
    ambGain.gain.linearRampToValueAtTime(v, a.currentTime+1.2);
  }
  function stopAmbient(){
    if (ambGain && AC && AC.state !== "closed")
      ambGain.gain.linearRampToValueAtTime(0, AC.currentTime+.5);
  }

  Bus.on("room:changed", r => ambient(r));

  return {
    play(name){ (bank[name]||(()=>{}))() },
    tone, ambient, stopAmbient
  };
})();
