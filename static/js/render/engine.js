/* render/engine.js — рендер-ядро (док. 003).
   Один вечный цикл, слои, живая камера, свет, партиклы с пулом,
   амбиент-эмиттеры комнат, деградация качества при падении FPS. */
window.Engine = (() => {
  let scene, camera, renderer, clock, ground;
  const tickers = [];
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /* ---- камера как физический объект ---- */
  const cam = {
    base: new THREE.Vector3(0, 1.55, 7.4),   // select-сцена
    look: new THREE.Vector3(0, 1.15, 0),
    pos:  new THREE.Vector3(0, 2.6, 12),
    shakeMag: 0, zoomOff: 0, zoomEmo: 0, drift: 0,
    pointer: {x:0, y:0, sx:0, sy:0},
    shake(m=.12){ this.shakeMag = Math.max(this.shakeMag, m) },
    pulse(dz=.5, dur=.6){ this.zoomOff = dz; this._pT = dur },
    setMode(mode){
      if (mode === "play"){ this.base.set(0, 1.5, 6.4); this.look.set(0, 1.05, 0) }
      else { this.base.set(0, 1.55, 7.4); this.look.set(0, 1.15, 0) }
    },
    setEmotion(zoom){ this.zoomEmo = zoom }, // happy: -.25 ближе, sad: +.3 дальше
    update(dt, t){
      // дыхание + дрейф — камера никогда не статична
      const bx = Math.sin(t*.5)*.05, by = Math.sin(t*.8)*.04;
      // параллакс за пальцем с демпфированием
      this.pointer.sx += (this.pointer.x - this.pointer.sx)*dt*3;
      this.pointer.sy += (this.pointer.y - this.pointer.sy)*dt*3;
      // затухание импульсов
      if (this._pT > 0){ this._pT -= dt; if (this._pT <= 0) this.zoomOff = 0 }
      this.shakeMag *= Math.pow(.0001, dt); if (this.shakeMag < .001) this.shakeMag = 0;
      const shx = (Math.random()-.5)*this.shakeMag, shy = (Math.random()-.5)*this.shakeMag;
      const tz = this.base.z + this.zoomOff + this.zoomEmo;
      const target = new THREE.Vector3(
        this.base.x + this.pointer.sx*.7 + bx + shx,
        this.base.y - this.pointer.sy*.45 + by + shy,
        tz);
      this.pos.lerp(target, 1 - Math.pow(.001, dt));
      camera.position.copy(this.pos);
      camera.lookAt(this.look.x + this.pointer.sx*.15, this.look.y, this.look.z);
    }
  };

  /* ---- свет: комнаты + эмоции + вспышки событий ---- */
  const ROOM_LIGHT = {
    living:  {hemi:[0xcdb9ff,0x2a1b52], key:0xffffff, rim:0x8b6bff, fog:0x1a0f35, floor:0x2a1b52},
    kitchen: {hemi:[0xffd9a8,0x40260a], key:0xfff1d6, rim:0xff9c5b, fog:0x241708, floor:0x3d2a14},
    game:    {hemi:[0x9cdbff,0x0a1330], key:0xd6f0ff, rim:0x4fc3ff, fog:0x0a1330, floor:0x12224d},
    bath:    {hemi:[0xa8fff0,0x082129], key:0xe2fffb, rim:0x4ef0bc, fog:0x082129, floor:0x0e3644},
    bed:     {hemi:[0x6b7bff,0x060518], key:0x9aa8ff, rim:0x3d4fd6, fog:0x060518, floor:0x0d0a2e},
    arena:   {hemi:[0xffb3c4,0x2a0e18], key:0xffe3ea, rim:0xff5e8a, fog:0x1d0812, floor:0x3d1224},
  };
  const lights = {
    hemi:null, key:null, rim:null,
    _target:{}, _tint:new THREE.Color(1,1,1), _tintAmt:0,
    setRoom(room){
      this._target = ROOM_LIGHT[room] || ROOM_LIGHT.living;
      scene.fog && scene.fog.color.setHex(this._target.fog);
      ground && ground.material.color.setHex(this._target.floor);
    },
    tint(hex, amt){ this._tint.setHex(hex); this._tintAmt = amt }, // эмо-подсветка
    flash(hex=0xffc93c, strength=1.4, dur=.8){
      this._flash = {c:new THREE.Color(hex), s:strength, t:dur, T:dur};
    },
    update(dt){
      const T = this._target; if (!T) return;
      const lerpC = (light, hex, k=.04) => light.color.lerp(new THREE.Color(hex), k);
      lerpC(this.hemi, T.hemi[0]); this.hemi.groundColor.lerp(new THREE.Color(T.hemi[1]), .04);
      lerpC(this.key, T.key); lerpC(this.rim, T.rim);
      // эмоциональный тинт поверх
      if (this._tintAmt > 0){
        this.key.color.lerp(this._tint, this._tintAmt*.5);
        this.hemi.color.lerp(this._tint, this._tintAmt*.3);
      }
      // вспышка события (легендарка → золото на 0.8с)
      if (this._flash){
        const f = this._flash; f.t -= dt;
        const k = Math.max(0, f.t/f.T);
        this.key.intensity = .9 + f.s*k;
        this.key.color.lerp(f.c, k*.6);
        if (f.t <= 0){ this._flash = null; this.key.intensity = .9 }
      }
    }
  };

  /* ---- партиклы с пулом (без аллокаций в кадре) ---- */
  const texCache = {};
  function emojiTex(ch){
    if (texCache[ch]) return texCache[ch];
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    x.font = "48px serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(ch, 32, 36);
    return texCache[ch] = new THREE.CanvasTexture(c);
  }
  function dotTex(color){
    const key = "dot"+color;
    if (texCache[key]) return texCache[key];
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,color); g.addColorStop(1,"transparent");
    x.fillStyle = g; x.fillRect(0,0,32,32);
    return texCache[key] = new THREE.CanvasTexture(c);
  }
  const P_TYPES = {
    heart:{ch:"💜",vy:.9,g:0,decay:.7,s:.26}, love:{ch:"❤️",vy:1,g:0,decay:.7,s:.24},
    spark:{ch:"✨",vy:1.1,g:0,decay:.9,s:.24}, star:{ch:"⭐",vy:1.2,g:.4,decay:.8,s:.26},
    blush:{ch:"🌸",vy:.5,g:0,decay:1,s:.18}, bolt:{ch:"⚡",vy:1.4,g:0,decay:1.1,s:.26},
    bubble:{ch:"🫧",vy:1.2,g:-.2,decay:.6,s:.24}, ember:{ch:"🔥",vy:.8,g:0,decay:.9,s:.2},
    note:{ch:"🎵",vy:1,g:0,decay:.8,s:.22}, zzz:{ch:"💤",vy:.5,g:0,decay:.45,s:.26},
    dust:{dot:"#cdb9ff",vy:.12,g:0,decay:.16,s:.1}, glow:{dot:"#ffc93c",vy:.3,g:0,decay:.5,s:.3},
    neon:{dot:"#4fc3ff",vy:.25,g:0,decay:.2,s:.12}, drip:{dot:"#a8fff0",vy:-.9,g:0,decay:.5,s:.09},
  };
  const POOL_MAX = 260;
  const pool = [];
  let budget = POOL_MAX;
  function getP(){
    for (const p of pool) if (!p.live) return p;
    if (pool.length >= budget) return null;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({transparent:true, depthWrite:false}));
    m.visible = false; scene.add(m);
    const p = {m, live:false}; pool.push(p); return p;
  }
  const particles = {
    spawn(type, pos={x:0,y:1,z:.6}, n=8, spread=.5){
      const cfg = P_TYPES[type]; if (!cfg) return;
      for (let i=0;i<n;i++){
        const p = getP(); if (!p) return;
        p.live = true; p.m.visible = true;
        p.m.material.map = cfg.ch ? emojiTex(cfg.ch) : dotTex(cfg.dot);
        p.m.material.opacity = 1; p.m.material.rotation = 0;
        p.m.position.set(pos.x+(Math.random()-.5)*spread,
                         pos.y+(Math.random()-.3)*spread,
                         pos.z+(Math.random()-.5)*spread*.5);
        p.m.scale.setScalar(cfg.s*(0.8+Math.random()*.5));
        p.vy = cfg.vy*(.8+Math.random()*.5); p.vx = (Math.random()-.5)*.6;
        p.g = cfg.g; p.life = 1; p.decay = cfg.decay*(.85+Math.random()*.3);
        p.spin = (Math.random()-.5)*2.5;
      }
    },
    update(dt){
      for (const p of pool){
        if (!p.live) continue;
        p.life -= dt*p.decay;
        if (p.life <= 0){ p.live = false; p.m.visible = false; continue }
        p.vy -= (p.g||0)*dt;
        p.m.position.y += p.vy*dt; p.m.position.x += p.vx*dt;
        p.m.material.rotation += p.spin*dt;
        p.m.material.opacity = Math.min(1, p.life*1.4);
      }
    },
    clearBudget(v){ budget = v }
  };

  /* ---- амбиент комнаты: живой фон всегда (док. 001 NO STATIC SCREEN) ---- */
  const AMBIENT = {
    living:{type:"dust", rate:.5}, kitchen:{type:"ember", rate:.25},
    game:{type:"neon", rate:.9}, bath:{type:"bubble", rate:.4},
    bed:{type:"dust", rate:.3}, arena:{type:"ember", rate:.6},
  };
  let ambAcc = 0;
  function ambientUpdate(dt){
    const a = AMBIENT[GS.room]; if (!a || document.hidden) return;
    ambAcc += dt*a.rate;
    while (ambAcc > 1){
      ambAcc -= 1;
      particles.spawn(a.type,
        {x:(Math.random()-.5)*5, y:Math.random()*2.6-.6, z:(Math.random()-.5)*2-1}, 1, .1);
    }
  }

  /* ---- init ---- */
  function init(mount){
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1a0f35, 8, 20);
    clock = new THREE.Clock();
    camera = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, .1, 60);
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    lights.hemi = new THREE.HemisphereLight(0xcdb9ff, 0x2a1b52, .95);
    lights.key = new THREE.DirectionalLight(0xffffff, .9);
    lights.key.position.set(2.5, 4.5, 3); lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(1024,1024);
    lights.rim = new THREE.DirectionalLight(0x8b6bff, .55);
    lights.rim.position.set(-3, 2.4, -3);
    scene.add(lights.hemi, lights.key, lights.rim);

    ground = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48),
      new THREE.MeshStandardMaterial({color:0x2a1b52, roughness:.9, metalness:0}));
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
    scene.add(ground);
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(24,24),
      new THREE.ShadowMaterial({opacity:.35}));
    shadowCatcher.rotation.x = -Math.PI/2; shadowCatcher.position.y = .005;
    shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

    addEventListener("pointermove", e => {
      cam.pointer.x = (e.clientX/innerWidth - .5);
      cam.pointer.y = (e.clientY/innerHeight - .5);
      Bus.emit("input:any");
    }, {passive:true});
    addEventListener("pointerdown", ()=>Bus.emit("input:any"), {passive:true});

    /* FPS-страховка: при просадке урезаем партиклы (док. 003 FALLBACK) */
    let frames = 0, acc = 0;
    tickers.push(dt => {
      frames++; acc += dt;
      if (acc >= 3){
        const fps = frames/acc;
        particles.clearBudget(fps < 34 ? 90 : fps < 48 ? 170 : POOL_MAX);
        frames = 0; acc = 0;
      }
    });

    (function loop(){
      requestAnimationFrame(loop);
      const dt = Math.min(clock.getDelta(), .05);
      const t = clock.getElapsedTime();
      for (const fn of tickers){ try { fn(dt, t) } catch(e){ console.error("[tick]", e) } }
      ambientUpdate(dt);
      particles.update(dt);
      lights.update(dt);
      cam.update(dt, t);
      renderer.render(scene, camera);
    })();

    addEventListener("resize", ()=>{
      camera.aspect = innerWidth/innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    Bus.on("room:changed", r => { lights.setRoom(r); Sfx.play("swoosh"); cam.pulse(.6,.7) });
    lights.setRoom("living");
  }

  function raycast(clientX, clientY, objects){
    ndc.x = (clientX/innerWidth)*2 - 1;
    ndc.y = -(clientY/innerHeight)*2 + 1;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(objects, true);
    return hits.length ? hits[0] : null;
  }

  return {
    init, cam, lights, particles, raycast, emojiTex,
    onTick(fn){ tickers.push(fn) },
    get scene(){ return scene }, get camera(){ return camera },
  };
})();
