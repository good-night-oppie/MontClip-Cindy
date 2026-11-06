# trial.10 → trial.11 原包完整差异与MediaPipe限定复核

QQ评论6681341904仅通过trial.10的MediaPipe一致性；本文件请求确认trial.11相同限定范围，不迁移旧批准，不申请安装/启用/替换/合并。

| 原包 | SHA256 | SOURCE plugin | engine |
|---|---|---|---|
| trial.10 | 4fbb3168f87e2156983f2f29ea06e3829ca3c76d06d8813416978cd341c03e4d | e5b495d824fd299b60323ad40c05d47d31fda985 | c2fe5ca345ef76572c6f3522f1d0d0f51c16d416 |
| trial.11 | c12c07753bfc5371b56bd2db06dae8b124b855880839c3a643037d63e531e8e2 | 4ea220074f635bfc0c493ee80dac274a23f9b3cb | d563ed80bb7b22a816c41a93dd18862ebd6179a2 |

比较全部357个非目录ZIP条目：无新增、无删除；353个字节完全一致，仅下列4个文件变化。ZIP压缩元数据不作为运行代码差异。

## SOURCE.json

trial.10 SHA256 8edb4ea05a94ebb6e6bc16c49042ec272fc94cbd4d97d7cf7f748124442fc898
trial.11 SHA256 c804ad7a010fef708413751f16b2a9bb986c9e4c56e50a9445375e4418e69a06

完整文件文本差异：
```diff
--- trial10/SOURCE.json
+++ trial11/SOURCE.json
@@ -1,11 +1,11 @@
 {
   "plugin": {
     "repository": "https://github.com/good-night-oppie/MontClip-Cindy.git",
-    "commit": "e5b495d824fd299b60323ad40c05d47d31fda985",
+    "commit": "4ea220074f635bfc0c493ee80dac274a23f9b3cb",
     "dirty": false
   },
   "engine": {
     "repository": "https://github.com/good-night-oppie/MontClip.git",
-    "commit": "c2fe5ca345ef76572c6f3522f1d0d0f51c16d416"
+    "commit": "d563ed80bb7b22a816c41a93dd18862ebd6179a2"
   }
 }
```

## ghost.json

trial.10 SHA256 56e60b9b8a41ba138b90d182ed5c0373d04aab041854a6af63d0faea7fa42f6b
trial.11 SHA256 f82338695fda449704a6c321b29a331733d4ac28c8415ee222306804c1e821cd

完整文件文本差异：
```diff
--- trial10/ghost.json
+++ trial11/ghost.json
@@ -5,8 +5,8 @@
   "name": "MontClip 候选试用",
   "description": "在 Cindy 任务里打开 MontClip 剪辑器，跟聊天并排。直接跟 AI 说怎么剪本机的录像和音频：删一段、剪掉停顿、加字幕、调音量、降噪、导出 MP4。每一步都能撤销、重做，也能回到以前的版本。MontClip 在这台电脑上运行，会读写这台电脑上的文件。",
   "whenToUse": "需要剪辑本机录像或音频时：删掉某段、剪掉停顿、按文字剪、加字幕、调音量、降噪、按节拍剪、导出 MP4；撤销或重做剪辑；查看或回到 MontClip 项目的某个版本；在这个任务里打开 MontClip 剪辑器。",
-  "version": "0.5.1-trial.10",
-  "releaseNotes": "移植固定版本的 MediaPipe 九项资源校验、页面接入及许可记录。当前仅待审候选；新增失败提示待 JJ，QQ 当前增量审查待，不安装、启用或替换。",
+  "version": "0.5.1-trial.11",
+  "releaseNotes": "采用 JJ 最终序列上限提示，显示值与拒绝条件共用 SeqLib.MAX。保留 trial.10 资源校验；QQ 增量审查及抠像新失败提示定稿仍待。不安装、启用或替换。",
   "entry": "main.js",
   "command": "候选剪辑",
   "icon": "assets/icon.png",
```

## node/app/app.js

trial.10 SHA256 e46c9acc04af1b4b06a529502bfd92034df39ae44316ac7b80ab2c12ad849e43
trial.11 SHA256 68110a4dede68c86262cd7973b6b2367bd03e1c15372470645279943098edac8

完整文件文本差异：
```diff
--- trial10/node/app/app.js
+++ trial11/node/app/app.js
@@ -23734,7 +23734,7 @@
   if(step.version)await step.version;
   if(!MontClipProposal.current(proposal,projectJSON(),{...agentProjectContext(),generation:agentProjectContext().gen})){if(ev)moveEvent(ev.id,'rejected');toast(uiText('own.ap-stale'));return;}
   const token=crypto.randomUUID(),r=await runAgentReframe(aspect,{eventId:ev&&ev.id,token});
-  if(!r.ok){if(ev)moveEvent(ev.id,r.code==='CANCELLED'?'rejected':'failed');toast(uiText('own.rf-'+({CANCELLED:'cancelled',CHANGED:'changed',NOTHING:'nothing',BUSY:'busy',SEQUENCE_LIMIT:'sequence-limit'}[r.code]||'failed'),{aspect})+(r.code==='FAILED'&&r.name?' '+uiText('own.rf-failed-name',{name:r.name}):''));return;}
+  if(!r.ok){if(ev)moveEvent(ev.id,r.code==='CANCELLED'?'rejected':'failed');toast(uiText('own.rf-'+({CANCELLED:'cancelled',CHANGED:'changed',NOTHING:'nothing',BUSY:'busy',SEQUENCE_LIMIT:'sequence-limit'}[r.code]||'failed'),{aspect,limit:SeqLib.MAX})+(r.code==='FAILED'&&r.name?' '+uiText('own.rf-failed-name',{name:r.name}):''));return;}
   const c=agentProjectContext();
   officialProposalApplications.set(result,{token,projectId:c.projectId,sequenceId:c.sequenceId,gen:c.gen,eventId:ev&&ev.id});
   toast(uiText('own.rf-done',{aspect,name:shownName(r.name)}));
```

