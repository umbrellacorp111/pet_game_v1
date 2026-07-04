/* game/main.js — бутстрап (док. 001 FIRST LAUNCH).
   Чёрный экран → звёзды → портал → заголовок → выбор героя (живая
   3D-сцена) → кинематографичный переход в комнату. Загрузки-экрана нет —
   только камера, свет и партиклы. */
(async () => {
  const sleep = ms => new Promise(r=>setTimeout(r, ms));

  try {

  /* ---------- 0. заставка ---------- */
  document.body.dataset.mode = "boot";
  const splash = $("splash");
  await sleep(150);
  splash.classList.add("stars");     // звёзды проявляются
  await sleep(500);
  splash.classList.add("portal");    // портал открывается
  Sfx.play("swoosh");
  await sleep(450);
  splash.classList.add("title");     // заголовок

  /* ---------- 1. параллельно: префсы + движок + состояние ---------- */
  const prefsP = Prefs.load();
  if (typeof THREE === "undefined") throw new Error("Three.js не загрузился (проверь интернет/CDN)");
  Engine.init($("gl"));
  Anim.tickInit();
  const stateP = Api.call("state");
  await prefsP;
  $("sndBtn").textContent = Prefs.data.sound ? "🔊" : "🔇";
  GS.gender = Prefs.data.gender || "";
  if (Prefs.data.lastRoom) GS.room = Prefs.data.lastRoom;

  UI.bind(); Games.bind();

  /* герой-фабрика на сцену (процедурный — для выбора и male) */
  function spawnHero(g, x, ry){
    const h = Hero.build(g);
    h.group.position.x = x;
    h.group.rotation.y = ry;
    Engine.scene.add(h.group);
    return h;
  }

  /* загрузка FBX-модели для female (если доступна) */
  async function loadMainHero(gender){
    if (gender === "f" && typeof THREE.FBXLoader !== "undefined"){
      try {
        const h = await Hero.loadFBX("/static/models/female.fbx");
        if (h) return h;
      } catch(e){ console.warn("[FBX] fallback to procedural", e) }
    }
    const h = Hero.build(gender);
    return h;
  }

  /* ---------- 2. главное меню ---------- */
  splash.classList.add("off");
  await sleep(400);
  GS.set("mode", "menu");
  document.body.dataset.mode = "menu";
  Engine.cam.setMode("menu");
  $("mainMenu").classList.add("show");
  Sfx.play("sparkle");

  const menuChoice = await new Promise(resolve => {
    $("mmPlay").onclick = () => { Sfx.play("tap"); resolve("play") };
    $("mmNew").onclick = () => { Sfx.play("tap"); resolve("new") };
  });
  $("mainMenu").classList.remove("show");

  if (menuChoice === "new"){
    const snd = Prefs.data.sound;
    Prefs.data = { sound: snd };
    Prefs.save();
    GS.gender = "";
    GS.room = "living";
  }

  /* ---------- 3. сцена выбора героя ---------- */
  async function characterSelect(){
    const hf = spawnHero("f", -1.05, .35);
    const hm = spawnHero("m",  1.05, -.35);
    Anim.simpleLife(hf, 0); Anim.simpleLife(hm, 2.1);
    Engine.particles.spawn("glow", {x:0,y:1.3,z:0}, 8, 2.2);
    let chosen = "";

    return new Promise(resolve => {
      GS.set("mode", "select");
      document.body.dataset.mode = "select";
      Engine.cam.setMode("select");
      $("selUI").classList.add("show");

      function select(g){
        chosen = g;
        const hero = g === "f" ? hf : hm, other = g === "f" ? hm : hf;
        Anim.clearSimple(); Anim.simpleLife(other, 1.3);
        Anim.attach(hero);
        Anim.play("wave", true);
        Anim.setEmotion("happy", 1, 4);
        hero.group.scale.setScalar(1.07); other.group.scale.setScalar(.94);
        hero.group.position.z = .35; other.group.position.z = -.25;
        Engine.particles.spawn("spark", {x:hero.group.position.x, y:1.7, z:.6}, 8, .6);
        Engine.cam.pulse(-.5,.7); Engine.cam.shake(.04);
        Sfx.play("sparkle"); hap("medium");
        $("selName").textContent = g === "f" ? "Героиня ✦" : "Герой ✦";
        $("selBtn").disabled = false;
      }

      const onTap = e => {
        if (GS.mode !== "select") return;
        const hit = Engine.raycast(e.clientX, e.clientY, [...hf.zones, ...hm.zones]);
        if (!hit) return;
        let o = hit.object;
        while (o && o !== hf.group && o !== hm.group) o = o.parent;
        if (o === hf.group) select("f");
        else if (o === hm.group) select("m");
      };
      addEventListener("pointerdown", onTap);

      $("selBtn").onclick = async () => {
        if (!chosen) return;
        removeEventListener("pointerdown", onTap);
        Prefs.data.gender = chosen; Prefs.save();
        GS.gender = chosen;
        Sfx.play("fanfare"); hap("ok");
        Engine.lights.flash(0x8b6bff, 1.6, 1);
        Engine.particles.spawn("glow", {x:0,y:1.4,z:.4}, 18, 1.6);
        $("flash").classList.add("portal");
        $("selUI").classList.remove("show");
        await sleep(650);
        const other = chosen === "f" ? hm : hf;
        Engine.scene.remove(other.group);
        Anim.clearSimple();

        let hero = chosen === "f" ? hf : hm;
        // Для female пробуем FBX во время портала
        if (chosen === "f"){
          Engine.scene.remove(hf.group);
          hero = await loadMainHero("f");
          hero.group.position.set(0, 0, 0);
          hero.group.rotation.y = 0;
          Engine.scene.add(hero.group);
        } else {
          hero.group.position.set(0, 0, 0);
          hero.group.rotation.y = 0;
          hero.group.scale.setScalar(1);
        }
        Anim.attach(hero);
        $("flash").classList.remove("portal");
        resolve(hero);
      };
    });
  }

  /* ---------- 4. вход в мир ---------- */
  let hero;
  if (!GS.gender){
    hero = await characterSelect();
  } else {
    hero = await loadMainHero(GS.gender);
    hero.group.position.set(0, 0, 0);
    Engine.scene.add(hero.group);
    Anim.attach(hero);
  }
  window.heroMain = hero;

  GS.set("mode", "play");
  document.body.dataset.mode = "play";
  Engine.cam.setMode("play");
  Engine.cam.pulse(-.6, 1);
  Anim.play("wave", true);
  Sfx.ambient(GS.room);

  /* тач-зоны героя (док. 010) */
  addEventListener("pointerdown", e => {
    if (GS.mode !== "play") return;
    if (e.target.closest(".uiLayer,.sheet,.overlay,.gameOv,#notifStack")) return;
    const hit = Engine.raycast(e.clientX, e.clientY, hero.zones);
    if (hit) Anim.touch(hit.object.userData.zone, hit.point);
  });

  /* ---------- 5. состояние сервера ---------- */
  const d = await stateP;
  if (d){
    GS.set("S", d);
    UI.render();
    UI.showDayEvent();
  } else {
    UI.toast("Не удалось загрузиться — потяни вниз, чтобы обновить", true);
  }

  } catch(e){
    console.error("[Boot]", e);
    splash.classList.add("off");
    document.body.dataset.mode = "play";
    $("flash").classList.add("portal");
    UI.toast("Ошибка загрузки: " + e.message + ". Обнови страницу.", true);
  }
})();