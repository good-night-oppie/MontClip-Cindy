'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function refuse(message){throw Object.assign(Error('ROOT_CONFLICT: '+message),{code:'ROOT_CONFLICT'});}
function noLinks(target){
 let p=path.resolve(target);
 for(;;){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())refuse('linked path is not a trial directory');const up=path.dirname(p);if(up===p)break;p=up;}
 return path.resolve(target);
}
function inside(a,b){const rel=path.relative(a,b);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function resolveRoot({home=os.homedir(),env=process.env}={}){
 const root=noLinks(env.MONTCLIP_CANDIDATE_DATA||path.join(home,'MontClip-Cindy-Candidate'));
 const reserved=[path.join(home,'MontClip-Cindy'),path.join(home,'MontClip'),path.join(home,'FableCut'),env.MONTCLIP_CINDY_DATA].filter(Boolean).map(p=>path.resolve(p));
 if(reserved.some(p=>inside(p,root)||inside(root,p)))refuse('reserved legacy data root');
 if(fs.existsSync(root)){
  const files=fs.readdirSync(root),marker=path.join(root,'candidate-identity.json');
  if(files.length&&(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker)).id!=='montclip-candidate'))refuse('existing directory has no candidate identity');
 }
 return root;
}
function safeTree(root){noLinks(root);if(!fs.existsSync(root))return;for(const e of fs.readdirSync(root,{withFileTypes:true})){const p=path.join(root,e.name);if(e.isSymbolicLink())refuse('linked candidate contents');if(e.isDirectory())safeTree(p);}}
function exportDestination(target,{root,ownDir,home=os.homedir(),env=process.env}){
 const dest=noLinks(target);for(const old of [path.join(home,'MontClip-Cindy'),path.join(home,'MontClip'),path.join(home,'FableCut'),env.MONTCLIP_CINDY_DATA].filter(Boolean))if(inside(path.resolve(old),dest)||inside(dest,path.resolve(old)))refuse('export destination overlaps legacy data');
 if(inside(root,dest)&&!inside(ownDir,dest))refuse('export destination belongs to another candidate task');
 let p=dest;for(;;){const marker=path.join(p,'candidate-identity.json');if(fs.existsSync(marker)&&p!==root)refuse('export destination belongs to another candidate instance');const up=path.dirname(p);if(up===p)break;p=up;}return dest;
}
module.exports={resolveRoot,noLinks,safeTree,exportDestination};
