/* Plugin diagnostics: copied reports and console messages contain only a timestamp,
   an explicitly allowed code, and fixed text. Raw error strings and arbitrary metadata
   are never read by these output functions. The legacy scrub helper remains exported
   for compatibility; it is not the privacy boundary for logs or copied reports. */
(function (root) {
  "use strict";
  const REMOVED = "[removed]";
  /* a folder part of a path: everything up to the last separator, so the file name after it stays. A folder name may
     have spaces (直播 回放) but stops at ; , % — what sits between two items in an error line, not in a folder name */
  const SEG = "[^\\\\/:*?\"<>|;,%\\r\\n]*";
  // a drive letter starts a word (not the "p:" of "http:")
  const WIN_DIR = new RegExp(`(?:(?<![A-Za-z0-9])[A-Za-z]:|%[A-Za-z_]+%|\\\\\\\\${SEG})[\\\\/](?:${SEG}[\\\\/])*`, "g");
  const POSIX_DIR = /(^|[\s("'=,;])(?:~|\/(?:home|Users|root|tmp|var|private|mnt|media|Volumes|opt|data|srv|run))\/(?:[^/\s"'<>]*\/)*/g;
  function scrub(text) {
    let s = String(text == null ? "" : text);
    s = s.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer " + REMOVED);
    s = s.replace(/\bsk-[A-Za-z0-9_-]{6,}/g, REMOVED);
    s = s.replace(/\b(token|access_token|api_key|apikey|api-key|key|secret|password|session|sig|signature)=([^&\s"'#]+)/gi, `$1=${REMOVED}`);
    s = s.replace(/\b[0-9a-fA-F]{64}\b/g, REMOVED);
    s = s.replace(WIN_DIR, "");
    s = s.replace(POSIX_DIR, "$1");
    return s;
  }
  const stamp = (at) => (at instanceof Date ? at : new Date()).toISOString();
  // Only identifiers owned by this plugin are diagnostic metadata. Format checks
  // alone would allow arbitrary uppercase secrets to masquerade as error codes.
  const CODES = new Set([
    "UNKNOWN", "FAILED", "NODE_REQUEST_FAILED", "CANDIDATE_FAILED",
    "DATA_DIR_IN_USE", "TASK_REQUIRED", "INSTALL_BUSY", "INSTALL_FAILED",
    "FFMPEG_REFRESH_FAILED", "FFMPEG_TOO_OLD", "FFMPEG_MISSING",
    "UNSUPPORTED_PLATFORM", "HOST_TOO_OLD", "DOWNLOAD_FAILED", "CANCELLED",
    "SIZE_MISMATCH", "SHA256_MISMATCH", "BAD_ARCHIVE", "ENOSPC", "EACCES",
    "EPERM", "ENOENT", "NO_EDITOR", "NO_JOB", "NO_FILE", "NOT_DONE",
    "EXPORT_REFUSED", "EXPORT_TASK_MISMATCH", "EXPORT_PROJECT_CHANGED",
    "ASR_ENGINE_MISSING", "ASR_MODEL_MISSING", "ASR_CANCELLED",
    "CHILD_EXIT_UNCONFIRMED", "TOOL_NOT_FOUND", "PROTOCOL_ERROR"
  ]);
  /** Logs and copied diagnostics contain time and a controlled code, never raw detail. */
  function logLine(problem, at) {
    const p = problem || {};
    return `[MontClip] ${stamp(at)} ${typeof p.code === "string" && CODES.has(p.code) ? p.code : "UNKNOWN"}: Operation failed.`;
  }
  /** Copy the same fixed metadata as the log; do not inspect arbitrary error text. */
  function copyLine(problem, at) {
    return logLine(problem, at);
  }
  const api = { scrub, logLine, copyLine };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MontClipProblem = api;
})(typeof window !== "undefined" ? window : globalThis);
