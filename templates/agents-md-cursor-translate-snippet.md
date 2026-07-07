## cursor-translate

Token-saving RU↔EN layer. MCP server: **`cursor-translate`**.

**Local IDE — docs:** use `Read` on `.md`; hooks serve English cache automatically.

**MCP — call when:**

- Long Russian user instructions → `translate` (`ru_en`) before deep reasoning or subagent tasks.
- Cloud / no lazy read → `resolve_doc` (`file_path`, `include_body: true`) for Cyrillic markdown.
- Long English reply to a Russian-speaking user → `translate` (`en_ru`) on prose only.

**Never translate:** code, paths, env vars, task IDs (`AUD-*`, `BL-*`), identifiers.

Full playbook: cursor-translate plugin rules `mcp-translate.mdc`.
