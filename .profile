# vim all the things
export EDITOR="vim"
export VISUAL="$EDITOR"

# utf-8 all the things
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

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
source ~/.profile.d/prompt
source ~/.profile.d/pyenv
source ~/.profile.d/homebrew
source ~/.profile.d/path
source ~/.profile.d/direnv
source ~/.profile.d/google-cloud-sdk

source ~/.completion.d/homebrew_bash_completion
source ~/.completion.d/serverless
source ~/.completion.d/kubectl

