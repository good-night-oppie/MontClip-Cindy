/* MontClip in Cindy — the plugin's logic page (browser sandbox, no Node).
   Tools from the chat go to the Node worker, which runs the MontClip engine; the task view asks, over
   BroadcastChannel, where the engine's editor page is (with its session token) and which project is its task's. */

/* The fablecut_* tools grouped for list_tools(category); anything not listed falls in "other". */
const CATEGORIES = {
  project: ['fablecut_status', 'fablecut_docs', 'fablecut_get_project', 'fablecut_patch_project', 'fablecut_set_project', 'fablecut_import_media', 'fablecut_projects', 'fablecut_frame', 'fablecut_scopes'],
  versions: ['fablecut_versions'],
  audio: ['fablecut_normalize_audio', 'fablecut_auto_duck', 'fablecut_silence', 'fablecut_denoise', 'fablecut_beats', 'fablecut_songs'],
  speech: ['fablecut_transcribe', 'fablecut_captions'],
  export: ['fablecut_export', 'fablecut_encode_profiles', 'fablecut_proxy'],
};
const RULES = {
  project: 'Times are seconds on the timeline. To cut a range out of the edit (e.g. "删掉 1:00–1:30"), call fablecut_patch_project with {ops:[{op:"extract", from:60, to:90}]} — extract closes the gap, lift leaves it. Read the timeline with fablecut_get_project {compact:true} first and pass its revision as baseRevision. Every edit becomes one step of the open editor\'s undo stack: montclip_undo / montclip_redo take it back or put it back. Import a large local recording with fablecut_import_media {path, link:true} (no second copy on disk).',
  versions: 'fablecut_versions {action:"list"} lists checkpoints; {action:"save", name} makes one before a big edit; {action:"restore", version} goes back to one — what was there is saved as a version first. Restore only when the user asked.',
  audio: 'These change clip gain / keyframes / cuts in the open project; each is one undo step in the editor.',
  speech: 'Transcription runs on this computer (the speech engine and the Paraformer zh model, after a VAD); the open editor tab or a headless one only relays it. Clips of a long recording are listened to in their windows only; mediaIds (or find over a whole replay) listens to all of it, minutes for hours. montclip_status says whether the engine and the model are installed here; when they are not, fablecut_transcribe says so (ASR_ENGINE_MISSING / ASR_MODEL_MISSING) — tell the user plainly, never fetch them yourself. Captions are text clips timed to the words.',
  export: 'fablecut_export renders in the open editor tab and writes the file into the MontClip data folder (exports/). It needs the pinned ffmpeg: montclip_status says whether it is installed.',
};
const categoryOf = (name) => Object.keys(CATEGORIES).find((c) => CATEGORIES[c].includes(name)) || 'other';

let toolsCache = null;
/* Another MontClip has the same projects open (writer-lock.js): the engine refuses to start. Said in plain words, to the
   page and to the chat, by who it is — JJ's final words (2026-11-04); no pid, no port. The plugin's pages are Chinese
   for now; the English is kept with it (messageEn) for when they follow Cindy's language. */
