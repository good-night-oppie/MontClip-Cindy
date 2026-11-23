// Builds a CapCut desktop draft folder from local media. Local files only: no network, no account.
// The draft is staged in the gateway's own folder; nothing inside CapCut's project store is touched.
// Format notes come from reading the MIT-licensed renezander030/capcut-cli (commit 1c88efc5) and
// from version markers of drafts authored by CapCut 9.4.0 on this machine. No code was copied.
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { matchesType, sha256File } = require('./gateway-core.cjs');

// Markers observed in drafts written by CapCut 9.4.0 for Windows. Device fields stay empty.
const MARKERS = { version: 360000, new_version: '185.0.0', app_version: '9.4.0', app_id: 359289 };
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u;
const KIND = { video: 'video', image: 'photo', audio: 'music', music: 'music' };
const id = () => randomUUID().toUpperCase();
const slash = p => p.replace(/\\/g, '/');

function validate(clips) {
  if (!Array.isArray(clips) || clips.length < 1 || clips.length > 50) return 'INVALID_CLIPS';
  for (const clip of clips) {
    if (!clip || !KIND[clip.mediaType] || typeof clip.path !== 'string' || !path.isAbsolute(clip.path)) return 'INVALID_CLIPS';
    if (!Number.isSafeInteger(clip.durationMs) || clip.durationMs < 1 || clip.durationMs > 4 * 3600 * 1000) return 'INVALID_CLIPS';
    const visual = clip.mediaType === 'video' || clip.mediaType === 'image';
    if (visual && !(Number.isSafeInteger(clip.width) && Number.isSafeInteger(clip.height) && clip.width > 0 && clip.height > 0)) return 'INVALID_CLIPS';
    let stat;
    try { stat = fs.statSync(clip.path); } catch { return 'MEDIA_NOT_FOUND'; }
    if (!stat.isFile() || stat.size === 0) return 'MEDIA_NOT_FOUND';
    if (!matchesType(clip.path, clip.mediaType)) return 'MEDIA_TYPE_MISMATCH';
  }
  return null;
}

function companions(materials, audioOnly) {
  const refs = [];
  const add = (group, value) => { const entry = { id: id(), ...value }; materials[group].push(entry); refs.push(entry.id); };
  add('speeds', { type: 'speed', speed: 1, mode: 0, curve_speed: null });
  add('placeholder_infos', { type: 'placeholder_info', meta_type: 'none', res_path: '', res_text: '', error_path: '', error_text: '' });
  add('sound_channel_mappings', { type: 'none', audio_channel_mapping: 0, is_config_open: false });
  add('vocal_separations', { type: 'vocal_separation', choice: 0, removed_sounds: [], time_range: null, production_path: '', final_algorithm: '', enter_from: '' });
  if (audioOnly) return refs;
  add('canvases', { type: 'canvas_color', color: '', blur: 0, image: '', album_image: '', image_id: '', image_name: '', source_platform: 0, team_id: '' });
  add('material_colors', { is_color_clip: false, is_gradient: false, solid_color: '', gradient_colors: [], gradient_percents: [], gradient_angle: 90, width: 0, height: 0 });
  return refs;
}

// A draft is built in a work folder and renamed into place only when every file is written,
// so a failed or interrupted write never leaves something that looks like a finished draft.
function createDraft({ stagingRoot, name, clips }) {
  if (!NAME.test(name || '')) return { code: 'INVALID_NAME' };
  const problem = validate(clips);
  if (problem) return { code: problem };
  fs.mkdirSync(stagingRoot, { recursive: true });
  const taken = claimName(stagingRoot, name);
  if (!taken) return { code: 'DRAFT_NAME_UNAVAILABLE', message: '同名草稿太多，请换一个名字。' };
  const folder = path.join(stagingRoot, taken.name);
  const work = path.join(stagingRoot, '.building-' + randomUUID());
  try {
    fs.mkdirSync(work);
    const result = writeDraft({ work, folder, stagingRoot, name: taken.name, clips });
    if (result.code !== 'OK') return result;
    fs.renameSync(work, folder);
    return { ...result, requestedName: name, renamed: taken.name !== name };
  } catch {
    return { code: 'DRAFT_WRITE_FAILED', message: '草稿没有写完，已清理，没有留下半成品。' };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(taken.claim, { force: true });
  }
}

// Picks the first free name: "name", then "name (2)", "name (3)"... An existing draft is never
// reused. The claim file is created exclusively, so two writers started together cannot both
// take one name; a claim left by a crashed writer only makes later drafts skip that name.
function claimName(stagingRoot, name) {
  for (let n = 1; n <= 99; n++) {
    const candidate = n === 1 ? name : name + ' (' + n + ')';
    const claim = path.join(stagingRoot, '.claim-' + candidate);
    try { fs.closeSync(fs.openSync(claim, 'wx')); } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    if (!fs.existsSync(path.join(stagingRoot, candidate))) return { name: candidate, claim };
    fs.rmSync(claim, { force: true });
  }
  return null;
}

