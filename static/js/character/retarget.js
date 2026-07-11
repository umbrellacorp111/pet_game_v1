/* character/retarget.js — перенос Mixamo-анимаций (FBX) на VRM/VRoid.
   Портировано с официального примера three-vrm loadMixamoAnimation.

   Идея: локальный поворот каждой Mixamo-кости переводится в «мировую
   дельту от rest-позы»:  q' = P · q · R⁻¹,
   где P — мировой поворот РОДИТЕЛЯ кости в rest-позе Mixamo-рига,
       R — мировой поворот САМОЙ кости в rest-позе.
   У VRM 0.x (VRoid) кости в rest не повёрнуты (T-поза, оси костей
   совпадают с осями модели), поэтому эту дельту можно применять напрямую
   как локальный поворот соответствующей VRM-кости.

   VRM0 смотрит в -Z, Mixamo — в +Z, поэтому всё разворачивается на 180°
   вокруг Y: у кватерниона меняется знак x и z, у позиции — знак x и z.
   Позиция переносится только для бёдер (root-motion), с масштабом по
   отношению высот бёдер VRM/Mixamo. */
window.Retarget = (() => {

  /* Mixamo-кость (без префикса mixamorig) → гуманоидная кость VRM */
  const M2V = {
    Hips:"hips", Spine:"spine", Spine1:"chest", Spine2:"upperChest",
    Neck:"neck", Head:"head",
    LeftShoulder:"leftShoulder",  LeftArm:"leftUpperArm",
    LeftForeArm:"leftLowerArm",   LeftHand:"leftHand",
    RightShoulder:"rightShoulder",RightArm:"rightUpperArm",
    RightForeArm:"rightLowerArm", RightHand:"rightHand",
    LeftUpLeg:"leftUpperLeg",   LeftLeg:"leftLowerLeg",
    LeftFoot:"leftFoot",        LeftToeBase:"leftToes",
    RightUpLeg:"rightUpperLeg", RightLeg:"rightLowerLeg",
    RightFoot:"rightFoot",      RightToeBase:"rightToes",
    /* пальцы (если есть и в клипе, и в модели) */
    LeftHandThumb1:"leftThumbProximal",  LeftHandThumb2:"leftThumbIntermediate",  LeftHandThumb3:"leftThumbDistal",
    LeftHandIndex1:"leftIndexProximal",  LeftHandIndex2:"leftIndexIntermediate",  LeftHandIndex3:"leftIndexDistal",
    LeftHandMiddle1:"leftMiddleProximal",LeftHandMiddle2:"leftMiddleIntermediate",LeftHandMiddle3:"leftMiddleDistal",
    LeftHandRing1:"leftRingProximal",    LeftHandRing2:"leftRingIntermediate",    LeftHandRing3:"leftRingDistal",
    LeftHandPinky1:"leftLittleProximal", LeftHandPinky2:"leftLittleIntermediate", LeftHandPinky3:"leftLittleDistal",
    RightHandThumb1:"rightThumbProximal",  RightHandThumb2:"rightThumbIntermediate",  RightHandThumb3:"rightThumbDistal",
    RightHandIndex1:"rightIndexProximal",  RightHandIndex2:"rightIndexIntermediate",  RightHandIndex3:"rightIndexDistal",
    RightHandMiddle1:"rightMiddleProximal",RightHandMiddle2:"rightMiddleIntermediate",RightHandMiddle3:"rightMiddleDistal",
    RightHandRing1:"rightRingProximal",    RightHandRing2:"rightRingIntermediate",    RightHandRing3:"rightRingDistal",
    RightHandPinky1:"rightLittleProximal", RightHandPinky2:"rightLittleIntermediate", RightHandPinky3:"rightLittleDistal",
  };

  /* Mixamo экспортирует кости как "mixamorig:Hips", иногда "mixamorigHips" */
  function nodeOf(root, base){
    return root.getObjectByName("mixamorig:" + base) ||
           root.getObjectByName("mixamorig"  + base) ||
           root.getObjectByName(base);
  }

  /* fbx         — корень, который вернул FBXLoader (внутри rest-поза рига);
     clip        — AnimationClip из этого же FBX;
     vrmNodeName — fn(имяVRMкости) → имя ноды в сцене VRM (или null);
     vrmHipsY    — высота бёдер VRM в координатах модели (до scale). */
  function mixamoToVRM(fbx, clip, vrmNodeName, vrmHipsY){
    fbx.updateWorldMatrix(true, true);
    const tracks = [];
    const restRotInv = new THREE.Quaternion();
    const parentRest = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    const hips = nodeOf(fbx, "Hips");
    const hipsScale = (hips && Math.abs(hips.position.y) > 1e-6)
      ? (vrmHipsY / hips.position.y) : .01;

    clip.tracks.forEach(track => {
      const dot = track.name.lastIndexOf(".");
      if (dot < 0) return;
      const mixamoName = track.name.slice(0, dot);
      const prop = track.name.slice(dot + 1);
      const base = mixamoName.replace(/^mixamorig[:]?\d*/, "");
      const vrmBone = M2V[base];
      if (!vrmBone) return;
      const target = vrmNodeName(vrmBone);
      if (!target) return;
      const mNode = fbx.getObjectByName(mixamoName);
      if (!mNode) return;

      if (prop === "quaternion"){
        mNode.getWorldQuaternion(restRotInv).invert();
        if (mNode.parent) mNode.parent.getWorldQuaternion(parentRest);
        else parentRest.set(0,0,0,1);
        const src = track.values, vals = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 4){
          q.set(src[i], src[i+1], src[i+2], src[i+3]);
          q.premultiply(parentRest).multiply(restRotInv);
          /* VRM0: разворот на 180° вокруг Y */
          vals[i] = -q.x; vals[i+1] = q.y; vals[i+2] = -q.z; vals[i+3] = q.w;
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(
          target + ".quaternion", track.times.slice(), vals));
      }
      else if (prop === "position" && vrmBone === "hips"){
        const src = track.values, vals = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 3){
          vals[i]   = -src[i]   * hipsScale;
          vals[i+1] =  src[i+1] * hipsScale;
          vals[i+2] = -src[i+2] * hipsScale;
        }
        tracks.push(new THREE.VectorKeyframeTrack(
          target + ".position", track.times.slice(), vals));
      }
    });

    if (!tracks.length)
      throw new Error("Retarget: в клипе не нашлось mixamorig-дорожек, подходящих костям VRM");
    return new THREE.AnimationClip("retarget", clip.duration, tracks);
  }

  return { mixamoToVRM };
})();
