# fzf-window-switcher

A tiny tmux plugin that replaces `C-b w` with an `fzf` powered picker for windows and panes. It keeps the familiar workflow of pressing `C-b w`, but shows a searchable list that you can filter before pressing `Enter` to jump to the selected window or pane.

## Features

- Lists **all windows** (across sessions) and **all panes** with their session/index, current command, and working directory
- Highlights the currently active window/pane so you always know where you are
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
unbind w
bind-key w display-popup -E "$HOME/dotfiles/tmux/plugins/fzf-window-switcher/bin/fzf-window-switcher" -w 90% -h 75% -x C -y C
```

Pressing `C-b w` now opens the fuzzy picker. Hit `Enter` on a window to switch to it, or on a pane to jump straight to that pane. Press `Esc` or `Ctrl-c` to close the popup without making a selection.

Make sure [`fzf`](https://github.com/junegunn/fzf) is installed and available in your `PATH`.
