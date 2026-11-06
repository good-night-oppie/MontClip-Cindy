'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {safeTree,noLinks}=require('../node/trial-paths.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'trial-path-race-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
test('a browser directory disappearing after enumeration does not fail a task request',t=>{
 const root=fixture(t),temp=path.join(root,'CRX_INSTALL');fs.mkdirSync(temp);
 const original=fs.readdirSync;
 fs.readdirSync=function(p,...args){if(p===temp){fs.rmdirSync(temp);}return original.call(this,p,...args);};
 try{assert.doesNotThrow(()=>safeTree(root));}finally{fs.readdirSync=original;}
});
test('a path disappearing during ancestor inspection is harmless',t=>{
 const root=fixture(t),temp=path.join(root,'CRX_INSTALL');fs.mkdirSync(temp);
 const original=fs.lstatSync;
 fs.lstatSync=function(p,...args){if(p===temp&&fs.existsSync(temp))fs.rmdirSync(temp);return original.call(this,p,...args);};
 try{assert.doesNotThrow(()=>noLinks(temp));}finally{fs.lstatSync=original;}
});
test('permission errors are not swallowed as transient disappearance',t=>{
 const root=fixture(t),original=fs.readdirSync;
 fs.readdirSync=function(p,...args){if(p===root)throw Object.assign(Error('denied'),{code:'EACCES'});return original.call(this,p,...args);};
 try{assert.throws(()=>safeTree(root),{code:'EACCES'});}finally{fs.readdirSync=original;}
});
test('a linked directory is still rejected',t=>{
 const root=fixture(t),target=fixture(t);fs.symlinkSync(target,path.join(root,'linked'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>safeTree(root),{code:'ROOT_CONFLICT'});
});
