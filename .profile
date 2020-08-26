##
# PATH setup
export PATH="$HOME/.bin:$PATH"
# add escripts (elixir scripts) to PATH
export PATH="/Users/lukas/.mix/escripts:$PATH"
# add brew version of curl to PATH
export PATH="/usr/local/opt/curl/bin:$PATH"

# directory specific .envrc files
eval "$(direnv hook bash)"

# vim all the things
export EDITOR="vim"
export VISUAL="$EDITOR"

# utf-8 all the things
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

##
# Homebrew settings

# prevent API throttling when installing/updating homebrew things
export HOMEBREW_GITHUB_API_TOKEN=9d9f01f0d6cf2214fe951cc95f9d79872fbd5499
export HOMEBREW_NO_ANALYTICS=1
export HOMEBREW_NO_INSECURE_REDIRECT=1
export HOMEBREW_CASK_OPTS=--require-sha

# Bash completion for brew installed tools
source "$(brew --prefix)/etc/bash_completion"

# Setup a simple PROMPT/PS1
export PROMPT_DIRTRIM=1
export PS1="\n\W$ "

# Case-insensitive globbing (used in pathname expansion)
shopt -s nocaseglob

# Long history without duplicates, flush after every command
export HISTCONTROL=ignoreboth
export HISTSIZE=1000000

# directly save every command to history
shopt -s histappend
if [ "x$PROMPT_COMMAND" != "x" ]; then
  export PROMPT_COMMAND="$PROMPT_COMMAND;"
fi
export PROMPT_COMMAND="$PROMPT_COMMAND history -a; history -n" # preserve other PROMPT_COMMAND stuff!

# Aliases are managed here
source ~/.bash_aliases

# Functions are managed here
source ~/.bash_functions

