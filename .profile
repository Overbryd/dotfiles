##
# PATH setup
export PATH="$HOME/.bin:$PATH"
# add brew version of curl to PATH
export PATH="/usr/local/opt/curl/bin:$PATH"
# add brew /usr/local/sbin
export PATH="/usr/local/sbin:$PATH"

# directory specific .envrc files
eval "$(direnv hook bash)"

# vim all the things
export EDITOR="vim"
export VISUAL="$EDITOR"

# utf-8 all the things
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# pyenv
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
if command -v pyenv 1>/dev/null 2>&1; then
  eval "$(pyenv init -)"
fi

##
# Homebrew settings
# Note: I am using a isolated user setup, no-one except that 'binary' user can write to the
#       Homebrew directories.
alias brew="sudo -ubinary brew"
alias cask="/usr/local/bin/brew --cask"
export HOMEBREW_NO_ANALYTICS=1
export HOMEBREW_NO_INSECURE_REDIRECT=1
export HOMEBREW_CASK_OPTS=--require-sha
export HOMEBREW_CACHE=/usr/local/Caches
export HOMEBREW_LOGS=/usr/local/Logs/Homebrew
export HOMEBREW_PREFIX=/usr/local

# Bash completion for brew installed tools
source "$HOMEBREW_PREFIX/etc/bash_completion"

# Pin down google cloud sdk python executable
export CLOUDSDK_PYTHON="/usr/local/opt/python@3.8/libexec/bin/python"
source "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"
source "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.bash.inc"

# Setup a simple PROMPT/PS1
export PROMPT_DIRTRIM=1
if id -Gn | grep admin >/dev/null; then
  export ADMIN_PROMPT="\[\e[37;41m\]"
else
  export ADMIN_PROMPT=""
fi
export PS1="\n${ADMIN_PROMPT}\W$\[\e[m\] "

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

source ~/.profile.d/credentials
source ~/.profile.d/aliases
source ~/.profile.d/functions