const DATA_DIR_IN_USE_TEXT = {
  desktop: {
    zh: 'MontClip 桌面版正在用这些项目。两边同时改，会互相盖掉。先把桌面版关掉，再打开这里。找不到桌面版的窗口，就重启电脑再试。',
    en: "The MontClip desktop app is using these projects. If both edit at once, one overwrites the other. Close the MontClip desktop app first, then open this one. If you can't find it, restart the computer and try again.",
  },
  // anything else (a server started by hand, or a holder that cannot be told): the desktop app's own words for it
  other: {
    zh: '另一个 MontClip 窗口正在用这些项目。两边同时改，会互相盖掉。先把那边的 MontClip 关掉，再打开这里。找不到那边的窗口，就重启电脑再试。',
    en: "Another MontClip window is using these projects. If both edit at once, one overwrites the other. Close the other MontClip first, then open this one. If you can't find it, restart the computer and try again.",
  },
};
function engineError(r) {
  const message = String(r.message || 'MontClip engine failed');
  if (/DATA_DIR_IN_USE|Another MontClip \(/.test(message)) {
    const who = /Another MontClip \(([\w-]+),/.exec(message);
    const t = DATA_DIR_IN_USE_TEXT[who && who[1] === 'desktop' ? 'desktop' : 'other'];
    return Object.assign(new Error(t.zh), { code: 'DATA_DIR_IN_USE', messageEn: t.en });
  }
  // a worker's own code (or Node's errno code) comes back in the JSON-RPC error's data (nodeRuntimeBroker.ts L1122)
  return Object.assign(new Error(message), { code: (r.data && typeof r.data.code === 'string' && r.data.code) || r.errorCode || 'NODE_REQUEST_FAILED',
    ...(r.data && Number.isFinite(r.data.need) ? { need: r.data.need } : {}) });
}
async function node(method, params, extra) {
  const r = await cindy.node.request(Object.assign({ method, params: params || {}, timeoutMs: 120000 }, extra || {}));
  if (!r.ok) throw engineError(r);
  return r.result;
}
async function engineTools() {
  if (!toolsCache) toolsCache = (await node('montclip/tools')).tools;
  return toolsCache;
}
/* the engine's answer without the editor's session token (it only goes to the plugin's own pages) */
function publicStart(s) { const o = Object.assign({}, s); delete o.url; return o; }

/* ffmpeg (export, noise reduction): the pinned LGPL build the Windows app bundles, ~160 MB from GitHub, fetched by
   cindy.downloads (given the SHA-256 and exact size) and unpacked by the worker, which measures the size and SHA-256 again and checks it is LGPL.
   One install at a time, whether the chat or the editor tab's banner asked. Progress goes to the plugin's pages. */
let installing = null, lastDownloadPhase = null;
/* Cindy keys its download cache by the download id, and its plugin manual (§4.12) has no call to drop a cached file or
   force a fresh download. So once a downloaded archive fails the worker's check, later attempts ask under a new id
   (ffmpeg-<platform>-r<n>-<time>); a plain download failure keeps the id, so Cindy can resume its partial file. */
const CHECK_FAILED = ["SIZE_MISMATCH", "SHA256_MISMATCH", "BAD_ARCHIVE"];
let checkFailures = 0, retryStamp = "";
const downloadId = (platform) => "ffmpeg-" + platform + (checkFailures ? "-r" + checkFailures + "-" + retryStamp : "");
function installFfmpeg() {
  if (installing) return installing;
  installing = (async () => {
    const spec = await node('montclip/ffmpeg-spec');
    if (!spec.supported) return { error: 'MontClip has no pinned ffmpeg for ' + spec.platform, code: 'UNSUPPORTED_PLATFORM' };
    if (spec.state === 'downloaded') return { installed: true, already: true, version: spec.version };
    if (typeof cindy.downloads !== 'object' || typeof cindy.downloads.start !== 'function')
      return { error: 'This Cindy cannot download files for plugins; update Cindy.', code: 'HOST_TOO_OLD' };
    channel.postMessage({ type: 'ffmpeg-progress', phase: 'queued' });
    lastDownloadPhase = null;
    const d = await cindy.downloads.start({ id: downloadId(spec.platform), url: spec.url, sha256: spec.sha256, bytes: spec.bytes });
    if (!d.ok) {
      // Cindy reports a failed download without a code (downloadSlot.ts L309–316); its progress said whether it was cancelled
      const code = d.errorCode || (lastDownloadPhase === 'cancelled' ? 'CANCELLED' : 'DOWNLOAD_FAILED');
      channel.postMessage({ type: 'ffmpeg-progress', phase: 'failed', code, message: d.message || d.errorCode });
      return { error: d.message || d.errorCode || 'download failed', code };
    }
    channel.postMessage({ type: 'ffmpeg-progress', phase: 'installing' });
    try {
      const out = await node('montclip/ffmpeg-install', {}, { downloadTokens: { archive: d.token }, timeoutMs: 120000 });
      channel.postMessage({ type: 'ffmpeg-progress', phase: 'installed', version: out.version });
      return { download: { bytes: d.bytes, sha256: d.sha256, fromCache: d.fromCache }, install: out };
    } catch (e) {
      if (CHECK_FAILED.includes(e.code)) { checkFailures++; retryStamp = Date.now().toString(36); }
      channel.postMessage({ type: 'ffmpeg-progress', phase: 'failed', code: e.code || 'INSTALL_FAILED', need: e.need, message: String(e.message || e) });
      return { error: String(e.message || e), code: e.code || 'INSTALL_FAILED', ...(e.need ? { need: e.need } : {}) };
    }
  })().finally(() => { installing = null; });
  return installing;
}
/* On-device transcription (P8, Deja 2026-11-05): the speech engine, the VAD and the Paraformer model are downloaded the
   first time, from MontClip's own GitHub release only (node/asr-runtime.json pins url, SHA-256 and bytes), and only
   after the user said yes in the host's own confirm box — where from, how big, under which licences. Nothing is
   fetched before that, and a no is not asked again in other words. The worker measures every file again and puts
   them in place all together or not at all. One install at a time. */
let asrInstalling = null, asrCheckFailures = 0, asrRetryStamp = '';
const asrDownloadId = (name) => ('asr-' + String(name).replace(/[^\w-]+/g, '-') + (asrCheckFailures ? '-r' + asrCheckFailures + '-' + asrRetryStamp : '')).slice(0, 100);
/* The words of the first-use download (JJ's final ones, 2026-11-05): the confirm box and its buttons, the status card's
   button and what the card says after it. The plugin's pages are Chinese for now; the English is kept for when they
   follow the interface language (JJ's English box is longer than the host shows: MontClip-Cindy#8). A button named in
   a sentence comes from its key here, never copied by hand. */
var ASR_TEXT = {   // var: the tests read it from main.js's own scope
  zh: {
    what: { both: '听写程序和中文听写模型', model: '中文听写模型', engine: '听写程序' },
    lead: (what, mb) => '要把说的话转成文字，先要下载' + what + '，共约 ' + mb + ' MB，只下这一次。',
    from: (host) => '从哪下：GitHub 上 MontClip 的发布页（github.com，下载时会转到 ' + host + '）。',
    only: '只下载这些文件，不会发出你的录像、字幕或项目。下载完会逐个核对，对不上就不装。',
    // cindy.confirm shows plain text only (no link, nothing to expand), so the licences are named here, one by one
    licence: { lead: '许可：', sep: '、', end: '。', sherpa: 'sherpa-onnx（Apache-2.0，内含 ONNX Runtime，MIT）', silero: 'silero VAD（MIT）', paraformer: 'Paraformer 中文模型（Apache-2.0）' },
    yes: '下载', no: '先不下',   // JJ, option A: no size on the button, only in the first line
    button: '下载听写程序和模型…',
    installed: '听写程序和模型装好了，现在可以把说的话转成文字。',
    declined: (button) => '没有下载。以后要用，再点〔' + button + '〕就行。',
    tooOld: 'Cindy 版本太旧，没法先问你再下载，所以没有下载。把 Cindy 更新到最新版以后，再点一次。',
    failed: '这次没装上，下了一半的文件已经清掉了。再点一次试试。',
    // shown only once the card has a 〔复制问题信息〕 button (ASR_COPY_BUTTON); it has none yet
    failedMore: '还不行，点〔复制问题信息〕发给我们。',
    dev: '给开发者看（不用管）',
  },
  en: {
    // JJ's shorter English (2026-11-05): within the host's 300 characters; one bracket for the licences (QQ to say if each
    // component needs its own — then "Files are checked first." goes to make room)
    what: { both: 'program + Chinese model', model: 'Chinese model', engine: 'program' },
    lead: (what, mb) => 'Speech-to-text needs a one-time download (' + what + ', about ' + mb + ' MB).',
    from: (host) => 'From: github.com, via ' + host + '.',
    only: 'Your videos, captions and projects are never sent. Files are checked first.',
    licence: { lead: 'Licences: ', sep: ', ', end: ').', open: ' (', sherpa: 'sherpa-onnx, ONNX Runtime', silero: 'silero VAD', paraformer: 'Paraformer',
      of: { sherpa: ['Apache-2.0', 'MIT'], silero: ['MIT'], paraformer: ['Apache-2.0'] } },
    yes: 'Download', no: 'Not now',
    button: 'Download transcription program and model…',
    installed: 'The transcription program and model are installed. You can now turn speech into text.',
    declined: (button) => 'Nothing was downloaded. To use it later, click “' + button + '”.',
    tooOld: 'This version of Cindy is too old to ask you first, so nothing was downloaded. Update Cindy to the latest version, then click again.',
    failed: "It didn't install this time, and the partly downloaded files were removed. Try again.",
    failedMore: 'If it still fails, click “Copy problem details” and send it to us.',
    dev: 'For developers (you can ignore this)',
  },
};
const ASR_COPY_BUTTON = false;   // the status card has no 〔复制问题信息〕 yet: failedMore waits for it
const asrWords = (lang) => ASR_TEXT[lang === 'en' ? 'en' : 'zh'];
/** The confirm box for what this computer still needs: {body, confirmText, cancelText}. N is the worker's spec.mb (the
 *  engine's aboutMb); the file host is the worker's spec.fileHost — the one ghost.json declares besides github.com. */
function asrConsent(spec, lang) {
  const t = asrWords(lang), mb = Math.max(10, +spec.mb || 0), has = (re) => spec.missing.some((i) => re.test(i.name));
  const model = has(/paraformer/i), engine = has(/sherpa|silero/i);
  const parts = [has(/sherpa/i) && 'sherpa', has(/silero/i) && 'silero', model && 'paraformer'].filter(Boolean);
  // zh names each component with its licence; JJ's English names them, then one bracket of their licences
  const licence = t.licence.of
    ? t.licence.lead + parts.map((k) => t.licence[k]).join(t.licence.sep) + t.licence.open +
      ['Apache-2.0', 'MIT'].filter((l) => parts.some((k) => t.licence.of[k].includes(l))).join('/') + t.licence.end
    : t.licence.lead + parts.map((k) => t.licence[k]).join(t.licence.sep) + t.licence.end;
  return {
    body: [t.lead(engine && model ? t.what.both : model ? t.what.model : t.what.engine, mb), t.from(spec.fileHost), t.only, licence].join('\n'),
    confirmText: t.yes, cancelText: t.no,
  };
}
/** What the status card says after its button: installed, declined (ASR_TEXT no), a Cindy too old to ask, or a failure (no code). */
function asrResultText(r, lang) {
  const t = asrWords(lang);
  if (r.installed) return t.installed;
  if (r.declined) return t.declined(t.button);
  if (r.code === 'HOST_TOO_OLD') return t.tooOld;
  return t.failed + (ASR_COPY_BUTTON ? (lang === 'en' ? ' ' : '') + t.failedMore : '');
}
/* The last failure, for the 「给开发者看（不用管）」 line of a copy (the card never shows a code). */
let asrProblem = null;
function asrLastProblem() { return asrProblem; }
function asrCopyText(problem, lang) {
  const t = asrWords(lang), p = problem || {};
  return t.failed + '\n' + t.dev + (lang === 'en' ? ': ' : '：') + (p.code || 'UNKNOWN') + ': ' + String(p.error == null ? '' : p.error);
}
function asrFailed(code, error) {
  asrProblem = { code, error: String(error || ''), at: new Date().toISOString() };
  logProblem(code, error || code);
  return { error: String(error || code), code };
}
function installAsr() {
  if (asrInstalling) return asrInstalling;
  asrInstalling = (async () => {
    const spec = await node('montclip/asr-spec');
    if (!spec.supported) return asrFailed('UNSUPPORTED_PLATFORM', 'MontClip has no speech engine for ' + spec.platform);
    if (!spec.missing.length) return { installed: true, already: true };
    if (typeof cindy.confirm !== 'function' || typeof cindy.downloads !== 'object' || typeof cindy.downloads.start !== 'function')
      return { error: 'This Cindy cannot ask before downloading, or cannot download files for plugins; update Cindy.', code: 'HOST_TOO_OLD' };
    const asked = await cindy.confirm(asrConsent(spec, 'zh'));
    if (!asked || !asked.ok) return asrFailed('NOT_ASKED', 'Could not ask the user (' + ((asked && asked.errorCode) || 'no answer') + '); nothing was downloaded.');
    if (!asked.confirmed) return { declined: true, note: 'The user chose 〔' + ASR_TEXT.zh.no + '〕: nothing was downloaded. Do not ask again unless she asks for it. ' +
      'She can open the download again herself: the button 〔' + ASR_TEXT.zh.button + '〕 on the 「听写」 line of the status card (montclip_status shows it), or by asking you to run montclip_install_asr.' };
    channel.postMessage({ type: 'asr-progress', phase: 'queued' });
    const tokens = {};
    for (let k = 0; k < spec.missing.length; k++) {
      const it = spec.missing[k];
      const d = await cindy.downloads.start({ id: asrDownloadId(it.name), url: it.url, sha256: it.sha256, bytes: it.bytes });
      if (!d || !d.ok) {
        const code = (d && d.errorCode) || 'DOWNLOAD_FAILED';
        channel.postMessage({ type: 'asr-progress', phase: 'failed', code, file: it.name });
        // nothing has reached the data folder: the worker installs only once every file has come
        return { ...asrFailed(code, it.name + ': ' + ((d && (d.message || d.errorCode)) || 'download failed')), file: it.name };
      }
      tokens['f' + k] = d.token;
    }
    channel.postMessage({ type: 'asr-progress', phase: 'installing' });
    try {
      const out = await node('montclip/asr-install', { names: spec.missing.map((i) => i.name) }, { downloadTokens: tokens, timeoutMs: 600000 });
      channel.postMessage({ type: 'asr-progress', phase: 'installed' });
      return { installed: true, files: out.installed, stillMissing: out.missing };
    } catch (e) {
      if (['SIZE_MISMATCH', 'SHA256_MISMATCH', 'BAD_ARCHIVE'].includes(e.code)) { asrCheckFailures++; asrRetryStamp = Date.now().toString(36); }
      channel.postMessage({ type: 'asr-progress', phase: 'failed', code: e.code || 'INSTALL_FAILED' });
      return asrFailed(e.code || 'INSTALL_FAILED', String(e.message || e));
    }
  })().finally(() => { asrInstalling = null; });
  return asrInstalling;
}
function onDownloadProgress(d) {
  if (d && String(d.id || '').startsWith('asr-')) {
    if (d.phase !== 'failed' && d.phase !== 'cancelled') channel.postMessage({ type: 'asr-progress', phase: d.phase, id: d.id, loaded: d.loaded, total: d.total, speedBps: d.speedBps });
    return;
  }
  if (!d || !String(d.id || '').startsWith('ffmpeg-')) return;
  lastDownloadPhase = d.phase;
  // how it ended is said once, with its code, by installFfmpeg (Cindy's own failed / cancelled carry none)
  if (d.phase === 'failed' || d.phase === 'cancelled') return;
  channel.postMessage({ type: 'ffmpeg-progress', phase: d.phase, loaded: d.loaded, total: d.total, speedBps: d.speedBps });
}

/* The export card in the chat (card capability: HTML + CSS only, no script; progress is a width). */
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
/* The export card's words (JJ's final words, 2026-11-04). The plugin's pages are Chinese for now; the English is kept
   beside them for when they follow Cindy's language. */
const EXPORT_TEXT = {
  zh: {
    pick: '等你选文件夹…', start: '正在开始导出…', running: (p) => '正在导出 ' + p + '%', copy: (f) => '正在存到「' + f + '」…',
    done: '导出完成', still: '还在导出', failed: '导出没有完成', cancelled: '没有导出',
    savedTo: (f) => '已存到「' + f + '」', savedDefault: '存在 MontClip 自己的导出文件夹里',
    stillNote: '这次等不到它导完。导完以后，文件会在 MontClip 自己的导出文件夹里。',
    noFolder: '没有选文件夹，所以没有导出。',
    copyFailed: (why) => '视频已经导出好了，但没能存进你选的文件夹（' + why + '）。文件还在 MontClip 自己的导出文件夹里，可以换一个文件夹再导出一次。',
    renamed: '同名文件已经有了，这次存成这个名字',
    openFolder: '打开文件夹', openExports: '打开导出文件夹',   // JJ: the folder she chose · MontClip's own export folder
    // waiting for JJ (VV, 2026-11-04): a failed open, and the reasons a copy fails
    openFailed: (why) => '没能打开文件夹（' + why + '）。',
    why: { NO_FOLDER: '选的文件夹找不到了，可能被删了或拔掉了 U 盘', ENOSPC: '空间不够', EACCES: '没有写入权限', EPERM: '没有写入权限',
      FOLDER_NOT_ALLOWED: '只能打开导出用的文件夹', OTHER: '出了点问题' },
    // why an export did not finish: JJ's final words (v2, 2026-11-04) — plain words only, never the raw error. That goes
    // to the log, and to the task page when she clicks 〔复制问题信息〕 (the card itself cannot copy).
    failedWhy: {
      tool: '缺一个处理视频的工具，这次没有做完。点下面的按钮装上（约 160 MB，只装一次），装好以后会接着做。',
      encoder: '这台电脑上找不到 MontClip 能用的视频编码器，所以这次没能导出。可以先更新显卡驱动再试。',
      disk: '电脑空间不够，这次没有做完。空出一些地方以后点〔重试〕。原片没有改动。',
      editor: '这次导出要剪辑器开着才能做，它没开或者还没准备好。打开右侧栏的「MontClip 剪辑器」，等时间线出来，再点〔重试〕。原片没有改动。',
      busy: '上一次导出还没做完，要等它做完才能开始这一个。把 MontClip 剪辑器切到前面，过半分钟再点〔重试〕。',
      noAnswer: 'MontClip 一直没有回应，这次没有做完。关掉剪辑器再打开，再点〔重试〕。原片没有改动。',
      stopped: '导出到一半停下了，这次没有做完。原片没有改动。再点〔重试〕。',
      projectChanged: '这个任务的项目在等你选文件夹时被换走了，再导一次。',
      other: '这次没有做完，出了个我们没预料到的问题。原片没有改动。再点〔重试〕；还不行，点〔复制问题信息〕发给我们。',
    },
    kept: '你的剪辑都还在，没有丢。',
    retry: '重试', install: '下载并安装', pickAgain: '换个文件夹', copyProblem: '复制问题信息',   // JJ v2 buttons
    copyProblemNote: '会打开 MontClip 任务页，在那里复制。',
    installFailed: '导出工具这次没装上。点〔下载并安装〕再试一次；还不行，点〔复制问题信息〕发给我们。',
  },
  en: {
    pick: 'Waiting for you to choose a folder…', start: 'Starting the export…', running: (p) => 'Exporting ' + p + '%', copy: (f) => 'Saving to “' + f + '”…',
    done: 'Export finished', still: 'Still exporting', failed: "The export didn't finish", cancelled: 'Not exported',
    savedTo: (f) => 'Saved to “' + f + '”', savedDefault: "Saved in MontClip's own export folder",
    stillNote: "This time it can't wait for the export to finish. When it's done, the file will be in MontClip's own export folder.",
    noFolder: 'No folder was chosen, so nothing was exported.',
    copyFailed: (why) => "The video is exported, but it couldn't be saved to the folder you chose (" + why + "). The file is still in MontClip's own export folder; you can export again to another folder.",
    renamed: 'A file with this name was already there, so this one was saved under this name',
    openFolder: 'Open folder', openExports: 'Open the export folder',
    openFailed: (why) => "Couldn't open the folder (" + why + ').',
    why: { NO_FOLDER: "the folder you chose isn't there any more; it may have been deleted, or the USB drive removed", ENOSPC: 'not enough space',
      EACCES: 'no permission to write there', EPERM: 'no permission to write there', FOLDER_NOT_ALLOWED: 'only the export folders can be opened',
      OTHER: 'something went wrong' },
    failedWhy: {
      tool: 'A video tool is missing, so this didn\'t finish. Install it with the button below (about 160 MB, once); MontClip carries on after that.',
      encoder: 'This computer has no video encoder MontClip can use, so it couldn\'t export this time. Update the graphics driver and try again.',
      disk: 'There isn\'t enough space on this computer, so this didn\'t finish. Free up some space, then click Retry. The original is unchanged.',
      editor: 'This export needs the editor open, and it isn\'t open or isn\'t ready yet. Open "MontClip editor" in the right sidebar, wait for the timeline, then click Retry. The original is unchanged.',
      busy: 'The last export hasn\'t finished, so this one can\'t start until it does. Bring the MontClip editor to the front and click Retry in half a minute.',
      noAnswer: 'MontClip didn\'t answer, so this didn\'t finish. Close the editor, open it again, then click Retry. The original is unchanged.',
      stopped: 'The export stopped halfway, so it didn\'t finish. The original is unchanged. Click Retry.',
      projectChanged: 'The project changed while you were choosing a folder. Export again.',
      other: 'This didn\'t finish because of a problem we didn\'t expect. The original is unchanged. Click Retry; if it still fails, use "Copy problem details" and send it to us.',
    },
    kept: 'Your edits are all still there.',
    retry: 'Retry', install: 'Download and install', pickAgain: 'Choose another folder', copyProblem: 'Copy problem details',
    copyProblemNote: 'Opens the MontClip task page, where you can copy it.',
    installFailed: 'The export tool didn\'t install this time. Click "Download and install" to try again; if it still fails, use "Copy problem details" and send it to us.',
  },
};
/** A file size: bytes under 1 KB (字节), then KB, MB, GB — as the main view says it. */
function sizeText(b, lang) {
  b = Math.max(0, Math.round(+b || 0));
  if (b < 1024) return b + (lang === 'en' ? ' bytes' : ' 字节');
  if (Math.round(b / 1024) < 1024) return Math.round(b / 1024) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(1) + ' GB';
}
/** Why something failed, in words: the reason for a known code, else a plain one (never the raw message). */
function whyText(code, message, lang) {
  const t = EXPORT_TEXT[lang === 'en' ? 'en' : 'zh'];
  return t.why[code] || t.why.OTHER;
}
/* A raw error never leaves this computer (Deja, 2026-11-04): the tool result goes through the AI service, so it carries
   only the plain sentence and the code. The whole error goes to the log; when she clicks 〔复制问题信息〕 on the card, the
   task page shows the sentence and copies it for her (scrubbed there, problem-details.js). */
function logProblem(code, error) {
  if (error == null || !String(error).trim()) return;
  console.warn('[MontClip] ' + new Date().toISOString() + ' ' + (code || 'UNKNOWN') + ': ' + String(error));
}
/** What the tool result says about a failed export: the card's plain sentence and the code — nothing raw. */
function copyFailureText(c, lang) {
  const t = EXPORT_TEXT[lang === 'en' ? 'en' : 'zh'];
  return Object.hasOwn(t.why, c.code || '') ? t.copyFailed(t.why[c.code]) : t.failedWhy.other;
}
function plainFailure(c) {
  const t = EXPORT_TEXT.zh;
  const text = c.phase === 'copyFailed' ? copyFailureText(c, 'zh')
    : c.code === 'DATA_DIR_IN_USE' ? String(c.reason) : t.failedWhy[failedReason(c)] + t.kept;
  return { error: text, code: c.code || (c.phase === 'copyFailed' ? 'COPY_FAILED' : 'EXPORT_FAILED') };
}
/** Why an export did not finish: tool · encoder · editor · busy · noAnswer · disk · stopped · other. `stage` says where it
 *  failed: starting it (the engine's code) or the job (its English error, and how far it got). */
function failedReason(c) {
  const code = String(c.code || ''), m = String(c.reason || '');
  if (code === 'EXPORT_PROJECT_CHANGED') return 'projectChanged';
  if (/^ffmpeg(Missing|Dev)$|^FFMPEG_MISSING$/i.test(code) || /ffmpeg (is )?(not found|missing)/i.test(m)) return 'tool';
  if (/^(EDITOR_NOT_READY|EDITOR_DID_NOT_ACCEPT|HEADLESS_DISABLED)$/.test(code) ||
    /no editor tab|never picked up|did not accept|headless browser|Chrome \/ Edge/i.test(m)) return 'editor';
  if (/is still (pending|running)/i.test(m)) return 'busy';
  if (/^(TIMEOUT|PROCESS_EXITED|NODE_REQUEST_FAILED|CANCELLED)$/.test(code)) return 'noAnswer';
  if (/^h264None(Win|Other)$/.test(code) || /no H\.264 encoder/i.test(m)) return 'encoder';
  if (/no space left|ENOSPC|disk (is )?full/i.test(code + ' ' + m)) return 'disk';
  if (c.stage === 'job' && (c.progress > 0 || /stopped reporting progress|exited before the export finished|crashed/i.test(m))) return 'stopped';
  return 'other';
}
/** There is a raw error to copy for us (the data folder in use already says it all in JJ's own sentence). */
const hasRaw = (c) => c.code !== 'DATA_DIR_IN_USE' && c.reason != null && String(c.reason).trim() !== '';
/** A row of card buttons: [[actionId, label, primary], …] (Cindy sends the click back as a card-action). */
function buttons(list) {
  return '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">' + list.map(([id, label, primary]) =>
    '<button data-ghost-action="' + id + '" style="font:inherit;padding:5px 12px;border-radius:6px;' +
    (primary ? 'border:0;background:var(--accent,#4b3fd6);color:#fff' : 'border:1px solid var(--border-default,#d4d4cf);background:transparent;color:inherit') +
    '">' + label + '</button>').join('') + '</div>';
}
function exportCard(c, lang) {
  const t = EXPORT_TEXT[lang === 'en' ? 'en' : 'zh'];
  const pct = Math.max(0, Math.min(100, Math.round((c.progress || 0) * 100)));
  const small = 'margin:8px 0 0;font-size:12px;color:var(--text-secondary,#6b6b66)';
  // copyFailed has no head of its own: its sentence says it all (the export did finish)
  const head = { pick: t.pick, start: t.start, running: t.running(pct), copy: t.copy(esc(c.folder)),
    done: t.done, still: t.still, failed: t.failed, cancelled: t.cancelled }[c.phase] || '';
  const bar = ['start', 'running', 'copy'].includes(c.phase)
    ? '<div style="height:4px;margin-top:10px;background:var(--border-default,#e4e4e0);border-radius:2px;overflow:hidden"><div style="height:100%;width:' + (c.phase === 'copy' ? 100 : pct) + '%;background:var(--accent,#4b3fd6)"></div></div>' : '';
  const files = (c.files || []).map((f) => '<li style="overflow-wrap:anywhere">' + esc(f.name) + (f.bytes ? ' · ' + sizeText(f.bytes, lang) : '') +
    (f.renamed ? '<div style="' + small + ';margin-top:2px">' + t.renamed + '</div>' : '') + '</li>').join('');
  const where = c.phase === 'done' ? '<p style="margin:8px 0 0">' + (c.folder ? t.savedTo(esc(c.folder)) : t.savedDefault) + '</p>' : '';
  const body = c.phase === 'still' ? '<p style="' + small + '">' + (c.job ? (lang === 'en' ? 'Still exporting; click Retry to check this export and finish saving to the chosen folder.' : '还在导出，尚未存入所选文件夹。点〔重试〕查看这次导出，完成后继续存入原来选的文件夹。') : t.stillNote) + '</p>'
    : c.phase === 'cancelled' ? '<p style="' + small + '">' + t.noFolder + '</p>'
    : c.phase === 'copyFailed' ? '<p style="margin:0">' + esc(copyFailureText(c, lang)) + '</p>'
    // 导出没有完成: why, in plain words; 你的剪辑都还在，没有丢。 — never the raw error (JJ v2)
    : c.phase === 'failed' ? (c.code === 'DATA_DIR_IN_USE' ? '<p style="margin:8px 0 0">' + esc(c.reason) + '</p>'
      : '<p style="margin:8px 0 0">' + t.failedWhy[failedReason(c)] + t.kept + '</p>' +
        (c.installFailed ? '<p style="' + small + '">' + t.installFailed + '</p>' : '') +
        buttons([failedReason(c) === 'tool' ? ['install-ffmpeg', t.install, true] : ['retry', t.retry, true]]
          .concat(hasRaw(c) ? [['copy-problem', t.copyProblem, false]] : [])) +
        (hasRaw(c) ? '<p style="' + small + ';margin-top:4px">' + t.copyProblemNote + '</p>' : '')) : '';
  // 打开文件夹: the folder she chose, when the files went there; else 打开导出文件夹 (a failed copy leaves them in
  // exports), and after a failed copy 换个文件夹 too (JJ v2)
  const picked = c.phase === 'done' && !!c.dir;
  const open = c.phase === 'still' && c.job ? buttons([['retry-delivery', t.retry, false]]) : c.phase === 'done' || c.phase === 'copyFailed'
    ? buttons([['open-folder:' + (picked ? 'picked' : 'exports'), picked ? t.openFolder : t.openExports, false]]
        .concat(c.phase === 'copyFailed' && c.job ? [['pick-again', t.pickAgain, false]] : [])
        .concat(c.phase === 'copyFailed' && hasRaw(c) ? [['copy-problem', t.copyProblem, false]] : [])) +
      (c.phase === 'copyFailed' && hasRaw(c) ? '<p style="' + small + ';margin-top:4px">' + t.copyProblemNote + '</p>' : '') +
      (c.openFailed ? '<p style="' + small + '">' + t.openFailed(esc(whyText(c.openFailed.code, c.openFailed.message, lang))) + '</p>' : '')
    : '';
  const note = c.note ? '<p style="margin:8px 0 0;color:' + (c.phase === 'failed' ? 'var(--text-danger,#b42318)' : 'var(--text-secondary,#6b6b66)') + '">' + esc(c.note) + '</p>' : '';
  return '<div style="padding:12px 14px;color:var(--text-primary,#1a1a1a);font:13px/1.45 system-ui,sans-serif">' +
    (head ? '<div style="font-weight:600' + (c.phase === 'failed' ? ';color:var(--text-danger,#b42318)' : '') + '">' + head + '</div>' : '') + bar + where + body +
    (files ? '<ul style="margin:8px 0 0;padding-left:18px">' + files + '</ul>' : '') + note + open + '</div>';
}
/* Each export card's last state, by its call: 打开文件夹 knows which folder, and the card is drawn again after the click
   (Cindy holds the clicked button until the next card-update, at most 8 s: GHOST_CARD_ACTION_INFLIGHT_MS). */
const exportCards = new Map();
const pendingProblems = new Map();   // session → {text, problem}: what its task page is to show, from 复制问题信息 on a card
function sendCard(callId, c) {
  exportCards.delete(callId); exportCards.set(callId, c);
  while (exportCards.size > 50) exportCards.delete(exportCards.keys().next().value);
  const done = ['done', 'failed', 'cancelled', 'still', 'copyFailed'].includes(c.phase);
  return cindy.send({ type: 'card-update', callId, v: 2, state: done ? 'done' : 'working', html: exportCard(c), height: c.phase === 'failed' ? 260 : c.phase === 'copyFailed' ? 240 : c.phase === 'done' ? 210 : done ? 150 : 110 });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Each Cindy task edits its own project. Cindy hands every tool call the task it came from (sessionContext); the
   engine has one project open at a time, so a call first makes sure it is this task's (the worker binds one at a time). */
const taskOf = (msg) => (msg && msg.args && msg.args.session_context && msg.args.session_context.session_id) || null;
async function forTask(msg) {
  const session = taskOf(msg);
  return session ? node('montclip/bind', { session }) : null;
}
/* The status card: what is ready, and — when this task has no editor tab — a button that opens it. */
/* The card button could not open the editor: JJ's plain sentence only (JJ v2: never the raw error on the card); the
   whole error goes to the log. */
function openEditorFailed(error, code) {
  logProblem(code || 'TASK_VIEW_FAILED', error);
  return '没能打开剪辑器。再点一次试试。';
}
/* 听写 on the status card (JJ's final words, 2026-11-05): the label and its hover hint, the state, and under an
   unfinished state a small line on what it is for. The plugin's pages are Chinese for now; the English is kept for when
   they follow the interface language. The model's size is the worker's modelMb: the manifest's bytes through the
   engine's own aboutMb (asr-status.js), so nothing here rounds or writes a size. */
var ASR_CARD = {   // var: the tests read it from main.js's own scope
  zh: { label: '听写', hint: '把说的话转成文字', ready: '已装好', model: (mb) => '还没装模型（约 ' + mb + ' MB）', engine: '还没装听写程序',
    note: '做字幕、按说过的话找位置时要用；剪辑和导出不受影响。' },
  en: { label: 'Transcription', hint: 'Turns speech into text', ready: 'Installed', model: (mb) => 'Model not installed (about ' + mb + ' MB)',
    engine: 'Transcription program not installed', note: 'Needed for captions and for finding a moment by what was said. Editing and exporting still work.' },
};
const asrText = (lang) => ASR_CARD[lang === 'en' ? 'en' : 'zh'];
function asrLine(a, lang) {
  const t = asrText(lang);
  if (!a) return '—';
  if (a.engine && a.model) return t.ready;
  return a.engine ? t.model(a.modelMb) : t.engine;
}
/** The small line under an unfinished 听写 state, '' once installed (or when the state is not known). */
function asrNote(a, lang) { return a && !(a.engine && a.model) ? asrText(lang).note : ''; }
/** The status card's values, in order (the card and its height estimate read the same list). */
function statusRows(s, editorOpen) {
  const ff = { downloaded: '已装好', changed: '文件被改过，建议重新安装', missing: '还没装（导出、降噪要用）' }[s.ffmpeg] || s.ffmpeg;
  return [s.project || '—', editorOpen ? '已在这个任务里打开' : '没有打开', ff, asrLine(s.asr)];
}
const NOTE_STYLE = 'font-size:12px;line-height:1.45;color:var(--text-secondary,#6b6b66);margin-top:2px';
/** The card's height for the host's first frame (it then settles on the real one): padding, the title, each row by how
 *  many lines its value takes in the narrowest chat (280 px leaves ~118 px: 9 Chinese characters), and the button. */
function statusCardHeight(s, editorOpen) {
  const lines = (v) => Math.max(1, Math.ceil([...String(v)].reduce((n, c) => n + (/[\u2e80-\uffef]/.test(c) ? 1 : 0.55), 0) / 9));
  const rows = statusRows(s, editorOpen).reduce((n, v) => n + lines(v) * 20, 0);
  const note = asrNote(s.asr) ? Math.ceil(lines(asrNote(s.asr)) * 1.1) * 18 + 2 : 0;   // 12 px text: a few more characters a line
  // 〔下载听写程序和模型〕 under the 听写 value: two lines in the narrowest chat
  const asrButton = s.asr && !(s.asr.engine && s.asr.model) ? 52 : 0;
  return Math.min(900, Math.max(120, 24 + 26 + rows + note + asrButton + (editorOpen ? 0 : 42) + 6));
}
function statusCard(s, editorOpen) {
  // one width for every label (DD on #7: 「听写（语音转文字）」 was wider than the old min-width and pushed its value out of
  // the column, and wrapped at 280 px), so the values form one column; a line's small note and its button sit under its
  // value, in that column
  const row = (k, v, { hint = '', note = '', extra = '' } = {}) => '<div style="display:flex;gap:10px"><span style="color:var(--text-secondary,#6b6b66);width:9.5em;flex:none;white-space:nowrap"' +
    (hint ? ' title="' + esc(hint) + '"' : '') + '>' + esc(k) + '</span><span>' + esc(v) + (note ? '<div style="' + NOTE_STYLE + '">' + esc(note) + '</div>' : '') +
    (extra ? '<div style="margin-top:4px">' + extra + '</div>' : '') + '</span></div>';
  const ff = { downloaded: '已装好', changed: '文件被改过，建议重新安装', missing: '还没装（导出、降噪要用）' }[s.ffmpeg] || s.ffmpeg;
  return '<div style="padding:12px 14px;color:var(--text-primary,#1a1a1a);font:13px/1.5 system-ui,sans-serif">' +
    '<div style="font-weight:600;margin-bottom:6px">MontClip</div>' +
    row('项目', s.project || '—') + row('剪辑器', editorOpen ? '已在这个任务里打开' : '没有打开') + row('导出工具（ffmpeg）', ff) +
    // the 听写 line, with the way to the download on it while something is missing (also the way back after 〔先不用〕)
    row(asrText().label, asrLine(s.asr), { hint: asrText().hint, note: asrNote(s.asr), extra: s.asr && !(s.asr.engine && s.asr.model)
      ? '<button data-ghost-action="install-asr" style="font:inherit;padding:1px 10px;border-radius:6px;border:1px solid var(--border,#ccc);background:transparent;color:inherit">' + esc(ASR_TEXT.zh.button) + '</button>' : '' }) +
    (editorOpen ? '' : '<div style="margin-top:10px"><button data-ghost-action="open-editor" style="font:inherit;padding:5px 12px;border-radius:6px;border:0;background:var(--accent,#4b3fd6);color:#fff">在这个任务里打开剪辑器</button></div>') +
    '</div>';
}

async function finishExport(job, { callId, folder, dir, again }) {
    const t0 = Date.now();
    while ((job.status === 'pending' || job.status === 'running') && Date.now() - t0 < 14 * 60000) {
      await sleep(1500);
      job = await node('montclip/export-job', { id: job.id });
      sendCard(callId, { phase: 'running', progress: job.progress, folder });
    }
    if (job.status !== 'done') {
      await sleep(1000);
      // still going when this call can wait no longer: the card says so in plain words; how to follow it is for the agent
      if (job.status === 'pending' || job.status === 'running') {
        sendCard(callId, { phase: 'still', job: job.id, folder, dir, again });
        return { job: job.id, status: job.status, hint: 'The export is still running. Check it with call_tool fablecut_export {job:"' + job.id + '"}; use Retry on this card to finish saving to the chosen folder.' };
      }
      if (job.status === 'cancelled') { sendCard(callId, { phase: 'cancelled' }); return { job: job.id, status: 'cancelled' }; }
      logProblem(job.code || 'EXPORT_FAILED', job.error);
      const c = { phase: 'failed', stage: 'job', code: job.code, progress: job.progress, reason: job.error || job.status, again };
      sendCard(callId, c);
      return Object.assign({ job: job.id, status: job.status }, plainFailure(c));
    }
    const outs = job.result && Array.isArray(job.result.outputs) ? job.result.outputs : [];
    const report = outs.map((o) => o.report && o.report.line).filter(Boolean);
    let files = [];
    if (dir) {
      sendCard(callId, { phase: 'copy', folder });
      try { files = (await node('montclip/export-deliver', { id: job.id, dir }, { timeoutMs: 60000, maxTotalMs: 900000 })).files; }
      catch (e) {
        await sleep(1000); logProblem(e.code, e.message);
        const c = { phase: 'copyFailed', code: e.code, reason: e.message, job: job.id };
        sendCard(callId, c); return Object.assign({ job: job.id, status: 'done', copied: false }, plainFailure(c));
      }
    } else files = outs.filter((o) => o.ok).map((o) => ({ name: o.file })).concat(outs.length ? [] : [{ name: String(job.src || '').split('/').pop() }]);
    await sleep(1000);
    sendCard(callId, { phase: 'done', folder, dir, job: job.id, files, note: report.join(' · ') });
    return { job: job.id, status: 'done', files: files.map((f) => String(f.name || f.file || '').split(/[\\/]/).pop()), report };
}

const HANDLERS = {
  async montclip_status(args, msg) {
    const bound = await forTask(msg).catch(() => null);
    const s = await node('montclip/start');
    let editor = null;
    try { editor = await node('montclip/ui', { cmd: 'state', session: taskOf(msg) }); } catch (e) { editor = { error: String(e.message) }; }
    const open = !!(editor && editor.status === 200);
    let asr = null;
    try { asr = await node('montclip/asr-status'); } catch (e) { asr = null; }
    cindy.send({ type: 'card-update', callId: msg.callId, v: 2, html: statusCard({ ffmpeg: s.ffmpeg, project: bound && bound.name, asr }, open), height: statusCardHeight({ ffmpeg: s.ffmpeg, project: bound && bound.name, asr }, open) });
    return { engine: publicStart(s), transcription: asr ? { engine: asr.engine, model: asr.model, punctuation: asr.punct,
      note: asr.engine && asr.model ? 'fablecut_transcribe works here.' : 'Not installed here: fablecut_transcribe will say so. MontClip never fetches the engine or the model by itself; do not try to.' } : null,
      editorTab: editor && editor.status === 200 ? editor
      : { open: false, note: 'The editor is not open in this task: montclip_open_task_view opens it. Undo / redo need it; without it, go back with fablecut_versions.' } };
  },
  async list_tools(args) {
    const tools = await engineTools();
    if (!args.category) {
      const counts = {};
      for (const t of tools) counts[categoryOf(t.name)] = (counts[categoryOf(t.name)] || 0) + 1;
      return { categories: Object.entries(counts).map(([category, count]) => ({ category, count })), hint: 'list_tools({category}) returns each operation with its parameters and the category RULES.' };
    }
    const list = tools.filter((t) => categoryOf(t.name) === args.category);
    if (!list.length) return { error: 'unknown category', categories: Object.keys(CATEGORIES).concat('other') };
    return { category: args.category, rules: RULES[args.category] || '', tools: list };
  },
  async call_tool(args, msg) {
    await forTask(msg);
    const tools = await engineTools();
    const name = String(args.name || '');
    const tool = tools.find((t) => t.name === name);
    if (!tool) return { error: 'unknown operation ' + name, available: tools.map((t) => t.name), hint: 'list_tools({category}) shows each one with its parameters.' };
    try {
      return await node('montclip/call', { session: taskOf(msg), name, arguments: args.args || {} }, { timeoutMs: 60000, maxTotalMs: 900000 });
    } catch (e) {
      return { error: String(e.message), inputSchema: tool.inputSchema, rules: RULES[categoryOf(name)] || '' };
    }
  },
  async montclip_undo(args, msg) { await forTask(msg); return node('montclip/ui', { session: taskOf(msg), cmd: 'undo' }); },
  async montclip_redo(args, msg) { await forTask(msg); return node('montclip/ui', { session: taskOf(msg), cmd: 'redo' }); },
  async montclip_seek(args, msg) { await forTask(msg); return node('montclip/ui', { session: taskOf(msg), cmd: 'seek', t: Number(args.t) }); },
  /* Export, and save the file into a folder the user picks in the system dialog (folder:"default" keeps it in the
     MontClip data folder's exports/). Progress shows on this call's card. */
  async montclip_export(args, msg) {
    const callId = msg.callId;
    const bound = await forTask(msg);
    const again = { args, msg: { args: msg.args, session_context: msg.session_context } };   // 重试 runs the same export
    let folder = null, dir = null;
    if (args.folder !== 'default') {
      if (typeof cindy.pick !== 'function') return { error: 'This Cindy cannot show a folder dialog for plugins; update Cindy, or pass folder:"default".', code: 'HOST_TOO_OLD' };
      sendCard(callId, { phase: 'pick' });
      const picked = await cindy.pick({ mode: 'directory', title: '选择 MontClip 导出到哪个文件夹', callId });
      if (!picked || !picked.ok || !picked.path) {
        await sleep(1000);
        sendCard(callId, { phase: 'cancelled' });
        return { cancelled: true, code: (picked && picked.errorCode) || 'CANCELLED' };
      }
      folder = picked.name || 'folder'; dir = picked.path;
    }
    await sleep(1000);
    sendCard(callId, { phase: 'start', folder });
    let job;
    try { job = await node('montclip/export-start', { session: taskOf(msg), expectedProject: bound && bound.project, range: args.range, preset: args.preset, profile: args.profile, outputs: args.outputs }); }
    catch (e) {
      await sleep(1000); logProblem(e.code, e.message);
      const c = { phase: 'failed', stage: 'start', code: e.code, reason: e.message, again };
      sendCard(callId, c); return plainFailure(c);
    }
    return finishExport(job, { callId, folder, dir, again });
  },
  /* Only when the user agreed to the download (about 160 MB). */
  async montclip_install_ffmpeg() { return installFfmpeg(); },
  /* Transcription's engine and model: the user is asked in the host's confirm box first; a no downloads nothing. */
  async montclip_install_asr() { return installAsr(); },
  /* Open (or focus) the editor as this task's own tab in the task's right sidebar. */
  async montclip_open_task_view(args, msg) {
    if (typeof cindy.taskView !== 'function') return { error: 'This Cindy has no task views; update Cindy.' };
    const session = args.sessionId ? String(args.sessionId) : taskOf(msg);   // the task the chat is in, not whichever is in front
    return cindy.taskView(session ? { sessionId: session } : {});
  },
};

cindy.onHostMessage(async function (msg) {
  if (msg.type === 'event' && msg.name === 'download-progress') { onDownloadProgress(msg.data); return; }
  // the status card's button: a real click in the card, in its own task
  if (msg.type === 'event' && msg.name === 'card-action' && msg.actionId === 'open-editor') {
    const r = typeof cindy.taskView === 'function' ? await cindy.taskView(msg.sessionId ? { sessionId: msg.sessionId } : {}) : { ok: false, errorCode: 'HOST_TOO_OLD' };
    cindy.send({ type: 'card-update', callId: msg.callId, v: 2, height: 90,
      html: '<div style="padding:12px 14px;color:var(--text-primary,#1a1a1a);font:13px/1.5 system-ui,sans-serif">' +
        (r && r.ok ? '剪辑器已在右侧栏打开。' : openEditorFailed(r && (r.message || r.errorCode), r && r.errorCode)) + '</div>' });
    return;
  }
  // 下载听写程序和模型 on the status card: a real click; installAsr still asks in the host's confirm box first
  if (msg.type === 'event' && msg.name === 'card-action' && msg.actionId === 'install-asr') {
    const r = await installAsr();
    const say = esc(asrResultText(r, 'zh'));   // never the code: that is the agent's, and the copy line's
    cindy.send({ type: 'card-update', callId: msg.callId, v: 2, height: 90,
      html: '<div style="padding:12px 14px;color:var(--text-primary,#1a1a1a);font:13px/1.5 system-ui,sans-serif">' + say + '</div>' });
    return;
  }
  // 打开文件夹 on an export card: the worker opens it, and only the exports folder or the folder that export went into
  // 重试 / 下载并安装 / 换个文件夹 on an export card (JJ v2's buttons): real clicks in the card, in its own task
  // 复制问题信息 on an export card: the card cannot copy, so open this task's MontClip page and show it there (JJ v2,
  // Deja 2026-11-04). The raw error goes only from this logic page to that page, on this computer.
  if (msg.type === 'event' && msg.name === 'card-action' && msg.actionId === 'retry-delivery') {
    const c = exportCards.get(msg.callId);
    if (!c || c.phase !== 'still' || !c.job) return;
    sendCard(msg.callId, { phase: 'running', folder: c.folder });
    try {
      const job = await node('montclip/export-job', { id: c.job });
      await finishExport(job, { ...c, callId: msg.callId });
    } catch (e) {
      logProblem(e.code, e.message);
      sendCard(msg.callId, c);
    }
    return;
  }
  if (msg.type === 'event' && msg.name === 'card-action' && msg.actionId === 'copy-problem') {
    const c = exportCards.get(msg.callId);
    if (!c || !hasRaw(c) || !msg.sessionId) return;
    const shown = { session: String(msg.sessionId), text: plainFailure(c).error, problem: { code: c.code || 'EXPORT_FAILED', error: String(c.reason) } };
    pendingProblems.set(shown.session, shown);
    if (typeof cindy.taskView === 'function') await cindy.taskView({ sessionId: shown.session, focus: true });
    channel.postMessage(Object.assign({ type: 'show-problem' }, shown));   // a page already open shows it now
    sendCard(msg.callId, c);   // draw the card again, so Cindy lets go of the button
    return;
  }
  if (msg.type === 'event' && msg.name === 'card-action' && ['retry', 'install-ffmpeg', 'pick-again'].includes(String(msg.actionId))) {
    const c = exportCards.get(msg.callId);
    if (!c) return;
    try {
      if (msg.actionId === 'install-ffmpeg') {
        const r = await installFfmpeg();
        if (r.error) { sendCard(msg.callId, Object.assign({}, c, { installFailed: true })); return; }   // the log has it
      }
      if ((msg.actionId === 'retry' || msg.actionId === 'install-ffmpeg') && c.again)   // 装好以后会接着做
        await HANDLERS.montclip_export(c.again.args, Object.assign({}, c.again.msg, { callId: msg.callId }));
      if (msg.actionId === 'pick-again' && c.job) {
        const picked = await cindy.pick({ mode: 'directory', title: '选择 MontClip 导出到哪个文件夹', callId: msg.callId });
        if (!picked || !picked.ok || !picked.path) { sendCard(msg.callId, c); return; }   // closed: the card as it was
        const folder = picked.name || 'folder';
        sendCard(msg.callId, { phase: 'copy', folder });
        try {
          const files = (await node('montclip/export-deliver', { id: c.job, dir: picked.path }, { timeoutMs: 60000, maxTotalMs: 900000 })).files;
          await sleep(1000);
          sendCard(msg.callId, { phase: 'done', folder, dir: picked.path, job: c.job, files });
        } catch (e) { logProblem(e.code, e.message); await sleep(1000); sendCard(msg.callId, { phase: 'copyFailed', code: e.code, reason: e.message, job: c.job }); }
      }
    } catch (e) { logProblem(e.code, e.message); sendCard(msg.callId, c); }
    return;
  }
  if (msg.type === 'event' && msg.name === 'card-action' && /^open-folder:(picked|exports)$/.test(String(msg.actionId))) {
    const c = exportCards.get(msg.callId);
    if (!c) return;
    // the worker is told which export (its job id), never a path; it looks up where that export went
    const ask = msg.actionId === 'open-folder:picked' ? (c.phase === 'done' && c.dir && c.job ? { job: c.job } : null) : { folder: 'exports' };
    let openFailed = null;
    try {
      if (!ask) throw Object.assign(new Error('this export was not saved into a folder of its own'), { code: 'NO_FOLDER' });
      await node('montclip/open-folder', ask);
    } catch (e) { openFailed = { code: e.code, message: e.message }; logProblem(e.code, e.message); }
    sendCard(msg.callId, Object.assign({}, c, { openFailed }));
    return;
  }
  if (msg.type !== 'tool-call') return;
  const fn = Object.prototype.hasOwnProperty.call(HANDLERS, msg.tool) ? HANDLERS[msg.tool] : null;
  if (!fn) { await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: 'TOOL_NOT_FOUND', message: msg.tool }); return; }
  try {
    const result = await fn(msg.args || {}, msg);
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: true, result });
  } catch (e) {
    await cindy.send({ type: 'tool-result', callId: msg.callId, ok: false, errorCode: e.code || 'FAILED', message: String(e.message || e) });
  }
});

