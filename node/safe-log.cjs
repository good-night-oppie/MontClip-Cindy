"use strict";
// Logs are metadata, never arbitrary engine messages or serialized user objects.
const tag = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : "UNKNOWN";
function event(entry = {}) {
  const out = {at:new Date().toISOString(),event:tag(entry.event)};
  if (entry.code !== undefined) out.code = tag(entry.code);
  for (const key of ["ms","progress","engine","browser"]) {
    if (typeof entry[key] === "boolean" || (typeof entry[key] === "number" && Number.isFinite(entry[key]))) out[key]=entry[key];
  }
  return "[montclip] "+JSON.stringify(out)+"\n";
}
function consoleLine(level) { return "[montclip-engine] "+tag(level)+" (message omitted)\n"; }
module.exports={event,consoleLine};
