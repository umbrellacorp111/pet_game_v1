/* character/hero.js — живой герой (док. 005/007).
   Процедурный риг из пивот-групп: root→pelvis→spine→neck→head,
   плечи/локти, бёдра/колени, хвост волос (secondary motion).
   Модульное лицо: глаза (зрачки/веки), брови, рот (+открытый), щёки-румянец.
   Тач-зоны на мешах (userData.zone). Слоты экипировки. */
window.Hero = (() => {
  const SKIN = 0xffd9b8, DARK = 0x1b1033;
  const LEVEL_ACCENT = [0x8b6bff, 0x4fc3ff, 0xffa14d, 0x4ef0bc, 0xff7ec2, 0xffc93c];

  const M = (color, rough=.6) => new THREE.MeshStandardMaterial({color, roughness:rough, metalness:.05});

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

    /* --- таз и ноги --- */
    const pelvis = piv(root, 0, .98, 0); bones.pelvis = pelvis;
    const hipMesh = zone(new THREE.Mesh(new THREE.SphereGeometry(.26, 24, 20), legM), "body");
    hipMesh.scale.set(1.05,.7,.85); hipMesh.castShadow = true; pelvis.add(hipMesh);
    if (g){ // юбка-силуэт
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

    /* --- корпус --- */
    const spine = piv(pelvis, 0, .1, 0); bones.spine = spine;
    const torso = zone(new THREE.Mesh(new THREE.CylinderGeometry(.23,.28,.6,20), topM), "body");
    torso.position.y = .3; torso.castShadow = true; spine.add(torso);
    const chest = zone(new THREE.Mesh(new THREE.SphereGeometry(.245,20,16), topM), "body");
    chest.position.y = .56; chest.scale.set(1,.7,.85); chest.castShadow = true; spine.add(chest);
    // значок-акцент (цвет = тир уровня)
    const badge = new THREE.Mesh(new THREE.CircleGeometry(.05, 16), M(LEVEL_ACCENT[0], .3));
    badge.position.set(g?-.12:.12, .52, .235); spine.add(badge);

    /* --- руки --- */
    for (const s of [-1,1]){
      const sh = piv(spine, .3*s, .56, 0);
      const upper = zone(new THREE.Mesh(new THREE.CylinderGeometry(.07,.06,.32,14), topM), s<0?"armL":"armR");
      upper.position.y = -.16; upper.castShadow = true; sh.add(upper);
      const el = piv(sh, 0, -.32, 0);
      const fore = zone(new THREE.Mesh(new THREE.CylinderGeometry(.055,.05,.28,14), skin), s<0?"armL":"armR");
      fore.position.y = -.14; fore.castShadow = true; el.add(fore);
      const hand = zone(new THREE.Mesh(new THREE.SphereGeometry(.07,14,12), skin), s<0?"armL":"armR");
      hand.position.y = -.31; el.add(hand);
      sh.rotation.z = .1*s; // руки чуть в стороны
      bones[s<0?"shL":"shR"] = sh; bones[s<0?"elL":"elR"] = el;
    }

    /* --- шея и голова --- */
    const neck = piv(spine, 0, .72, 0); bones.neck = neck;
    const nMesh = new THREE.Mesh(new THREE.CylinderGeometry(.07,.08,.1,12), skin);
    nMesh.position.y = .03; neck.add(nMesh);
    const head = piv(neck, 0, .12, 0); bones.head = head;
    const skull = zone(new THREE.Mesh(new THREE.SphereGeometry(.3, 32, 28), skin), "head");
    skull.position.y = .22; skull.scale.set(.95,1.05,.95); skull.castShadow = true; head.add(skull);

    /* волосы */
    const hair = new THREE.Group(); head.add(hair);
    const cap = zone(new THREE.Mesh(new THREE.SphereGeometry(.315,28,22,0,Math.PI*2,0,Math.PI*.62), hairM), "head");
    cap.position.y = .26; cap.scale.set(1,1.02,1); hair.add(cap);
    for (let i=0;i<3;i++){ // чёлка
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
      // очки — как у героя на референс-стиле
      const gl = new THREE.Group(); head.add(gl);
      for (const s of [-1,1]){
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.085,.012,8,20), M(DARK,.3));
        rim.position.set(.12*s, .26, .27); gl.add(rim);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(.07,.015,.015), M(DARK,.3));
      bridge.position.set(0,.27,.28); gl.add(bridge);
    }

    /* лицо */
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
    mouth.position.set(0, .13, .28); mouth.rotation.z = Math.PI; // улыбка
    head.add(mouth); face.mouth = mouth;
    const mouthOpen = new THREE.Mesh(new THREE.SphereGeometry(.045,12,10), M(0x77323f,.4));
    mouthOpen.position.set(0,.115,.27); mouthOpen.scale.set(1,.01,.5);
    head.add(mouthOpen); face.mouthOpen = mouthOpen;
    // невидимая тач-зона лица (крупнее для пальца)
    const faceHit = zone(new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),
      new THREE.MeshBasicMaterial({visible:false})), "face");
    faceHit.position.set(0,.24,.22); head.add(faceHit);

    /* слоты экипировки */
    const hatSlot = piv(head, 0, .58, .02); bones.hatSlot = hatSlot;
    const faceSlot = piv(head, 0, .26, .36); bones.faceSlot = faceSlot;

    /* запоминаем rest-позу */
    const rest = {};
    for (const k in bones) rest[k] = bones[k].rotation.clone();

    const hero = {
      group: root, bones, face, zones, rest, gender,
      fxAura: "", _equipSprites: [],
      setLevel(level){
        const idx = Math.min(LEVEL_ACCENT.length-1, Math.floor((level-1)/4));
        badge.material.color.setHex(LEVEL_ACCENT[idx]);
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
        this.fxAura = equipped.fx || "";
      },
    };
    return hero;
  }

  return { build };
})();
