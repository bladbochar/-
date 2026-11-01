// Scalar regression tests for Grosse prototypes; not an engine/in-game test.
// Run: node Tools/Tests/grosse_recoil.test.mjs [repository-root] [--camera]
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(process.argv[2] ?? '.');
const camera = process.argv.includes('--camera');
const load = file => {
  const full = path.join(root, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : execFileSync('git', ['-c', 'safe.directory='+root.replaceAll('\\','/'), 'show', 'HEAD:'+file], {cwd: root, encoding:'utf8'});
};
const prefix = 'Resources/Prototypes/';
const local = prefix+'_Grosse/Entities/Objects/Weapons/Guns/';
const files = ['Entities/Objects/Weapons/Guns/Basic/base_wieldable.yml','Entities/Objects/Weapons/Guns/Rifles/rifles.yml','Entities/Objects/Weapons/Guns/LMGs/lmgs.yml','Entities/Objects/Weapons/Guns/SMGs/smgs.yml'].map(x=>prefix+x).concat(['Ammunition/Rifles/rifles.yml','Lmgs/lmgs.yml','Energy/energy.yml','SMGs/smgs.yml'].map(x=>local+x));
const prototypes = new Map();
// Read only root entities, component names, parents and numeric scalar fields.
// Non-scalar YAML (sprites, slots, !type tags) is deliberately left to the engine linter.
for (const file of files) for (const block of load(file).replaceAll('\r','').split(/^- type: entity\s*$/m).slice(1)) {
  const id = block.match(/^  id: (\S+)/m)?.[1];
  if (!id) continue;
  const parents = (block.match(/^  parent: (.+)/m)?.[1] ?? '').replace(/[\[\]]/g,'').split(',').map(x=>x.trim()).filter(Boolean);
  const components = {};
  for (const match of block.matchAll(/^  - type: (\w+)\n([\s\S]*?)(?=^  - type: |$(?![\s\S]))/gm)) {
    assert.ok(!components[match[1]], 'duplicate component '+id+':'+match[1]);
    const values = {};
    for (const field of match[2].matchAll(/^    (\w+): (-?\d+(?:\.\d+)?)\s*(?:#.*)?$/gm)) values[field[1]] = Number(field[2]);
    components[match[1]] = values;
  }
  prototypes.set(id,{parents,components});
}
function resolve(id, seen = new Set()) {
  if (seen.has(id)) throw Error('inheritance cycle '+id);
  const proto = prototypes.get(id);
  if (!proto) return {}; // BaseItem has no gun-related fields.
  const result = {};
  for (const parent of proto.parents) for (const [type, fields] of Object.entries(resolve(parent,new Set([...seen,id])))) result[type] = {...result[type],...fields};
  for (const [type, fields] of Object.entries(proto.components)) result[type] = {...result[type],...fields};
  return result;
}
const defaults = {minAngle:1,maxAngle:2,angleIncrease:0.5,angleDecay:4,fireRate:8,cameraRecoilScalar:1};
const ids = ['WeaponAKMSRifleResistance','WeaponRifleAKSUResistance','WeaponLightMachineGunRPD','WeaponPulseRifleAR2C17','WeaponSubMachineGunC17'];
let failed = 0;
function check(name, fn) { try {fn(); console.log('PASS '+name);} catch(e) {failed++; console.log('FAIL '+name+': '+e.message);} }
for (const id of ids) check(id+' burst/spread',()=> {
  const c = resolve(id), g = {...defaults,...c.Gun};
  for (const wield of [false,true]) {
    const b = wield ? c.GunWieldBonus ?? {} : {};
    const min = g.minAngle+(b.minAngle??0), max = g.maxAngle+(b.maxAngle??0);
    const increase = g.angleIncrease+(b.angleIncrease??0), decay = g.angleDecay+(b.angleDecay??0);
    assert.ok(min>=0 && max>=min && increase>0 && decay>0, 'valid recoil bounds');
    // SharedGunSystem advances NextFire BEFORE Shoot; GetRecoilAngle stores LastFire=NextFire.
    // At exact fire-rate intervals continuous fire therefore has zero decay time.
    let current=0, lastFire=0, shots=[];
    for(let i=0;i<10;i++) {const now=10+i/g.fireRate; current=Math.min(max,Math.max(min,current+increase-decay*(now-lastFire)));lastFire=now+1/g.fireRate;shots.push(current);}
    const paused=Math.min(max,Math.max(min,current+increase-decay*(2-1/g.fireRate)));
    console.log('  '+(wield?'wield':'hip')+' shots 1/3/10='+[shots[0],shots[2],shots[9]].map(x=>x.toFixed(2)).join('/')+' pause2s='+paused.toFixed(2));
    assert.ok(shots[9]-shots[2]>=4, 'long spray must be >=4 degrees wider than a 3-shot burst');
    assert.ok(paused<=min+0.01, '2s pause must restore minimum spread');
  }
});
if(camera) for(const id of [...ids,'WeaponCMBKineticAccelerator17']) check(id+' camera',()=>{
  const c=resolve(id), g={...defaults,...c.Gun}, b=c.GrosseGunWieldBonus;
  assert.ok(b, 'per-gun camera component');
  const cap=b.kickMagnitudeMax??6;
  const hip=g.cameraRecoilScalar, wield=hip+(b.cameraRecoilScalar??1);
  assert.ok(wield>=2 && hip>=4 && wield<=hip, 'stronger kick with wield advantage');
  let kick=0;
  for(let i=0;i<100;i++){kick+=0.5*hip*(1-kick/cap);assert.ok(Number.isFinite(kick)&&kick<=cap+1e-6);}
  assert.ok(0.5*wield*0.35>0, 'kick remains positive at 35% intensity');
  console.log('  hip/wield='+hip+'/'+wield+' cap='+cap);
});
console.log(failed ? 'RESULT FAIL ('+failed+')' : 'RESULT PASS');
process.exitCode=failed?1:0;
