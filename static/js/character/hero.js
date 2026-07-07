/* character/hero.js — живой герой. Процедурный риг (по умолчанию)
   или загрузка FBX-модели через loadFBX(). */
console.log("%c[hero.js] BUILD-MARKER v5-diagnostics", "background:#e0218a;color:#fff;font-size:14px;padding:2px 6px;border-radius:4px");
window.Hero = (() => {
  const SKIN = 0xffd9b8, DARK = 0x1b1033;
  const LEVEL_ACCENT = [0x8b6bff, 0x4fc3ff, 0xffa14d, 0x4ef0bc, 0xff7ec2, 0xffc93c];

  const M = (color, rough=.6) => new THREE.MeshStandardMaterial({color, roughness:rough, metalness:.05});

  /* процедурная юбка — fallback, если FBX не загрузился */
  function skirtFallback(bone, color=0xffc0d0){
    const seg = 28, h = .38, rT = .35, rB = .55;
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++){
      const a = i/seg*Math.PI*2, w = 1+.12*Math.sin(a*8);
      const c=Math.cos(a), s=Math.sin(a);
      pos.push(rT*w*c, .08, rT*w*s, rB*w*c, -h+.08, rB*w*s);
    }
    for (let i = 0; i < seg; i++){
      const a=i*2, b=i*2+1, c=(i+1)*2, d=(i+1)*2+1;
      idx.push(a,c,b, b,c,d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color, roughness:.6, metalness:.05, side:THREE.DoubleSide}));
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(0, -.03, .1);
    bone.add(m); return m;
  }

  /* Многие "готовые" FBX-шмотки, купленные на маркетплейсах, на самом
     деле — это целый персонаж (тело, глаза, зубы + сама вещь), да ещё
     и в сантиметрах, а не в метрах сцены (рост ~175 вместо ~1.7-2).
     Эта функция: 1) оставляет только меши, похожие на нужный предмет
     по имени, выпиливая тело/глаза/зубы; 2) считает bounding box
     оставшегося и сама подгоняет scale/position под слот, вместо
     захардкоженных magic-чисел, которые были рассчитаны на "чистый"
     ассет и ломались на составных FBX. */
  function fitClothesFBX(fbx, {keepRe = /skirt|pleat|dress|skort/i, targetHeight = .42, forward = .06, fitColor = 0xffc0d0} = {}){
    const meshes = [];
    fbx.traverse(c => { if (c.isMesh) meshes.push(c) });
    console.log("[fitClothesFBX] meshes in file: " + meshes.map(m => `"${m.name}"`).join(", "));
    const keep = meshes.filter(m => keepRe.test(m.name));
    console.log("[fitClothesFBX] kept (matched keepRe): " + keep.map(m => `"${m.name}"`).join(", "));
    if (keep.length && keep.length < meshes.length){
      meshes.filter(m => !keepRe.test(m.name)).forEach(m => {
        m.visible = false;
        if (m.parent) m.parent.remove(m);
        m.geometry?.dispose?.();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => mt?.dispose?.());
      });
    } else if (!keep.length){
      console.warn("[fitClothesFBX] ни один меш не совпал с keepRe — оставляю всё как есть (может показать лишнее/тело).");
    }
    const box = new THREE.Box3().setFromObject(fbx);
    const size = new THREE.Vector3(); box.getSize(size);
    const bmin = box.min, bmax = box.max;
    console.log(`[fitClothesFBX] bbox min=(${bmin.x.toFixed(3)}, ${bmin.y.toFixed(3)}, ${bmin.z.toFixed(3)}) max=(${bmax.x.toFixed(3)}, ${bmax.y.toFixed(3)}, ${bmax.z.toFixed(3)}) size=(${size.x.toFixed(4)}, ${size.y.toFixed(4)}, ${size.z.toFixed(4)})`);
    if (size.y > 0 && isFinite(size.y)){
      const center = new THREE.Vector3(); box.getCenter(center);
      const scale = targetHeight / size.y;
      fbx.scale.setScalar(scale);
      fbx.position.set(-center.x*scale, -box.max.y*scale, -center.z*scale + forward);
      console.log(`[fitClothesFBX] applied scale=${scale.toFixed(6)} position=(${fbx.position.x.toFixed(4)}, ${fbx.position.y.toFixed(4)}, ${fbx.position.z.toFixed(4)})`);
    } else {
      console.warn("[fitClothesFBX] bbox некорректный (пустой/нулевой) — scale/position НЕ применены, объект остался в исходном FBX-масштабе (может быть огромным/невидимым).");
    }
    /* Оригинальные материалы почти всегда битые: у бесплатных FBX-шек
       текстуры — это пути на диске автора, которых физически нет
       (два ассета подряд — 404 на текстуру). Плюс частая история с
       конвертированными FBX — вывернутые нормали, из-за которых
       материал с default side:FrontSide не рисуется с "той" стороны
       камеры, хотя объект стоит на своём месте. Чтобы не гадать и не
       чинить это на каждом новом ассете заново — материал вещи всегда
       заменяется на простой сплошной цвет, видимый с обеих сторон. */
    fbx.traverse(c => {
      if (c.isMesh){
        c.material = new THREE.MeshStandardMaterial({
          color: fitColor, roughness:.75, metalness:.05, side: THREE.DoubleSide});
        c.frustumCulled = false;
      }
    });
    if (window.DEBUG_CLOTHES){
      const dbgMat = new THREE.MeshBasicMaterial({color:0x00ff44, wireframe:false, depthTest:false, side:THREE.DoubleSide});
      fbx.traverse(c => {
        if (c.isMesh){ c.material = dbgMat; c.frustumCulled = false; c.renderOrder = 999; c.visible = true }
      });
      fbx.visible = true;
      console.log("[fitClothesFBX] DEBUG_CLOTHES включён — материал принудительно ярко-зелёный, всегда видим.");
    }
    return fbx;
  }

  /* Грузит одёжный ассет по расширению: .glb/.gltf через GLTFLoader
     (лёгкие, самодостаточные файлы — предпочтительный формат),
     .fbx через старый FBXLoader (для обратной совместимости). */
  function loadClothesAsset(url){
    if (/\.(glb|gltf)$/i.test(url)){
      return new Promise((res, rej) =>
        new THREE.GLTFLoader().load(url, gltf => res(gltf.scene), undefined, rej));
    }
    return new Promise((res, rej) =>
      new THREE.FBXLoader().load(url, res, undefined, rej));
  }

  /* ---------- процедурная сборка (как было) ---------- */
  function build(gender){
    const g = gender === "f";
    const bones = {}, face = {}, zones = [];
    const skin = M(SKIN, .55);
    const hairC = g ? 0x4a2f63 : 0x23233a;
    const hairM = M(hairC, .5);
    const topM  = M(g ? 0xfff0f4 : 0xf2f4fa, .7);
    const legM  = M(g ? 0xd977a0 : 0x2e3350, .75);
    const shoeM = M(0xffffff, .5);

    const zone = (mesh, z) => { mesh.userData.zone = z; zones.push(mesh); return mesh };
    const piv = (parent, x,y,z) => { const p = new THREE.Group(); p.position.set(x,y,z); parent.add(p); return p };

    const root = new THREE.Group();
    bones.root = root;

    const pelvis = piv(root, 0, .98, 0); bones.pelvis = pelvis;
    const hipMesh = zone(new THREE.Mesh(new THREE.SphereGeometry(.26, 24, 20), legM), "body");
    hipMesh.scale.set(1.05,.7,.85); hipMesh.castShadow = true; pelvis.add(hipMesh);
    if (g){
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(.34,.34,24,1,true), legM);
      skirt.position.y = -.14; pelvis.add(skirt);
    }
    for (const s of [-1,1]){
      const th = piv(pelvis, .15*s, -.05, 0);
      const thigh = zone(new THREE.Mesh(new THREE.CylinderGeometry(.105,.09,.44,16), legM), "legs");
      thigh.position.y = -.22; thigh.castShadow = true; th.add(thigh);
      const kn = piv(th, 0, -.44, 0);
      const calf = zone(new THREE.Mesh(new THREE.CylinderGeometry(.085,.07,.42,16), legM), "legs");
      calf.position.y = -.21; calf.castShadow = true; kn.add(calf);
      const foot = zone(new THREE.Mesh(new THREE.SphereGeometry(.11,16,12), shoeM), "legs");
      foot.position.set(0, -.44, .06); foot.scale.set(1,.6,1.6); foot.castShadow = true; kn.add(foot);
      bones[s<0?"thL":"thR"] = th; bones[s<0?"knL":"knR"] = kn;
    }

    const spine = piv(pelvis, 0, .1, 0); bones.spine = spine;
    const torso = zone(new THREE.Mesh(new THREE.CylinderGeometry(.23,.28,.6,20), topM), "body");
    torso.position.y = .3; torso.castShadow = true; spine.add(torso);
    const chest = zone(new THREE.Mesh(new THREE.SphereGeometry(.245,20,16), topM), "body");
    chest.position.y = .56; chest.scale.set(1,.7,.85); chest.castShadow = true; spine.add(chest);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(.05, 16), M(LEVEL_ACCENT[0], .3));
    badge.position.set(g?-.12:.12, .52, .235); spine.add(badge);

    for (const s of [-1,1]){
      const sh = piv(spine, .3*s, .56, 0);
      const upper = zone(new THREE.Mesh(new THREE.CylinderGeometry(.07,.06,.32,14), topM), s<0?"armL":"armR");
      upper.position.y = -.16; upper.castShadow = true; sh.add(upper);
      const el = piv(sh, 0, -.32, 0);
      const fore = zone(new THREE.Mesh(new THREE.CylinderGeometry(.055,.05,.28,14), skin), s<0?"armL":"armR");
      fore.position.y = -.14; fore.castShadow = true; el.add(fore);
      const hand = zone(new THREE.Mesh(new THREE.SphereGeometry(.07,14,12), skin), s<0?"armL":"armR");
      hand.position.y = -.31; el.add(hand);
      sh.rotation.z = .1*s;
      bones[s<0?"shL":"shR"] = sh; bones[s<0?"elL":"elR"] = el;
    }

    const neck = piv(spine, 0, .72, 0); bones.neck = neck;
    const nMesh = new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.1,12), skin);
    nMesh.position.y = .03; neck.add(nMesh);
    const head = piv(neck, 0, .12, 0); bones.head = head;
    const skull = zone(new THREE.Mesh(new THREE.SphereGeometry(.3, 32, 28), skin), "head");
    skull.position.y = .22; skull.scale.set(.95,1.05,.95); skull.castShadow = true; head.add(skull);

    const hair = new THREE.Group(); head.add(hair);
    const cap = zone(new THREE.Mesh(new THREE.SphereGeometry(.315,28,22,0,Math.PI*2,0,Math.PI*.62), hairM), "head");
    cap.position.y = .26; cap.scale.set(1,1.02,1); hair.add(cap);
    for (let i=0;i<3;i++){
      const fr = new THREE.Mesh(new THREE.SphereGeometry(.09,12,10), hairM);
      fr.position.set(-.12+.12*i, .4, .24); fr.scale.set(1.2,.7,.7); hair.add(fr);
    }
    if (g){
      const back = new THREE.Mesh(new THREE.SphereGeometry(.3,20,16), hairM);
      back.position.set(0,.16,-.12); back.scale.set(1,1.15,.8); hair.add(back);
      const pony = piv(head, 0, .42, -.24); bones.pony = pony;
      [[0,-.02],[0,-.2],[0,-.38]].forEach(([x,y],i)=>{
        const seg = new THREE.Mesh(new THREE.SphereGeometry(.11-.02*i,14,12), hairM);
        seg.position.set(x,y,-.03*i); pony.add(seg);
      });
      const tie = new THREE.Mesh(new THREE.TorusGeometry(.06,.02,8,16), M(0xffc93c,.4));
      tie.position.y = .04; pony.add(tie);
    } else {
      const gl = new THREE.Group(); head.add(gl);
      for (const s of [-1,1]){
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.085,.012,8,20), M(DARK,.3));
        rim.position.set(.12*s, .26, .27); gl.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(.07,.015,.015), M(DARK,.3));
      bridge.position.set(0,.27,.28); gl.add(bridge);
    }

    const irisC = g ? 0x4f7fd9 : 0x3aa08a;
    for (const s of [-1,1]){
      const white = new THREE.Mesh(new THREE.SphereGeometry(.075,18,14), M(0xffffff,.3));
      white.position.set(.12*s, .26, .245); white.scale.z = .6; head.add(white);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(.042,14,12), M(irisC,.25));
      iris.position.set(.12*s, .26, .29); head.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.02,10,8), M(DARK,.2));
      pupil.position.set(.12*s, .26, .315); head.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(.008,6,6), M(0xffffff,.1));
      glint.position.set(.12*s+.015, .275, .325); head.add(glint);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(.08,16,12,0,Math.PI*2,0,Math.PI/2), skin);
      lid.position.set(.12*s, .265, .245); lid.rotation.x = -.3; lid.scale.set(1,.12,.7);
      head.add(lid);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(.1,.018,.02), hairM);
      brow.position.set(.12*s, .36, .27); head.add(brow);
      const cheekM = new THREE.MeshBasicMaterial({color:0xff8fb0, transparent:true, opacity:0});
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(.045,12), cheekM);
      cheek.position.set(.19*s, .18, .265); cheek.rotation.y = .3*s; head.add(cheek);
      face[s<0?"pupilL":"pupilR"] = pupil; face[s<0?"irisL":"irisR"] = iris;
      face[s<0?"lidL":"lidR"] = lid; face[s<0?"browL":"browR"] = brow;
      face[s<0?"cheekL":"cheekR"] = cheekM;
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.075,.015,8,20,Math.PI), M(DARK,.3));
    mouth.position.set(0, .13, .28); mouth.rotation.z = Math.PI;
    head.add(mouth); face.mouth = mouth;
    const mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(.045,12,10), M(0x77323f,.4));
    mouthOpen.position.set(0,.115,.27); mouthOpen.scale.set(1,.01,.5);
    head.add(mouthOpen); face.mouthOpen = mouthOpen;
    const faceHit = zone(new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),
      new THREE.MeshBasicMaterial({visible:false})), "face");
    faceHit.position.set(0,.24,.22); head.add(faceHit);

    const hatSlot = piv(head, 0, .58, .02); bones.hatSlot = hatSlot;
    const faceSlot = piv(head, 0, .26, .36); bones.faceSlot = faceSlot;
    const skirtSlot = piv(pelvis, 0, -.24, 0); bones.skirtSlot = skirtSlot;

    const rest = {};
    for (const k in bones) rest[k] = bones[k].rotation.clone();

    const hero = {
      group: root, bones, face, zones, rest, gender, isFBX: false,
      fxAura: "", _equipSprites: [], _clothesFBX: {},
      setLevel(level){
        const idx = Math.min(LEVEL_ACCENT.length-1, Math.floor((level-1)/4));
        badge.material.color.setHex(LEVEL_ACCENT[idx]);
      },
      async _loadClothesFBX(slot, url, bone){
        if (!bone || this._clothesFBX[slot]) return;
        this._clothesFBX[slot] = {loading: true};
        try {
          const mesh = await loadClothesAsset(url);
          mesh.traverse(c => { if (c.isMesh){ c.castShadow = true; c.receiveShadow = true } });
          fitClothesFBX(mesh);
          bone.add(mesh);
          const eq = GS?.S?.equipped;
          mesh.visible = !!eq?.[slot];
          this._clothesFBX[slot] = {mesh, loaded: true};
          console.log(`[clothes] ${slot} loaded. GS.S=${!!GS?.S} equipped=${eq?.[slot]||"—"} → visible=${mesh.visible}`);
          mesh.traverse(c => { if (c.isMesh) console.log(`[clothes] mesh "${c.name}" skinned=${!!c.isSkinnedMesh}`) });
          setTimeout(() => {
            const wp = new THREE.Vector3(); bone.getWorldPosition(wp);
            const bb = new THREE.Box3().setFromObject(mesh);
            console.log(`[clothes] ${slot} slotWorld=(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)}) worldBox y=[${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}] x=[${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)}] visible=${mesh.visible}`);
          }, 1500);
        } catch(e){
          console.warn("[Hero] clothes load fail", slot, e);
          const fb = skirtFallback(bone);
          this._clothesFBX[slot] = {mesh: fb, loaded: true};
          const eq = GS?.S?.equipped;
          fb.visible = !!eq?.[slot];
          Bus.emit("api:error", "3D-юбка (FBX) не загрузилась — нарисовал процедурную. Ошибка: "+e.message);
        }
      },
      setEquip(equipped, defOf){
        this._equipSprites.forEach(s => s.parent && s.parent.remove(s));
        this._equipSprites = [];
        const put = (slotBone, id, scale) => {
          const it = defOf(id); if (!it) return;
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map:Engine.emojiTex(it.emoji), transparent:true, depthWrite:false}));
          sp.scale.setScalar(scale); slotBone.add(sp);
          this._equipSprites.push(sp);
        };
        if (equipped.hat) put(hatSlot, equipped.hat, .5);
        if (equipped.face) put(faceSlot, equipped.face, .38);
        /* 3D-одежда */
        console.log(`[setEquip] skirt=${equipped.skirt||"—"} entry=${this._clothesFBX.skirt ? (this._clothesFBX.skirt.loaded?"loaded":"loading") : "none"}`);
        if (equipped.skirt){
          if (this._clothesFBX.skirt?.loaded && this._clothesFBX.skirt.mesh)
            this._clothesFBX.skirt.mesh.visible = true;
          else if (!this._clothesFBX.skirt)
            this._loadClothesFBX("skirt", "/static/models/clothes/Skirt.glb", skirtSlot);
        } else if (this._clothesFBX.skirt?.mesh) {
          this._clothesFBX.skirt.mesh.visible = false;
        }
        this.fxAura = equipped.fx || "";
      },
    };
    return hero;
  }

  /* ---------- загрузка FBX (Mixamo) ---------- */
  const BONE_MAP = {
    "mixamorig:Hips":"pelvis", "mixamorig:Spine":"spine",
    "mixamorig:Spine1":"spine1", "mixamorig:Spine2":"spine2",
    "mixamorig:Neck":"neck", "mixamorig:Head":"head",
    "mixamorig:HeadTop_End":"headTop",
    "mixamorig:LeftUpLeg":"thL", "mixamorig:RightUpLeg":"thR",
    "mixamorig:LeftLeg":"knL", "mixamorig:RightLeg":"knR",
    "mixamorig:LeftFoot":"footL", "mixamorig:RightFoot":"footR",
    "mixamorig:LeftToeBase":"toeL", "mixamorig:RightToeBase":"toeR",
    "mixamorig:LeftShoulder":"shL", "mixamorig:RightShoulder":"shR",
    "mixamorig:LeftArm":"armL", "mixamorig:RightArm":"armR",
    "mixamorig:LeftForeArm":"elL", "mixamorig:RightForeArm":"elR",
    "mixamorig:LeftHand":"handL", "mixamorig:RightHand":"handR",
  };

  async function loadFBX(url){
    return new Promise((resolve, reject) => {
      try {
        const loader = new THREE.FBXLoader();
        loader.load(url, fbx => {
          // Three.js FBXLoader сам конвертит Z-up → Y-up.
          // Масштаб: ~14 единиц FBX → ~2 единицы сцены.
          fbx.scale.setScalar(1.25);

          const mixer = new THREE.AnimationMixer(fbx);
          const _clips = {}, _actions = {};
          let _currentAction = null, _finishHandler = null;
          // Первая анимация — idle (зациклена)
          if (fbx.animations && fbx.animations[0]){
            _clips.idle = fbx.animations[0];
            _currentAction = mixer.clipAction(_clips.idle);
            _currentAction.setLoop(THREE.LoopRepeat);
            _currentAction.play();
          }
          function playAnim(name, fadeIn = 0.3){
            if (!_clips[name]) return false;
            // Удаляем старый обработчик finished
            if (_finishHandler){
              mixer.removeEventListener("finished", _finishHandler);
              _finishHandler = null;
            }
            const next = _actions[name] || (_actions[name] = mixer.clipAction(_clips[name]));
            if (_currentAction && _currentAction !== next){
              _currentAction.fadeOut(fadeIn);
              next.reset().fadeIn(fadeIn).play();
            } else if (!_currentAction){
              next.play();
            }
            _currentAction = next;
            if (name !== "idle"){
              next.setLoop(THREE.LoopOnce);
              next.clampWhenFinished = true;
              _finishHandler = function onFinish(e){
                if (e.action === next){
                  mixer.removeEventListener("finished", _finishHandler);
                  _finishHandler = null;
                  const idle = _actions.idle || (_actions.idle = mixer.clipAction(_clips.idle));
                  if (idle){
                    next.fadeOut(fadeIn);
                    idle.reset().fadeIn(fadeIn).play();
                    idle.setLoop(THREE.LoopRepeat);
                    _currentAction = idle;
                  }
                }
              };
              mixer.addEventListener("finished", _finishHandler);
            } else {
              next.setLoop(THREE.LoopRepeat);
            }
            return true;
          }

          // Собираем кости, создаём fallback-группы для нужных имён
          const bones = {root: new THREE.Group()};
          fbx.traverse(child => {
            if (child.isBone && BONE_MAP[child.name]){
              bones[BONE_MAP[child.name]] = child;
            }
          });
          // Создаём заглушки для отсутствующих костей (чтобы Anim.js не падал)
          const needed = ["pelvis","spine","neck","head","thL","thR","knL","knR","shL","shR","elL","elR"];
          needed.forEach(k => { if (!bones[k]){ const g = new THREE.Group(); bones.root.add(g); bones[k] = g } });

          // Слоты экипировки (создаём ДО rest-позы, чтобы были в rest)
          if (bones.head){
            const hs = new THREE.Group(); hs.position.set(0, .3, 0); bones.head.add(hs); bones.hatSlot = hs;
            const fs = new THREE.Group(); fs.position.set(0, .12, .35); bones.head.add(fs); bones.faceSlot = fs;
          }
          if (bones.pelvis){
            const ss = new THREE.Group(); ss.position.set(0, -.15, 0); bones.pelvis.add(ss); bones.skirtSlot = ss;
          }

          // rest-поза (текущие rotation костей)
          const rest = {};
          for (const k in bones) rest[k] = bones[k].rotation.clone();

          // Тач-зоны: создаём невидимые сферы на корпусе для raycast
          const zones = [];
          function addZone(name, x, y, z, r){
            const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6),
              new THREE.MeshBasicMaterial({visible:false, depthWrite:false}));
            m.position.set(x, y, z); m.userData.zone = name;
            fbx.add(m); zones.push(m);
          }
          addZone("head", 0, 1.2, 0, .25);
          addZone("body", 0, .85, 0, .3);
          addZone("armL", -.35, .9, 0, .15);
          addZone("armR", .35, .9, 0, .15);
          addZone("legs", 0, .4, 0, .25);
          addZone("face", 0, 1.25, .15, .15);

          const hero = {
            group: fbx, bones, face: {}, zones, rest, gender: "f",
            isFBX: true, mixer, _clips, _actions,
            playAnim, fxAura: "", _equipSprites: [], _clothesFBX: {},
            setLevel(){},
            async _loadClothesFBX(slot, url, bone){
              if (!bone || this._clothesFBX[slot]) return;
              this._clothesFBX[slot] = {loading: true};
              try {
                const mesh = await loadClothesAsset(url);
                mesh.traverse(c => { if (c.isMesh){ c.castShadow = true; c.receiveShadow = true } });
                fitClothesFBX(mesh);
                bone.add(mesh);
                const eq = GS?.S?.equipped;
                mesh.visible = !!eq?.[slot];
                this._clothesFBX[slot] = {mesh, loaded: true};
                console.log(`[clothes] ${slot} loaded. GS.S=${!!GS?.S} equipped=${eq?.[slot]||"—"} → visible=${mesh.visible}`);
                mesh.traverse(c => { if (c.isMesh) console.log(`[clothes] mesh "${c.name}" skinned=${!!c.isSkinnedMesh}`) });
                setTimeout(() => {
                  const wp = new THREE.Vector3(); bone.getWorldPosition(wp);
                  const bb = new THREE.Box3().setFromObject(mesh);
                  console.log(`[clothes] ${slot} slotWorld=(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)}) worldBox y=[${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}] x=[${bb.min.x.toFixed(2)}..${bb.max.x.toFixed(2)}] visible=${mesh.visible}`);
                }, 1500);
              } catch(e){
                console.warn("[Hero] clothes load fail", slot, e);
                const fb = skirtFallback(bone);
                this._clothesFBX[slot] = {mesh: fb, loaded: true};
                const eq = GS?.S?.equipped;
                fb.visible = !!eq?.[slot];
          Bus.emit("api:error", "3D-юбка (FBX) не загрузилась — нарисовал процедурную. Ошибка: "+e.message);
              }
            },
            setEquip(equipped, defOf){
              this._equipSprites.forEach(s => s.parent && s.parent.remove(s));
              this._equipSprites = [];
              const put = (slotBone, id, scale) => {
                const it = defOf(id); if (!it) return;
                const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                  map:Engine.emojiTex(it.emoji), transparent:true, depthWrite:false}));
                sp.scale.setScalar(scale); slotBone.add(sp);
                this._equipSprites.push(sp);
              };
              if (equipped.hat && bones.hatSlot) put(bones.hatSlot, equipped.hat, .6);
              if (equipped.face && bones.faceSlot) put(bones.faceSlot, equipped.face, .45);
              /* 3D-одежда */
              console.log(`[setEquip] skirt=${equipped.skirt||"—"} entry=${this._clothesFBX.skirt ? (this._clothesFBX.skirt.loaded?"loaded":"loading") : "none"} slot=${!!bones.skirtSlot}`);
              if (equipped.skirt && bones.skirtSlot){
                if (this._clothesFBX.skirt?.loaded && this._clothesFBX.skirt.mesh)
                  this._clothesFBX.skirt.mesh.visible = true;
                else if (!this._clothesFBX.skirt)
                  this._loadClothesFBX("skirt", "/static/models/clothes/Skirt.glb", bones.skirtSlot);
              } else if (this._clothesFBX.skirt?.mesh) {
                this._clothesFBX.skirt.mesh.visible = false;
              }
              this.fxAura = equipped.fx || "";
            },
          };
          // Добавляем метод загрузки дополнительных анимаций
          hero.loadAnim = async function(url, name){
            return new Promise((resolve, reject) => {
              try {
                const l = new THREE.FBXLoader();
                l.load(url, r => {
                  if (r.animations && r.animations[0]){
                    hero._clips[name] = r.animations[0];
                    resolve();
                  } else reject(new Error("no anim in " + url));
                }, undefined, e => reject(e));
              } catch(e){ reject(e) }
            });
          };
          resolve(hero);
        },
        undefined,
        (err) => {
          console.warn("[Hero] FBX load failed, fallback to procedural", err);
          resolve(build("f"));
        });
      } catch(e){
        console.warn("[Hero] FBX error, fallback to procedural", e);
        resolve(build("f"));
      }
    });
  }

  return { build, loadFBX };
})();