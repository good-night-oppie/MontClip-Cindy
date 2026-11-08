"use strict";
// Author build setting, never a user preference or an automatic release check.
function applyAsrGate(main, manifest, config) {
  if (!config || typeof config.enabled !== "boolean") throw new Error("ASR enabled must be a boolean");
  const marker = "/* build:asr-download */ false";
  if (main.split(marker).length !== 2) throw new Error("ASR build marker missing or repeated");
  const tools = manifest.tools.filter((t) => t.name !== "montclip_install_asr");
  if (config.enabled) {
    if (!config.tool || config.tool.name !== "montclip_install_asr") throw new Error("ASR tool definition missing");
    tools.push(config.tool);
  }
  return { main: main.replace(marker, "/* build:asr-download */ " + config.enabled), manifest: { ...manifest, tools } };
}
module.exports = { applyAsrGate };
