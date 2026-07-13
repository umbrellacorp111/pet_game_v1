/* character/stickman.js — процедурный стикмэн-боец (док. дungeon-файтинг).
   Лёгкий риг из примитивов + синусоидальная анимация (idle/attack/hurt/block/death).
   Не требует внешних ассетов; позже заменяется на VRM/FBX без изменения логики боя. */
window.Stickman = (() => {
  const PALETTE = [0x101018, 0x1a1030, 0x2a0a18, 0x07203a, 0x11301a, 0x2a2410];
  const matFor = c => new THREE.MeshStandardMaterial({color:c, roughness:.55, metalness:.1});
  function limb(geo, mat){ const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; }
  // капсула для совместимости со старыми three (r128 нет CapsuleGeometry): цилиндр + 2 сферы
  function capsule(r, len, mat){
    const grp = new THREE.Group();
    const h = Math.max(0.001, len);                 // высота цилиндра между центрами сфер
    const cyl = limb(new THREE.CylinderGeometry(r, r, h, 10), mat);
    const top = limb(new THREE.SphereGeometry(r, 10, 8), mat); top.position.y = h/2;
    const bot = limb(new THREE.SphereGeometry(r, 10, 8), mat); bot.position.y = -h/2;
    grp.add(cyl, top, bot);
    return grp;
  }

  function build(opts={}){
    const color = opts.color != null ? opts.color : PALETTE[Math.floor(Math.random()*PALETTE.length)];
    const scale = opts.scale || 1;
    const mat = matFor(color);
    const g = new THREE.Group();

    const head = limb(new THREE.SphereGeometry(.17,16,12), mat); head.position.y = 1.5;
    const torso = capsule(.15, .5, mat); torso.position.y = 1.05;
    const armL = capsule(.06, .5, mat); armL.position.set(-.26,1.15,0);
    const armR = capsule(.06, .5, mat); armR.position.set(.26,1.15,0);
    const legL = capsule(.07, .55, mat); legL.position.set(-.12,.45,0);
    const legR = capsule(.07, .55, mat); legR.position.set(.12,.45,0);
    g.add(head, torso, armL, armR, legL, legR);
    g.scale.setScalar(scale);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });

    // "оружие" — палка в правой руке (у боссов длиннее)
    let weapon = null;
    if (opts.weapon){
      weapon = limb(new THREE.CylinderGeometry(.03,.03, opts.weapon,6), matFor(0xcfd6e6));
      weapon.position.set(0,-.32,0);
      armR.add(weapon);
    }

    const st = {
      group: g, head, torso, armL, armR, legL, legR, weapon,
      color, scale: scale, ph: Math.random()*6.28,
      state: "idle", t: 0, dead: false, faceLeft: !!opts.faceLeft,
      flash: 0, baseColor: color,
    };
    g.userData.st = st;
    animTick(st, 0, 0);
    return st;
  }

  function setPose(st, p){
    st.armL.rotation.x = p.aL; st.armR.rotation.x = p.aR;
    st.legL.rotation.x = p.lL; st.legR.rotation.x = p.lR;
    st.torso.rotation.x = p.tx; st.head.rotation.x = p.hx;
    st.group.position.y = p.y;
  }
  const idle = {aL:.25, aR:.25, lL:0, lR:0, tx:0, hx:0, y:0};
  const POSES = {
    attack:{aL:-.5, aR:-1.9, lL:.1, lR:-.1, tx:.18, hx:-.12, y:.06},
    hurt:{aL:.9, aR:.9, lL:-.2, lR:.2, tx:-.18, hx:.18, y:-.05},
    block:{aL:-1.1, aR:-1.1, lL:0, lR:0, tx:.05, hx:0, y:0},
    dead:{aL:1.4, aR:1.4, lL:.7, lR:-.7, tx:-.3, hx:.2, y:-.35},
  };

  function animTick(st, dt, t){
    if (st.dead){ setPose(st, POSES.dead); st.group.rotation.z = .5; return; }
    st.t += dt;
    if (st.flash > 0){
      st.flash -= dt*4; const k = Math.max(0, st.flash);
      st.torso.material.color.setRGB(1, .3+k*.7, .3+k*.7);
      if (st.flash <= 0) st.torso.material.color.setHex(st.baseColor);
    }
    // поворот к противнику
    const targetRot = st.faceLeft ? Math.PI : 0;
    st.group.rotation.y += (targetRot - st.group.rotation.y) * Math.min(1, dt*8);

    let pose;
    if (st.state === "attack"){
      const k = Math.min(1, st.t/0.22);
      const e = k<.5 ? k*2 : (1-k)*2;            // выпад вперёд и назад
      pose = lerpPose(idle, POSES.attack, Math.sin(k*Math.PI));
      st.group.position.x += (st.faceLeft ? -1 : 1) * e * .25 * dt * 8;
      if (st.t > 0.34){ st.state = "idle"; }
    } else if (st.state === "hurt"){
      pose = lerpPose(idle, POSES.hurt, Math.sin(Math.min(1,st.t/0.25)*Math.PI));
      if (st.t > 0.3) st.state = "idle";
    } else if (st.state === "block"){
      pose = POSES.block;
    } else {
      // лёгкое дыхание
      const b = Math.sin(t*1.6 + st.ph);
      pose = {...idle, y: b*.03, aL: idle.aL + b*.05, aR: idle.aR - b*.05, hx: b*.04};
    }
    setPose(st, pose);
  }

  function lerpPose(a, b, k){
    const o = {};
    for (const kk in a) o[kk] = a[kk] + (b[kk]-a[kk]) * k;
    return o;
  }

  function attack(st){ if (st.dead) return; st.state = "attack"; st.t = 0; }
  function hurt(st){ if (st.dead) return; st.state = "hurt"; st.t = 0; st.flash = 1; }
  function block(st, on){ if (st.dead) return; st.state = on ? "block" : "idle"; }
  function die(st){ st.dead = true; st.flash = 1; }

  return { build, animTick, attack, hurt, block, die, PALETTE };
})();