/* Pages ↔ logic page. A page posts {reqId, type}; the answer carries the same reqId. Pages resend until answered,
   so a request that repeats is answered again, not run again. */
const channel = new BroadcastChannel('montclip');
const answered = new Map();
channel.onmessage = async (e) => {
  const m = e.data || {};
  if (!m.reqId || m.answer) return;
  if (answered.has(m.reqId)) { const a = answered.get(m.reqId); if (a) channel.postMessage(a); return; }
  answered.set(m.reqId, null);
  let a;
  try {
    if (m.type === 'editor') { const s = await node('montclip/start'); a = { origin: s.origin, url: s.url }; }
    else if (m.type === 'bind') a = await node('montclip/bind', { session: String(m.session || '') });
    else if (m.type === 'ffmpeg-state') a = await node('montclip/ffmpeg-spec');
    else if (m.type === 'overview') a = await node('montclip/overview');
    // the main view's button: open that task's editor tab and go to the task (Cindy checks it follows a real click)
    else if (m.type === 'open-task') a = typeof cindy.taskView === 'function' ? await cindy.taskView({ sessionId: String(m.session || ''), focus: true }) : { ok: false, errorCode: 'HOST_TOO_OLD' };
    else if (m.type === 'ffmpeg-install') a = await installFfmpeg();   // the banner's button: the user's own click
    // the main view's 打开文件夹: always MontClip's exports folder — a page never names a path
    else if (m.type === 'open-folder') a = await node('montclip/open-folder', { folder: 'exports' });
    // the task page opened by 复制问题信息 asks what to show (once: a later load shows nothing)
    else if (m.type === 'problem') { const p = pendingProblems.get(String(m.session || '')); pendingProblems.delete(String(m.session || '')); a = p ? { shown: p } : { shown: null }; }
    else a = { error: 'unknown request ' + m.type };
  } catch (err) { a = { error: String(err.message || err), code: err.code || null, ...(err.messageEn ? { errorEn: err.messageEn } : {}) }; }
  a = Object.assign({ reqId: m.reqId, answer: true }, a);
  answered.set(m.reqId, a);
  if (answered.size > 200) answered.delete(answered.keys().next().value);
  channel.postMessage(a);
};
