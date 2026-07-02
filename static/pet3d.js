/* pet3d.js — процедурный 3D-питомец на Three.js (r128)
   Круглое существо с ушами, глазами, лапками; мягкий свет, тень,
   idle-дыхание, моргание, прыжок с squash-and-stretch, сон. */
window.Pet3D = (() => {
  let scene, camera, renderer, pet, parts = {}, clock;
  let state = { sleeping:false, mood:1, skin:0, dirty:false };
  let jumpT = -1;

  const SKINS = [0x9a7bff, 0x57c6ff, 0xffa14d, 0x5cf2a0, 0xff7ec2, 0xffd53d];

  function mat(color, rough=.55){ return new THREE.MeshStandardMaterial({color, roughness:rough, metalness:.05}) }

  function build(){
    pet = new THREE.Group();
    const skin = mat(SKINS[0]);
    parts.skinMat = skin;

    // тело — сплюснутая сфера
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), skin);
    body.scale.set(1, 1.12, .95);
    body.castShadow = true;
    parts.body = body; pet.add(body);

    // живот — светлое пятно
    const belly = new THREE.Mesh(new THREE.SphereGeometry(.72, 32, 32),
      mat(0xfff4e6, .7));
    belly.position.set(0, -.22, .42); belly.scale.set(1, 1.05, .55);
    pet.add(belly);

    // уши
    const earG = new THREE.ConeGeometry(.3, .75, 24);
    for (const s of [-1, 1]){
      const ear = new THREE.Mesh(earG, skin);
      ear.position.set(.55*s, 1.02, 0); ear.rotation.z = -.5*s;
      ear.castShadow = true;
      parts["ear"+s] = ear; pet.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(.16, .4, 16), mat(0xffb7d0,.8));
      inner.position.set(.55*s, .98, .12); inner.rotation.z = -.5*s;
      pet.add(inner);
    }

    // глаза: белок + зрачок + веко
    for (const s of [-1, 1]){
      const white = new THREE.Mesh(new THREE.SphereGeometry(.21, 24, 24), mat(0xffffff,.35));
      white.position.set(.34*s, .28, .78); pet.add(white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(.1, 16, 16), mat(0x1b1033,.3));
      pupil.position.set(.34*s, .28, .95); pet.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), mat(0xffffff,.2));
      glint.position.set(.30*s+.05, .34, 1.0); pet.add(glint);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(.225, 24, 24, 0, Math.PI*2, 0, Math.PI/2), skin);
      lid.position.set(.34*s, .29, .78); lid.rotation.x = -.35;
      lid.scale.y = .1; // открыты
      parts["lid"+s] = lid; pet.add(lid);
      parts["pupil"+s] = pupil;
    }

    // щёчки
    for (const s of [-1, 1]){
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 16), mat(0xff7ea0,.9));
      cheek.position.set(.6*s, .0, .72); cheek.scale.set(1,.7,.4);
      parts["cheek"+s] = cheek; pet.add(cheek);
    }

    // рот — тор-сегмент, гнём поворотом (улыбка/грусть)
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.16,.035,10,24,Math.PI), mat(0x1b1033,.4));
    mouth.position.set(0, -.08, .9); mouth.rotation.z = Math.PI; // улыбка
    parts.mouth = mouth; pet.add(mouth);

    // лапки
    for (const s of [-1, 1]){
      const foot = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 20), skin);
      foot.position.set(.5*s, -1.02, .25); foot.scale.set(1,.55,1.1);
      foot.castShadow = true; pet.add(foot);
      const arm = new THREE.Mesh(new THREE.SphereGeometry(.2, 20, 20), skin);
      arm.position.set(.95*s, -.25, .1); arm.scale.set(.8,1.15,.8);
      parts["arm"+s] = arm; pet.add(arm);
    }

    // хвостик
    const tail = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 16), skin);
    tail.position.set(0, -.55, -.95); parts.tail = tail; pet.add(tail);

    // пятна грязи
    parts.dirt = new THREE.Group();
    [[.4,-.4,.8],[-.5,-.15,.75],[.1,-.75,.7]].forEach(([x,y,z])=>{
      const d = new THREE.Mesh(new THREE.SphereGeometry(.12,10,10), mat(0x6b5636,.9));
      d.position.set(x,y,z); d.scale.set(1,.8,.3); parts.dirt.add(d);
    });
    parts.dirt.visible = false; pet.add(parts.dirt);

    pet.position.y = .15;
    scene.add(pet);
  }

  function init(mount){
    scene = new THREE.Scene();
    clock = new THREE.Clock();
    const w = mount.clientWidth, h = mount.clientHeight;
    camera = new THREE.PerspectiveCamera(35, w/h, .1, 50);
    camera.position.set(0, 1.1, 6.2); camera.lookAt(0, .2, 0);
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xcdb9ff, 0x2a1b52, .9));
    const key = new THREE.DirectionalLight(0xffffff, .9);
    key.position.set(2.5, 4, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024,1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8c6bff, .5);
    rim.position.set(-3, 2, -3); scene.add(rim);
    parts.rim = rim;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(20,20),
      new THREE.ShadowMaterial({opacity:.32}));
    ground.rotation.x = -Math.PI/2; ground.position.y = -1.18;
    ground.receiveShadow = true; scene.add(ground);

    build();
    let nextBlink = 2;
    (function loop(){
      requestAnimationFrame(loop);
      const t = clock.getElapsedTime();
      const dt = clock.getDelta();

      if (state.sleeping){
        pet.position.y = .05 + Math.sin(t*1.2)*.03;
        pet.rotation.z = .12;
        setLids(1);
      } else {
        pet.rotation.z = 0;
        // idle: дыхание + лёгкое покачивание
        const br = 1 + Math.sin(t*2.2)*.02;
        parts.body.scale.set(1*br, 1.12/br, .95*br);
        pet.position.y = .15 + Math.sin(t*2.2)*.04;
        pet.rotation.y = Math.sin(t*.6)*.12;
        // уши шевелятся
        parts["ear-1"].rotation.z = .5 + Math.sin(t*3)*.06;
        parts["ear1"].rotation.z = -.5 - Math.sin(t*3+1)*.06;
        parts.tail && (parts.tail.position.y = -.55 + Math.sin(t*4)*.05);
        // моргание
        if (t > nextBlink){
          setLids(1);
          setTimeout(()=>!state.sleeping && setLids(0), 130);
          nextBlink = t + 2.6 + Math.random()*2.4;
        }
        // прыжок
        if (jumpT >= 0){
          jumpT += dt*2.4;
          if (jumpT >= 1){ jumpT = -1 }
          else {
            const k = Math.sin(jumpT*Math.PI);
            pet.position.y = .15 + k*.9;
            const sq = jumpT < .15 ? 1-.25*(1-jumpT/.15) : jumpT > .85 ? 1-.25*((jumpT-.85)/.15) : 1+.08*k;
            pet.scale.set(2-sq, sq, 2-sq).multiplyScalar(.5+sq*.5);
            pet.scale.set(1/sq**.4, sq, 1/sq**.4);
          }
        } else pet.scale.set(1,1,1);
      }
      renderer.render(scene, camera);
    })();

    new ResizeObserver(()=>{
      const w2 = mount.clientWidth, h2 = mount.clientHeight;
      if(!w2||!h2) return;
      camera.aspect = w2/h2; camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    }).observe(mount);
  }

  function setLids(v){ // 0 открыты, 1 закрыты
    for (const s of [-1,1]) parts["lid"+s].scale.y = .1 + v*1.0;
  }

  function setState(S){
    state.sleeping = S.sleeping;
    const skinIdx = Math.min(SKINS.length-1, Math.floor((S.level-1)/4));
    parts.skinMat.color.setHex(SKINS[skinIdx]);
    const worst = Math.min(S.hunger, S.fun);
    // рот: улыбка (rotation.z=PI) / прямой / грусть (0)
    parts.mouth.rotation.z = S.sleeping ? Math.PI : worst>=70 ? Math.PI : worst>=35 ? Math.PI : 0;
    parts.mouth.scale.set(worst>=35?1:.8, worst>=70?1:.55, 1);
    for (const s of [-1,1]) parts["cheek"+s].visible = worst>=70 && !S.sleeping;
    parts.dirt.visible = S.clean < 40;
    if (S.sleeping) setLids(1); else setLids(0);
  }

  function jump(){ if (jumpT < 0 && !state.sleeping) jumpT = 0 }

  return { init, setState, jump };
})();
