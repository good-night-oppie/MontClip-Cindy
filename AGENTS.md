# Working on MontClip for Cindy

- Read README.md and docs/MIGRATION.md. Keep the plugin identity and user data compatible.
- The plugin source is here; engine/ is a pinned MontClip submodule. Shared engine changes belong upstream.
- Keep zero runtime npm dependencies and one preview/export compositor.
- Run npm test before submitting changes. Pack only dist/montclip through Cindy Forge; do not install or publish without user authorization.
- Never include recordings, credentials, generated packages or user data in Git.
- Preserve existing attribution; new AI-assisted commits use Assisted-by: Cindy (https://cindy.app).
