# fzf-window-switcher

A tiny tmux plugin that opens an `fzf` picker for windows across all tmux project groups and standalone sessions.

## Features

- Lists windows from every project group and standalone session as `<project-or-session>/<window>`
- Lists shared project windows once, without duplicate anchor/view entries
- Keeps the client's independent grouped-view identity when switching within or across projects
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

Pressing `C-b f` opens the all-windows fuzzy picker. Hit `Enter` on a window to switch to it. Press `Esc` or `Ctrl-c` to close the popup without making a selection. Cross-project choices go through `tms`, while standalone sessions use `switch-client`. `C-b O` remains the project-directory picker.

Make sure [`fzf`](https://github.com/junegunn/fzf) is installed and available in your `PATH`.
