# OpenViking Memory Plugin for CodeBuddy

A native [CodeBuddy](https://www.codebuddy.ai) plugin that adds OpenViking's
semantic long-term memory to CodeBuddy (CLI and IDE): automatic recall before
every prompt, automatic capture of each turn, session-start context injection,
and the OpenViking MCP tools through a bundled stdio proxy.

CodeBuddy's extension model aligns with Claude Code's, so this plugin is a
port of [claude-code-memory-plugin](../claude-code-memory-plugin/): the hook
lifecycle, the payload JSON and the shared runtime
([memory-plugin-shared](../memory-plugin-shared/)) are the same. What differs:

- the manifest lives in `.codebuddy-plugin/plugin.json` (a
  [CodeBuddy plugin](https://www.codebuddy.ai/docs/zh/cli/plugins-reference));
- hook commands use `${CODEBUDDY_PLUGIN_ROOT}`;
- the loader is registered as harness `codebuddy` (`plugin.codebuddy` in
  `ovcli.conf`, a `codebuddy` section in `ov.conf`, log file `cb-hooks.log`);
- the client-side compressor's host CLI defaults to `codebuddy`.

## Layout

```
.codebuddy-plugin/plugin.json   # plugin manifest (name openviking-memory)
.mcp.json                       # stdio MCP server: "openviking"
hooks/hooks.json                # the nine lifecycle hooks
commands/ov.md                  # /ov status command
skills/                         # openviking-memory, openviking-skills,
                                # ov-experience-memory (synced), ov-memory-doctor
scripts/                        # hook scripts; lib/ is host glue,
                                # shared/ is generated from memory-plugin-shared
servers/mcp-proxy.mjs           # stdio -> streamable-HTTP MCP proxy
setup-helper/                   # thin wrappers around the shared installer
```

## Install

```bash
curl -fsSL https://openviking.ai/install | bash -s -- --harness codebuddy
```

or manually:

```bash
codebuddy plugin marketplace add https://raw.githubusercontent.com/volcengine/OpenViking/main/.codebuddy-plugin/marketplace.json
codebuddy plugin install openviking-memory@openviking
```

Configuration, verification and troubleshooting: the
[integration docs](../../docs/zh/agent-integrations/20-codebuddy.md)
(English: `docs/en/agent-integrations/20-codebuddy.md`). The environment
variables are the Claude Code plugin's — see that plugin's README.

## Development

```bash
node --test scripts/*.test.mjs scripts/lib/*.test.mjs
```

`scripts/shared/` is generated — refresh it with
`node examples/memory-plugin-shared/sync.mjs` after changing the shared
runtime. `sync.test.mjs` fails when the committed copies drift.
