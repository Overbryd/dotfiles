# PATH setup
export PATH="$HOME/bin:$PATH"
# add escripts (elixir scripts) to PATH
export PATH="/Users/lukas/.mix/escripts:$PATH"

# Rbenv setup
export RBENV_ROOT="$HOME/.rbenv"
export RBENV_BUILD_ROOT="$RBENV_ROOT/sources"
# add ruby gems/rbenv shims to PATH
export PATH="$RBENV_ROOT/bin:$PATH"
eval "$(rbenv init -)"

# vim all the things
export EDITOR="vim"
export VISUAL="$EDITOR"

# utf-8 all the things
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

# prevent API throttling when installing/updating homebrew things
export HOMEBREW_GITHUB_API_TOKEN=9d9f01f0d6cf2214fe951cc95f9d79872fbd5499
export HOMEBREW_NO_ANALYTICS=1

# setup a simple PROMPT/PS1
export PROMPT_DIRTRIM=1
export PS1="\n\W> "

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

# directory specific .envrc files
eval "$(direnv hook bash)"

# The next line updates PATH for the Google Cloud SDK.
source "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.bash.inc"

# The next line enables shell command completion for gcloud.
source "/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.bash.inc"

# Source kubectl bash completion (generated with `kubectl completion bash > ~/.kube/bash_completion`)
source ~/.kube/bash_completion

# Bash completion for brew installed tools
source "$(brew --prefix)/etc/bash_completion"

# Aliases are managed here
source ~/.bash_aliases

# Functions are managed here
source ~/.bash_functions

