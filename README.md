# OpenViking CodeBuddy plugin (marketplace)

A standalone CodeBuddy marketplace that ships exactly one plugin:

**openviking-memory** — long-term semantic memory for CodeBuddy, powered by
[OpenViking](https://github.com/zhhuak/OpenViking).

This repository is generated: `.github/scripts/stage-codebuddy-plugin-marketplace.sh`
in the OpenViking repository mirrors `examples/codebuddy-memory-plugin` and the
marketplace manifest here on every change to them. It exists because the
CodeBuddy client replaces a GitHub marketplace by cloning it again, and cloning
the whole monorepo trips that client's bulk-delete guard on install and update.

Edits made here are overwritten by the next mirror run — send changes to the
OpenViking repository instead.

## Install

```bash
codebuddy plugin marketplace add https://github.com/zhhuak/openviking-codebuddy-plugin -n openviking
codebuddy plugin install openviking-memory@openviking
```

## Update

```bash
codebuddy plugin marketplace update openviking
codebuddy plugin update openviking-memory@openviking
```

`codebuddy plugin list` reports the version that ended up installed.

## Layout

```
.codebuddy-plugin/marketplace.json   marketplace manifest (source: ./codebuddy-memory-plugin)
codebuddy-memory-plugin/             the plugin (hooks, MCP proxy, skills, scripts)
```