## node/app/ui-preferences.js

trial.10 SHA256 46c29cda930ce5e1bbadb8bd7d983c4607b99adb87f39073f4a8288ef2b18dbc
trial.11 SHA256 c235a9d2f5ff88b242ed072bc787c8d4138997a984d44a7833ee9ad2a17527f8

完整文件文本差异：
```diff
--- trial10/node/app/ui-preferences.js
+++ trial11/node/app/ui-preferences.js
@@ -810,7 +810,7 @@
     "rf-busy": ["Something else is running (an export, or another reframe). Try again when it's done.", "现在有别的事在进行（导出，或者另一个改比例），等它做完再试。"],
     "rf-failed": ["The footage couldn't be read, so no sequence was made.", "画面读不出来，所以没有新建序列。"],
     // 待 JJ 定稿 (2026-11-06).
-    "rf-sequence-limit": ["This project already has 64 sequences. Remove an unneeded sequence, then try again.", "这个工程已有 64 个序列，暂时不能再新建。请先删除一个不需要的序列，再试。"],
+    "rf-sequence-limit": ["This project already has {limit} sequences. Remove an unneeded sequence, then try again.", "这个工程已有 {limit} 个序列，暂时不能再新建。请先删除一个不需要的序列，再试。"],
     // added after rf-failed when the clip whose file couldn't be opened is known: its name as the bin shows it, no path. 待 JJ 定稿
     "rf-failed-name": ["The clip that couldn't be opened is “{name}”.", "打不开的素材是「{name}」。"],
     "rf-same": ["The sequence already has that shape; there is nothing to make.", "这个序列已经是这个比例了，不用再做。"],
```

## MediaPipe相关完整文件
| 路径 | trial.10/trial.11共同SHA256 |
|---|---|
| bgremove-assets.js | 830344bd778b200d5b9a8489e15409a79eb0a344f135a44eaf1033969b477bed |
| licenses/mediapipe/LICENSE | c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 |
| licenses/mediapipe/README.md | 988547a0a11169e5d06893643de90b16834523ee2770a849d896f924c7629aeb |
| LICENSES.md | f76b7f013b7e5ccdc4b6ef05c97c0be48026fc382563b262ca2cbe35eec1e609 |
| index.html | 66edf05cb2a1f9b2eb5e02e079196b036eb7d3d402fbe48282c848d4f98b18c5 |

## app.js八段（两包及已批准主仓3bf4f508三方逐字一致）
| 片段 | 统一文本SHA256 |
|---|---|
| BG_REMOVE_HOSTS | 3e4faf54e337fec5de6601c5a70facf9a04e5ff10beed6b2cfdd8ef7015da04d |
| loadScript | 2aeb025b2d236164e2123bdc65f4fd1729a2929563e063c7d969dac9c2e69278 |
| ensureBgSeg | eb44c843194ca1d4da118f0d91320b8d11d77a893522f564852f39f0f016953f |
| requestBgRemove | cb8b9928f2be76d4ef8b3f0340fffdf870a1ba380e67c439b66509680f70d3f5 |
| noteBgRemove | 1c185325e80ab13e072bf9bb79c4f0f26aae82661fbd45cf6f08e3fe9eea77d8 |
| bgRemoveExportError | 7dae27844e94778293c4d00aed0455745977dd98a216a33fdf4034a6ab33e49f |
| noteExportBgRemove | 254443ebbbd3b8872701cff06798175ad5fb4971d455269a4ac7775609c57f00 |
| askNetConsent | 8eaa4c0f810b30d702d6fadd98dfa19c632555170038738d2b0d04e08f796733 |

index.html完整文件相同，故loader在app前的顺序不变；LICENSES.md完整文件相同，MediaPipe一节不变（与主仓差异仍只是既有FFmpeg说明）。ui-preferences完整diff只为rf-sequence-limit，抠像提示仍原草稿。

复核结论（作者证据，非QQ批准）：运行代码仅#175上限参数/定稿模板两行变化，ghost.json仅版本/releaseNotes，SOURCE仅plugin/engine提交。没有新增资源文件、wasm或模型。主仓来源64ef89f5最小移植→engine d563ed80；不依赖#176整头。

本包既有定向6/6、插件103/103、解包文案1/1保留；本轮仅原包差异核验，没有重复下载/模型执行/全媒体测试，原包未重打。真实模型、JJ抠像失败句/同意框剩余句、GUI切换/截断及Video流程仍未验。

文档head不等于包SOURCE；trial.11仍绑定4ea220074f635bfc0c493ee80dac274a23f9b3cb。
