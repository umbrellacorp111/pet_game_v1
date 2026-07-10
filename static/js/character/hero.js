/* character/hero.js — живой герой. Процедурный риг (по умолчанию)
   или загрузка FBX-модели через loadFBX(). */
console.log("%c[hero.js] BUILD-MARKER v8-boneByName", "background:#e0218a;color:#fff;font-size:14px;padding:2px 6px;border-radius:4px");
window.Hero = (() => {
  const SKIN = 0xffd9b8, DARK = 0x1b1033;
  const LEVEL_ACCENT = [0x8b6bff, 0x4fc3ff, 0xffa14d, 0x4ef0bc, 0xff7ec2, 0xffc93c];

  /* ===================== РЕЕСТР 3D-ОДЕЖДЫ =====================
     Чтобы добавить новую 3D-вещь:
       1) положи модель в static/models/clothes/ (лучше .glb/.gltf, можно .fbx);
       2) добавь сюда строку: ключ = id предмета (как в SHOP/ARENA_SHOP в bot.py);
       3) укажи url, anchor (куда крепить) и, если нужно, параметры подгонки.

     anchor — логический якорь, каждый герой сам находит свою кость:
       "head"   — макушка (шапки, шлемы, короны)
       "face"   — перед лица (очки, маски)
       "pelvis" — бёдра (юбки, штаны, пояс)
       "spine"  — торс/грудь (куртки, плащи, броня)
       "feet"   — обе стопы (обувь) — модель клонируется и зеркалится
       "hands"  — обе кисти (перчатки) — модель клонируется и зеркалится
       "back"   — спина (крылья, рюкзак, накидка)

     Параметры подгонки (все опциональны):
       keep       — regex: какие меши файла оставить (остальное = тело/мусор — выпилить)
       height     — целевая высота вещи в метрах (авто-масштаб под неё)
       color      — если задан, красим вещь в этот цвет (у бесплатных ассетов текстуры битые)
       yOff/zOff  — доводка посадки по вертикали/вперёд-назад
  */
  const CLOTHES_3D = {
    // юбка (уже была) — теперь просто строка реестра
    skirt_pleated: {url:"/static/models/clothes/Skirt.glb", anchor:"pelvis",
                    keep:/skirt|pleat|dress|skort/i, height:.42, color:0xffc0d0, zOff:.06},
    // ПРИМЕРЫ (раскомментируй и положи файлы, чтобы включить):
    // hat_crown:   {url:"/static/models/clothes/Crown.glb",  anchor:"head",  keep:/crown|hat|cap/i,   height:.22, color:0xffb300, yOff:.02},
    // gl_cool:     {url:"/static/models/clothes/Glasses.glb", anchor:"face",  keep:/glass|shade|lens/i, height:.09, color:0x1b1033, zOff:.02},
    // boots_1:     {url:"/static/models/clothes/Boots.glb",   anchor:"feet",  keep:/boot|shoe|foot/i,   height:.18, color:0x2e3350},
    // gloves_1:    {url:"/static/models/clothes/Gloves.glb",  anchor:"hands", keep:/glove|hand|mitt/i,  height:.12, color:0x2e3350},
    // jacket_1:    {url:"/static/models/clothes/Jacket.glb",  anchor:"spine", keep:/jacket|coat|top/i,  height:.5,  color:0xf2f4fa},
    // wings_1:     {url:"/static/models/clothes/Wings.glb",   anchor:"back",  keep:/wing|cape/i,        height:.6,  color:0xffffff, zOff:-.12},
  };
  const has3D = id => !!CLOTHES_3D[id];

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
  function fitClothesFBX(fbx, {keepRe = /skirt|pleat|dress|skort/i, targetHeight = .42, forward = .06, fitColor = 0xffc0d0, mode = "hang", up = 0} = {}){
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
      /* режим посадки по вертикали относительно точки крепления (y=0):
           hang   — верх вещи у слота, свисает вниз (юбка, куртка, плащ)
           sit    — низ вещи у слота, торчит вверх (шапка, обувь)
           center — центр вещи в слоте (очки, перчатки) */
      let yFit = -box.max.y*scale;                      // hang
      if (mode === "sit")    yFit = -box.min.y*scale;
      else if (mode === "center") yFit = -center.y*scale;
      fbx.position.set(-center.x*scale, yFit + up, -center.z*scale + forward);
      console.log(`[fitClothesFBX] mode=${mode} scale=${scale.toFixed(6)} position=(${fbx.position.x.toFixed(4)}, ${fbx.position.y.toFixed(4)}, ${fbx.position.z.toFixed(4)})`);
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

  /* Обёртка над fitClothesFBX: переводит конфиг из реестра CLOTHES_3D
     (keep/height/color/zOff/mode) в параметры подгонки. Режим посадки
     по умолчанию зависит от якоря: шапка/обувь встают низом на точку
     (sit), очки/перчатки центрируются, остальное свисает вниз (hang). */
  function fitClothes(src, cfg){
    const defMode = {head:"sit", feet:"sit", face:"center", hands:"center"}[cfg.anchor] || "hang";
    fitClothesFBX(src, {
      keepRe: cfg.keep || /skirt|pleat|dress|skort|hat|cap|crown|glass|boot|shoe|glove|jacket|coat|wing|cape/i,
      targetHeight: cfg.height || .42,
      forward: cfg.zOff != null ? cfg.zOff : .06,
      fitColor: cfg.color != null ? cfg.color : 0xffc0d0,
      mode: cfg.mode || defMode,
      up: cfg.yOff || 0,
    });
  }

  /* Проходит по всей экипировке и для каждой вещи с 3D-моделью:
     грузит (лениво), показывает надетую, прячет снятую. Работает для
     обоих героев — они предоставляют _loadClothes3D / _setClothesVisible. */
  function applyClothes3D(hero, equipped){
    const onIds = new Set(Object.values(equipped || {}).filter(has3D));
    // показать/догрузить надетые
    onIds.forEach(id => {
      const rec = hero._clothesFBX[id];
      if (rec?.loaded) hero._setClothesVisible(id, true);
      else if (!rec) hero._loadClothes3D(id);
    });
    // спрятать снятые, но уже загруженные
    for (const id in hero._clothesFBX){
      if (!onIds.has(id) && hero._clothesFBX[id]?.loaded)
        hero._setClothesVisible(id, false);
    }
  }

  /* Кости скинового FBX живут в своём (масштабированном) пространстве:
     нода mixamorig:Hips стоит на y≈22 в мире, хотя видимое тело — рост ~2.
     Скиннинг компенсирует это bind-матрицами, но всё, что добавлено к
     кости как child, компенсацию не получает и улетает к «настоящей»
     позиции ноды. Поэтому одежда крепится к корню героя, а её позиция
     каждый кадр пересчитывается тем же преобразованием, каким скиннинг
     ставит вершины: boneMatrixWorld × boneInverse (из Skeleton). */
  function makeBoneFollower(root, bone, holder, yOff = 0){
    const v = new THREE.Vector3(), m = new THREE.Matrix4();
    /* Ищем скиновый меш, в скелете которого есть кость бедра.
       Сравниваем ПО ИМЕНИ, а не по ссылке: в FBX-сцене бывают
       кости-дубликаты, и инстанс из обхода сцены (BONE_MAP) не обязан
       совпадать с инстансом внутри Skeleton скинового меша. */
    let sm = null, idx = -1;
    const want = (bone && bone.name ? bone.name : "hips").toLowerCase();
    /* 1-й проход — точное имя кости; 2-й — фолбэк на hips (только если
       нужную не нашли). Раньше `|| /hips$/` цеплял ВСЁ к бёдрам, из-за
       чего одежда для головы/ног/рук уезжала на таз. */
    root.traverse(c => {
      if (sm || !c.isSkinnedMesh || !c.skeleton) return;
      const bs = c.skeleton.bones;
      for (let i = 0; i < bs.length; i++){
        if ((bs[i].name || "").toLowerCase() === want){ sm = c; idx = i; break; }
      }
    });
    if (!sm) root.traverse(c => {
      if (sm || !c.isSkinnedMesh || !c.skeleton) return;
      const bs = c.skeleton.bones;
      for (let i = 0; i < bs.length; i++){
        if (/hips$/.test((bs[i].name || "").toLowerCase())){ sm = c; idx = i; break; }
      }
    });
    if (sm){
      const skel = sm.skeleton, jbone = skel.bones[idx];
      console.log(`[boneFollower] режим=skeleton mesh="${sm.name}" bone="${jbone.name}" idx=${idx}`);
      /* Полная визуальная матрица сустава — то же преобразование, каким
         скиннинг ставит вершины на экране:
           visual = meshWorld × bindMatrixInverse × (boneWorld × boneInverse)
         Раньше отсюда бралась только ПОЗИЦИЯ, поэтому одежда следовала за
         точкой бёдер, но не крутилась вместе с телом — «висела в воздухе».
         Теперь берём и позицию, и поворот (decompose), а масштаб сустава
         игнорируем: у меша уже свой масштаб из fitClothesFBX. */
      /* bind-позиция сустава в его собственном пространстве — нужна, чтобы
         получить ПОЗИЦИЮ сустава (m — это скиннинг-трансформация вершин;
         её трансляция ≠ позиция сустава, позиция = m, применённая к pBind). */
      const pBind = new THREE.Vector3().setFromMatrixPosition(
        m.copy(skel.boneInverses[idx]).invert());
      const _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3();
      const _pm = new THREE.Matrix4();
      const _pPos = new THREE.Vector3(), _pQuat = new THREE.Quaternion(), _pScl = new THREE.Vector3();
      let logged = false;
      return () => {
        /* свежие мировые матрицы: тик синхрона идёт ДО render(), где
           scene.updateMatrixWorld() их пересчитает — иначе читали бы
           позу прошлого кадра (дрожание/запаздывание). */
        jbone.updateWorldMatrix(true, false);
        sm.updateWorldMatrix(true, false);
        m.multiplyMatrices(jbone.matrixWorld, skel.boneInverses[idx]);
        m.premultiply(sm.bindMatrixInverse);
        m.premultiply(sm.matrixWorld);
        m.decompose(_pos, _quat, _scl);          // _quat — верный поворот сустава
        _pos.copy(pBind).applyMatrix4(m);        // _pos — ПОЗИЦИЯ сустава в мире
        if (!logged){ logged = true;
          console.log(`[boneFollower] visual hips world=(${_pos.x.toFixed(2)},${_pos.y.toFixed(2)},${_pos.z.toFixed(2)})`); }
        const par = holder.parent;
        par.updateWorldMatrix(true, false);
        /* мир → локаль родителя holder: позицию — обратной матрицей,
           поворот — обратным кватернионом родителя. decompose берём
           отдельно, т.к. setFromRotationMatrix ломается на матрице с
           масштабом (у FBX-корня масштаб не единичный). */
        _pm.copy(par.matrixWorld).invert();
        _pos.applyMatrix4(_pm);
        par.matrixWorld.decompose(_pPos, _pQuat, _pScl);
        _quat.premultiply(_pQuat.invert());
        holder.position.set(_pos.x, _pos.y + yOff, _pos.z);
        holder.quaternion.copy(_quat);
      };
    }
    /* Скелет с бедром не нашли — статичная посадка: бёдра ≈ 56% высоты
       видимого габарита героя. Юбка не следует за анимацией, но стоит
       на своём месте. */
    const bb = new THREE.Box3().setFromObject(root);
    const c0 = new THREE.Vector3(); bb.getCenter(c0);
    const hipWorld = new THREE.Vector3(c0.x, bb.min.y + (bb.max.y - bb.min.y) * 0.56, c0.z);
    console.log(`[boneFollower] режим=static bbox y=[${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}] → hips world y=${hipWorld.y.toFixed(2)}`);
    return () => {
      v.copy(hipWorld);
      holder.parent.worldToLocal(v);
      holder.position.set(v.x, v.y + yOff, v.z);
    };
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
    /* якоря для остальной 3D-одежды */
    bones.spineSlot = piv(spine, 0, .35, .05);              // торс/грудь
    bones.backSlot  = piv(spine, 0, .4, -.22);              // спина (крылья/накидка)
    bones.footSlotL = piv(bones.knL, 0, -.44, .06);        // левая стопа
    bones.footSlotR = piv(bones.knR, 0, -.44, .06);        // правая стопа
    bones.handSlotL = piv(bones.elL, 0, -.31, 0);          // левая кисть
    bones.handSlotR = piv(bones.elR, 0, -.31, 0);          // правая кисть

    const rest = {};
    for (const k in bones) rest[k] = bones[k].rotation.clone();

    const hero = {
      group: root, bones, face, zones, rest, gender, isFBX: false,
      fxAura: "", _equipSprites: [], _clothesFBX: {},
      setLevel(level){
        const idx = Math.min(LEVEL_ACCENT.length-1, Math.floor((level-1)/4));
        badge.material.color.setHex(LEVEL_ACCENT[idx]);
      },
      /* процедурный герой: якорь → массив костей (парные — две кости) */
      _anchorBones(anchor){
        switch(anchor){
          case "head":   return [{bone:bones.hatSlot}];
          case "face":   return [{bone:bones.faceSlot}];
          case "pelvis": return [{bone:bones.skirtSlot}];
          case "spine":  return [{bone:bones.spineSlot}];
          case "back":   return [{bone:bones.backSlot}];
          case "feet":   return [{bone:bones.footSlotL, mirror:true}, {bone:bones.footSlotR}];
          case "hands":  return [{bone:bones.handSlotL, mirror:true}, {bone:bones.handSlotR}];
          default:       return [{bone:bones.skirtSlot}];
        }
      },
      /* грузит 3D-вещь по id из реестра CLOTHES_3D и вешает на нужные кости */
      async _loadClothes3D(id){
        const cfg = CLOTHES_3D[id];
        if (!cfg || this._clothesFBX[id]) return;
        this._clothesFBX[id] = {loading: true, parts: []};
        const anchors = this._anchorBones(cfg.anchor);
        try {
          const src = await loadClothesAsset(cfg.url);
          fitClothes(src, cfg);
          const eq = GS?.S?.equipped;
          const on = eq && Object.values(eq).includes(id);
          const parts = [];
          anchors.forEach((a, i) => {
            const mesh = i === 0 ? src : src.clone(true);
            if (a.mirror) mesh.scale.x *= -1;      // зеркалим для второй ноги/руки
            mesh.traverse(c => { if (c.isMesh){ c.castShadow = true; c.receiveShadow = true } });
            mesh.visible = on;
            a.bone.add(mesh);
            parts.push(mesh);
          });
          this._clothesFBX[id] = {parts, loaded: true};
          console.log(`[clothes] ${id} (proc) loaded on ${cfg.anchor} → visible=${on}`);
        } catch(e){
          console.warn("[Hero] clothes load fail", id, e);
          this._clothesFBX[id] = {parts: [], loaded: true};
          Bus.emit("api:error", `3D-вещь «${id}» не загрузилась. ${e.message}`);
        }
      },
      _setClothesVisible(id, on){
        const rec = this._clothesFBX[id];
        if (rec?.parts) rec.parts.forEach(m => m.visible = on);
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
        /* emoji-иконки для слотов без 3D-модели (совместимость) */
        if (equipped.hat && !has3D(equipped.hat)) put(hatSlot, equipped.hat, .5);
        if (equipped.face && !has3D(equipped.face)) put(faceSlot, equipped.face, .38);
        applyClothes3D(this, equipped);
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
            /* FBX-герой: якорь → массив реальных костей Mixamo (парные —
               две кости). Одежда крепится не к кости-ребёнку (её бы унесло
               в масштабированное пространство скелета), а к holder-у на
               корне, который каждый кадр повторяет визуальную позу кости. */
            _anchorBones(anchor){
              const B = bones;
              switch(anchor){
                case "head":   return [B.head].filter(Boolean);
                case "face":   return [B.head].filter(Boolean);
                case "pelvis": return [B.pelvis].filter(Boolean);
                case "spine":  return [B.spine || B.pelvis].filter(Boolean);
                case "back":   return [B.spine || B.pelvis].filter(Boolean);
                case "feet":   return [B.footL, B.footR].filter(Boolean);
                case "hands":  return [B.handL, B.handR].filter(Boolean);
                default:       return [B.pelvis].filter(Boolean);
              }
            },
            async _loadClothes3D(id){
              const cfg = CLOTHES_3D[id];
              if (!cfg || this._clothesFBX[id]) return;
              this._clothesFBX[id] = {loading: true, parts: []};
              const anchorBones = this._anchorBones(cfg.anchor);
              if (!anchorBones.length){ this._clothesFBX[id] = {parts: [], loaded: true}; return; }
              /* holder на корне + follower за костью; синхрон — в тик движка
                 (ДО render(), после mixer.update()), а не на onBeforeRender:
                 иначе поза отстаёт на кадр и одежда дрожит/висит. */
              const holders = anchorBones.map(b => {
                const h = new THREE.Group(); fbx.add(h);
                const sync = makeBoneFollower(fbx, b, h, -0.1);
                sync();
                return {h, sync};
              });
              const _syncTick = () => {
                const rec = this._clothesFBX[id];
                if (!rec?.parts?.length || !rec.parts[0].visible) return;
                holders.forEach(o => o.sync());
              };
              Engine.onTick(_syncTick);
              try {
                const src = await loadClothesAsset(cfg.url);
                fitClothes(src, cfg);
                const eq = GS?.S?.equipped;
                const on = eq && Object.values(eq).includes(id);
                const parts = [];
                holders.forEach((o, i) => {
                  const mesh = i === 0 ? src : src.clone(true);
                  /* парные вещи (обувь/перчатки) — вторую зеркалим по X */
                  if (i > 0 && (cfg.anchor === "feet" || cfg.anchor === "hands")) mesh.scale.x *= -1;
                  mesh.traverse(c => { if (c.isMesh){ c.castShadow = true; c.receiveShadow = true } });
                  mesh.visible = on;
                  o.h.add(mesh);
                  parts.push(mesh);
                });
                this._clothesFBX[id] = {parts, loaded: true};
                console.log(`[clothes] ${id} (fbx) loaded on ${cfg.anchor} → visible=${on}`);
              } catch(e){
                console.warn("[Hero] clothes load fail", id, e);
                this._clothesFBX[id] = {parts: [], loaded: true};
                Bus.emit("api:error", `3D-вещь «${id}» (FBX) не загрузилась. ${e.message}`);
              }
            },
            _setClothesVisible(id, on){
              const rec = this._clothesFBX[id];
              if (rec?.parts) rec.parts.forEach(m => m.visible = on);
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
              /* emoji-иконки для слотов без 3D-модели (совместимость) */
              if (equipped.hat && bones.hatSlot && !has3D(equipped.hat)) put(bones.hatSlot, equipped.hat, .6);
              if (equipped.face && bones.faceSlot && !has3D(equipped.face)) put(bones.faceSlot, equipped.face, .45);
              applyClothes3D(this, equipped);
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

  /* ---------- загрузка VRM (VRoid Studio) ----------
     VRM 0.0 = glTF 2.0 со скиннингом, грузится штатным GLTFLoader.
     Одежда заскинена на общий скелет → гнётся с телом, клиппинга нет.
     Кости VRoid (J_Bip_*) сопоставляем логическим именам движка, чтобы
     работал существующий процедурный аниматор. Эти константы можно
     подкрутить по скриншоту (масштаб/разворот/опускание рук). */
  const VRM_SCALE  = 1.15;      // VRoid ~1.5 м → под масштаб сцены (~1.7 ед.)
  const VRM_FACE_Y = Math.PI;   // разворот лицом к камере (VRM0 смотрит от неё)
  const VRM_ARM_DOWN = 1.15;    // опускание рук из T-позы в A-позу (рад)

  async function loadVRM(url){
    return new Promise((resolve) => {
      new THREE.GLTFLoader().load(url, gltf => {
        try {
          const scene = gltf.scene;
          scene.rotation.y = VRM_FACE_Y;
          scene.scale.setScalar(VRM_SCALE);
          scene.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false } });

          const root = new THREE.Group();
          root.add(scene);

          /* VRM-карта: логическое имя кости → имя ноды в файле */
          const hum = (gltf.parser?.json?.extensions?.VRM?.humanoid?.humanBones) || [];
          const nodes = gltf.parser?.json?.nodes || [];
          const nodeName = {};
          hum.forEach(b => { if (nodes[b.node]) nodeName[b.bone] = nodes[b.node].name });
          const findByName = n => { let r = null; scene.traverse(o => { if (!r && o.name === n) r = o }); return r; };
          const boneOf = vrmName => { const nm = nodeName[vrmName]; return nm ? findByName(nm) : null; };

          const bones = { root };
          const MAP = {
            pelvis:"hips", spine:"spine", chest:"chest", neck:"neck", head:"head",
            thL:"leftUpperLeg", thR:"rightUpperLeg", knL:"leftLowerLeg", knR:"rightLowerLeg",
            footL:"leftFoot", footR:"rightFoot",
            shL:"leftUpperArm", shR:"rightUpperArm", elL:"leftLowerArm", elR:"rightLowerArm",
          };
          for (const k in MAP){ const b = boneOf(MAP[k]); if (b) bones[k] = b; }
          /* заглушки для обязательных костей, чтобы аниматор не падал */
          ["pelvis","spine","neck","head","thL","thR","knL","knR","shL","shR","elL","elR"]
            .forEach(k => { if (!bones[k]){ const g = new THREE.Group(); root.add(g); bones[k] = g } });

          /* опускаем руки из T-позы (VRoid стоит руки в стороны) */
          if (bones.shL) bones.shL.rotation.z -= VRM_ARM_DOWN;
          if (bones.shR) bones.shR.rotation.z += VRM_ARM_DOWN;

          /* слоты для жёстких аксессуаров (шапки/очки как emoji-спрайты) */
          const hatSlot = new THREE.Group(); hatSlot.position.set(0, .16, 0);
          (bones.head || root).add(hatSlot); bones.hatSlot = hatSlot;
          const faceSlot = new THREE.Group(); faceSlot.position.set(0, .04, .12);
          (bones.head || root).add(faceSlot); bones.faceSlot = faceSlot;

          const rest = {};
          for (const k in bones) rest[k] = bones[k].rotation.clone();

          /* невидимые тач-зоны для raycast (высоты под ~1.7-ед. модель) */
          const zones = [];
          const addZone = (name, x, y, z, r) => {
            const mz = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6),
              new THREE.MeshBasicMaterial({visible:false, depthWrite:false}));
            mz.position.set(x, y, z); mz.userData.zone = name; root.add(mz); zones.push(mz);
          };
          addZone("head", 0, 1.55, 0, .22); addZone("face", 0, 1.55, .18, .14);
          addZone("body", 0, 1.05, 0, .3);
          addZone("armL", -.32, 1.1, 0, .15); addZone("armR", .32, 1.1, 0, .15);
          addZone("legs", 0, .5, 0, .28);

          const hero = {
            group: root, bones, face: {}, zones, rest, gender: "f",
            isFBX: false, isVRM: true, fxAura: "", _equipSprites: [], _clothesFBX: {},
            setLevel(){},
            _loadClothes3D(){}, _setClothesVisible(){}, _anchorBones(){ return [] },
            setEquip(equipped, defOf){
              this._equipSprites.forEach(s => s.parent && s.parent.remove(s));
              this._equipSprites = [];
              const put = (slotBone, id, scale) => {
                const it = defOf(id); if (!it || !slotBone) return;
                const sp = new THREE.Sprite(new THREE.SpriteMaterial({
                  map:Engine.emojiTex(it.emoji), transparent:true, depthWrite:false}));
                sp.scale.setScalar(scale); slotBone.add(sp);
                this._equipSprites.push(sp);
              };
              /* одежда (юбки/обувь и т.п.) вшита в VRM — тут только
                 жёсткие аксессуары как иконки над головой */
              if (equipped.hat) put(bones.hatSlot, equipped.hat, .5);
              if (equipped.face) put(bones.faceSlot, equipped.face, .38);
              this.fxAura = equipped.fx || "";
            },
          };
          console.log("%c[hero.js] VRM loaded", "background:#4ef0bc;color:#000;padding:2px 6px");
          resolve(hero);
        } catch(e){
          console.warn("[Hero] VRM parse fail, fallback to procedural", e);
          resolve(build("f"));
        }
      }, undefined, err => {
        console.warn("[Hero] VRM load failed, fallback to procedural", err);
        resolve(build("f"));
      });
    });
  }

  return { build, loadFBX, loadVRM };
})();