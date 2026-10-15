# OpenViking CodeBuddy plugin (marketplace)

A standalone CodeBuddy marketplace that ships exactly one plugin:
**openviking-memory** — long-term semantic memory for CodeBuddy, powered by
[OpenViking](https://github.com/zhhuak/OpenViking).

The plugin source is generated from `examples/codebuddy-memory-plugin/` in the
OpenViking repository; this repository exists so installing or updating the
plugin clones a small tree instead of the whole monorepo.

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

`codebuddy plugin list` should then report the plugin version.

## Layout

```
.codebuddy-plugin/marketplace.json   marketplace catalog
codebuddy-memory-plugin/             the plugin (hooks, MCP proxy, skills)
```
