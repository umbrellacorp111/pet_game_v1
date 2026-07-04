/* core/prefs.js — клиентское сохранение (док. 002 SAVE SYSTEM).
   Бэкенд хранит только геймплей; визуальные настройки — здесь. */
window.Prefs = {
  data: { sound:{sfx:true,music:true}, gender:"", lastRoom:"living" },
  load(){ return new Promise(res => {
    let done = false;
    const finish = raw => { if (done) return; done = true;
      try { if (raw){
        const parsed = JSON.parse(raw);
        if (typeof parsed.sound === "boolean")
          parsed.sound = {sfx:parsed.sound, music:parsed.sound};
        Object.assign(this.data, parsed);
      }} catch(e){}
      res(this.data) };
    try {
      if (tg.CloudStorage?.getItem){
        tg.CloudStorage.getItem("fable_prefs", (e, v) =>
          finish(!e && v ? v : safeLS()));
        setTimeout(()=>finish(safeLS()), 1200);
      } else finish(safeLS());
    } catch(e){ finish(null) }
    function safeLS(){ try { return localStorage.getItem("fable_prefs") } catch(e){ return null } }
  })},
  save(){
    const raw = JSON.stringify(this.data);
    try { localStorage.setItem("fable_prefs", raw) } catch(e){}
    try { tg.CloudStorage?.setItem?.("fable_prefs", raw, ()=>{}) } catch(e){}
  }
};
