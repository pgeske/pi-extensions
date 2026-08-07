# pi-extensions (deprecated)

This repository has been consolidated into [`pgeske/agent-config`](https://github.com/pgeske/agent-config).

Do not install both packages. The maintained setup now keeps Pi extensions, skills, instructions, fullscreen launchers, tmux/terminal/editor dotfiles, tests, and fresh-machine bootstrap automation together in one repository.

## Install the current setup

```bash
git clone https://github.com/pgeske/agent-config.git ~/agent-config
cd ~/agent-config
./bootstrap.sh
```

For updates:

```bash
cd ~/agent-config
git pull --ff-only
./bootstrap.sh
```

The historical MCP bridge implementation remains here for reference, but receives no updates. Use the version in `pgeske/agent-config`.
