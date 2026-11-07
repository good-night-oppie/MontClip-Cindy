'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../embed/panel-model.js');
test('all engine keyframe channels have Chinese labels, including hue blur and duck',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../engine/app.js'),'utf8');const keys=JSON.parse(app.match(/const ANIMATABLE = (\[[\s\S]*?\]);/)[1]);
 for(const key of keys){assert.doesNotMatch(M.propName(key),/[a-zA-Z]/,key);assert.notEqual(M.propName(key),'其他属性',key);}
 assert.equal(M.propName('hue'),'色相（度）');assert.equal(M.propName('blur'),'模糊（像素）');assert.equal(M.propName('duck'),'自动压低音量（分贝）');
});
test('unknown keyframe properties never expose their internal identifiers',()=>{assert.equal(M.propName('internalNewField'),'其他属性');assert.equal(M.propName('internalNewField','en'),'Other property');const f=M.clipFacts({clips:[{id:'v',kind:'video',start:0,duration:1,keyframes:{hue:[{t:0,v:1}],blur:[{t:0,v:2}],duck:[{t:0,v:-3}]}}]},'v');assert.deepEqual(f.keyframes,['色相（度）','模糊（像素）','自动压低音量（分贝）']);});