// Paths inside the JSON use the final folder; files are written under the work folder.
function writeDraft({ work, folder, stagingRoot, name, clips }) {
  const draftId = id();
  const platform = { os: 'windows', os_version: '', app_id: MARKERS.app_id, app_version: MARKERS.app_version, app_source: 'cc', device_id: '', hard_disk_id: '', mac_address: '' };
  const materials = { videos: [], audios: [], speeds: [], placeholder_infos: [], sound_channel_mappings: [], vocal_separations: [],
    canvases: [], material_colors: [], texts: [], stickers: [], video_effects: [], transitions: [], masks: [], chromas: [],
    audio_fades: [], audio_effects: [], placeholders: [], common_mask: [] };
  const tracks = { video: { id: id(), type: 'video', name: '', attribute: 0, flag: 0, is_default_name: true, segments: [] },
    audio: { id: id(), type: 'audio', name: '', attribute: 0, flag: 0, is_default_name: true, segments: [] } };
  const registered = [];
  const manifest = [];
  const cursor = { video: 0, audio: 0 };
  for (const [index, clip] of clips.entries()) {
    // Media is copied into the draft so it keeps opening after the source folder is cleaned.
    const kind = KIND[clip.mediaType];
    const relative = path.join('assets', kind === 'music' ? 'audio' : 'video');
    const sub = path.join(work, relative);
    fs.mkdirSync(sub, { recursive: true });
    const fileName = String(index + 1).padStart(2, '0') + path.extname(clip.path).toLowerCase();
    const copied = path.join(sub, fileName);
    const finalPath = slash(path.join(folder, relative, fileName));
    fs.copyFileSync(clip.path, copied, fs.constants.COPYFILE_EXCL);
    const sha256 = sha256File(copied);
    if (sha256 !== sha256File(clip.path)) return { code: 'COPY_FAILED' };
    const duration = clip.durationMs * 1000;
    const materialId = id(), localId = id();
    const trackName = kind === 'music' ? 'audio' : 'video';
    if (kind === 'music') {
      materials.audios.push({ id: materialId, path: finalPath, name: fileName, duration, type: 'extract_music', category_name: 'local', check_flag: 1, local_material_id: localId, wave_points: [] });
    } else {
      materials.videos.push({ id: materialId, path: finalPath, material_name: fileName, type: kind, duration, width: clip.width, height: clip.height,
        category_name: 'local', check_flag: 7, has_audio: kind === 'video', local_material_id: localId,
        crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 } });
    }
    tracks[trackName].segments.push({ id: id(), material_id: materialId, raw_segment_id: '',
      target_timerange: { start: cursor[trackName], duration }, source_timerange: { start: 0, duration },
      speed: 1, volume: 1, visible: true, reverse: false,
      clip: { alpha: 1, rotation: 0, scale: { x: 1, y: 1 }, transform: { x: 0, y: 0 }, flip: { horizontal: false, vertical: false } },
      render_index: 0, track_render_index: 0, track_attribute: 0,
      extra_material_refs: companions(materials, kind === 'music'), common_keyframes: [], keyframe_refs: [] });
    cursor[trackName] += duration;
    registered.push({ ai_group_type: '', create_time: -1, duration, enter_from: 0, extra_info: fileName, file_Path: finalPath,
      height: clip.height || 0, id: localId, import_time: -1, import_time_ms: -1, item_source: 1, material_color_tag: '', md5: '', metetype: kind,
      roughcut_time_range: { duration: -1, start: -1 }, sub_time_range: { duration: -1, start: -1 }, type: 0, width: clip.width || 0 });
    manifest.push({ index: index + 1, source: path.basename(clip.path), sourceSha256: sha256, inMs: 0, outMs: clip.durationMs, draftFile: 'assets/' + (kind === 'music' ? 'audio/' : 'video/') + fileName,
      mediaType: clip.mediaType, bytes: fs.statSync(copied).size, sha256, startMs: (cursor[trackName] - duration) / 1000, durationMs: clip.durationMs });
  }
  const first = clips.find(c => c.width) || { width: 1920, height: 1080 };
  const duration = Math.max(cursor.video, cursor.audio);
  const stamp = Date.now() * 1000;
  const content = { id: draftId, name: '', duration, fps: 30, version: MARKERS.version, new_version: MARKERS.new_version, color_space: 0,
    render_index_track_mode_on: true, create_time: 0, update_time: 0,
    canvas_config: { width: first.width, height: first.height, ratio: 'original' }, platform, last_modified_platform: platform,
    tracks: Object.values(tracks).filter(t => t.segments.length), materials };
  const meta = { draft_cover: '', draft_fold_path: slash(folder), draft_id: draftId, draft_is_ai_shorts: false, draft_is_invisible: false,
    draft_json_file: slash(path.join(folder, 'draft_content.json')), draft_name: name, draft_new_version: '',
    draft_root_path: stagingRoot, draft_timeline_materials_size: manifest.reduce((sum, m) => sum + m.bytes, 0),
    tm_draft_create: stamp, tm_draft_modified: stamp, tm_draft_removed: 0, tm_duration: duration,
    draft_materials: [{ type: 0, value: registered }, ...[1, 2, 3, 6, 7, 8].map(type => ({ type, value: [] }))] };
  const text = JSON.stringify(content);
  fs.writeFileSync(path.join(work, 'draft_content.json'), text);
  fs.writeFileSync(path.join(work, 'draft_info.json'), text);
  fs.writeFileSync(path.join(work, 'draft_meta_info.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(work, 'gateway-manifest.json'), JSON.stringify({ draftId, name, targetApp: 'CapCut ' + MARKERS.app_version + ' (Windows)', clips: manifest }, null, 1));
  return { code: 'OK', provider: 'capcut', kind: 'editable_draft', generated: false, draftId, name, folder, durationMs: duration / 1000,
    clips: manifest, openedInCapCut: 'unverified', installedInCapCutStore: false };
}

module.exports = { createDraft };
