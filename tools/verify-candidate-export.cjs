'use strict';
// Optional real compositor export from the built package. Uses synthetic media only.
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {execFileSync}=require('node:child_process');
const {startServer,seedProject}=require('../engine/test/helpers');
const FF=require('../engine/ffmpeg-path');
for (const format of (process.argv.includes('--flv') ? ['mp4','flv'] : ['mp4'])) test('packed compositor exports synthetic '+format+' video and audio to MP4', {timeout:180000}, async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'montclip-candidate-export-'));
 fs.mkdirSync(path.join(dir,'media'));
 const media=path.join(dir,'media','synthetic.'+format);
 execFileSync(FF.path('ffmpeg'),['-v','error','-y','-f','lavfi','-i',"color=black:s=320x180:r=30:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable=gte(t\\,1)",'-f','lavfi','-i',"aevalsrc=if(gte(t\\,1)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=2",'-c:v',format==='flv'?'flv':'libx264','-pix_fmt','yuv420p','-c:a',format==='flv'?'libmp3lame':'aac','-shortest',media]);
 fs.writeFileSync(path.join(dir,'project.json'),JSON.stringify(seedProject({name:'candidate synthetic',width:320,height:180,media:[{id:'m_a',name:'synthetic.'+format,kind:'video',src:'/media/synthetic.'+format,duration:2,width:320,height:180,hasAudio:true}],clips:[{id:'c_a',mediaId:'m_a',kind:'video',track:'V1',start:0,in:0,duration:2}]})));
 const {base}=await startServer(t,dir,{FABLECUT_NO_FS_WATCH:'1',FABLECUT_CHROME:process.env.FABLECUT_CHROME||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}, {serverJs:path.resolve(__dirname,'../dist/montclip/node/app/server.js')});
 const response=await fetch(base+'/api/export/request',{method:'POST',body:JSON.stringify({where:'headless',range:'entire',delivery:{preset:'custom',width:320,height:180}})});
 let job=await response.json();assert.equal(response.status,200,JSON.stringify(job));
 const end=Date.now()+150000;
 while(!['done','failed','cancelled'].includes(job.status)&&Date.now()<end){await new Promise(r=>setTimeout(r,500));job=await(await fetch(base+'/api/export/job?id='+job.id)).json();}
 assert.equal(job.status,'done',JSON.stringify(job));
 const output=path.join(dir,decodeURIComponent(job.src).replace(/^\//,''));
 const probe=JSON.parse(execFileSync(FF.path('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8'}));
 assert.ok(probe.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264'));
 assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
 assert.ok(Math.abs(Number(probe.format.duration)-2)<0.2);
 const onset = file => {
   const pixels=execFileSync(FF.path('ffmpeg'),['-v','error','-i',file,'-vf','scale=1:1,format=gray','-f','rawvideo','-'],{maxBuffer:1024*1024});
   const pcm=execFileSync(FF.path('ffmpeg'),['-v','error','-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','-'],{maxBuffer:4*1024*1024});
   const frame=pixels.findIndex(v=>v>128);let sample=-1;for(let i=0;i<pcm.length/4;i++)if(Math.abs(pcm.readFloatLE(i*4))>0.05){sample=i;break;}
   assert.ok(frame>=0 && sample>=0);return {video:frame/30,audio:sample/48000,offset:sample/48000-frame/30};
 };
 const sourceSync=onset(media), outputSync=onset(output), deltaMs=(outputSync.offset-sourceSync.offset)*1000;
 assert.ok(Math.abs(deltaMs)<=40, JSON.stringify({sourceSync,outputSync,deltaMs}));
 console.log(JSON.stringify({format,sourceSync,outputSync,deltaMs,output,bytes:fs.statSync(output).size,duration:probe.format.duration,streams:probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name})),ffmpeg:execFileSync(FF.path('ffmpeg'),['-version'],{encoding:'utf8'}).split('\n')[0]}));
});
