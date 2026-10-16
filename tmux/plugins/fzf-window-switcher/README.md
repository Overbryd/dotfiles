# fzf-window-switcher

A tiny tmux plugin that opens an `fzf` picker for the windows shared by the current project group.

## Features

- Lists each shared project window once as `<project>/<window>`
- Keeps the client in its independent grouped view when switching windows
- Highlights the currently active window
- Uses a tmux popup so it feels native and disappears automatically after selection or cancel
- Respects `fzf`, so you can navigate with the usual keys and fuzzy matching rules

## Configuration

The script honors a few optional environment variables that you can export before launching tmux:

| Variable | Purpose | Default |
| --- | --- | --- |
| `TMUX_CMD` | tmux binary to call | `tmux` |
| `TMUX_FZF_SWITCHER_PROMPT` | Prompt shown inside `fzf` | `switch> ` |
| `TMUX_FZF_SWITCHER_OPTS` | Extra options forwarded to `fzf` | `--height 100% --reverse` |
| `FZF_BIN` | Override the `fzf` executable | `fzf` |

## Key binding

The dotfiles already contain this binding (in `.tmux.conf`):

```tmux
unbind f
bind-key f display-popup -E "$HOME/dotfiles/tmux/plugins/fzf-window-switcher/bin/fzf-window-switcher" -w 90% -h 75% -x C -y C
```

Pressing `C-b f` opens the fuzzy picker. Hit `Enter` on a window to switch to it. Press `Esc` or `Ctrl-c` to close the popup without making a selection. Use `C-b O` to switch project groups.

Make sure [`fzf`](https://github.com/junegunn/fzf) is installed and available in your `PATH`.
