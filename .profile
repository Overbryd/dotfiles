export RBENV_ROOT="$HOME/.rbenv"
export RBENV_BUILD_ROOT="$RBENV_ROOT/sources"
export PATH="$RBENV_ROOT/bin:./node_modules/.bin:$PATH"
eval "$(rbenv init -)"
alias l="ls -Glah"
alias g="git"
alias minecraft="java -d64 -Xms4096M -Xmx4096M -jar Minecraft.app/Contents/Resources/Java/MinecraftLauncher.jar"
export EDITOR="vim"
export PATH="$HOME/bin:$PATH"
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8
export HOMEBREW_GITHUB_API_TOKEN=9d9f01f0d6cf2214fe951cc95f9d79872fbd5499
export HOMEBREW_NO_ANALYTICS=1

# ansible configuration, used at Betterplace
export ANSIBLE_REMOTE_USER=lukas.rieder
export ANSIBLE_HOST_KEY_CHECKING=False

# if we are in a tmate session, alias tmux as tmate
if [[ $TMUX =~ tmate ]]; then alias tmux=tmate; fi
function tmate-info {
  echo "rw: $(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' 2>/dev/null)"
  echo "ro: $(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh_ro}' 2>/dev/null)"
}
function tmate-start {
  tmate -S /tmp/tmate.sock new-session -d
  tmate -S /tmp/tmate.sock wait tmate-ready
  eval "$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')"
}

# Fancy prompt
function git-prompt {
  if (git status >/dev/null 2>&1); then
    local symbolic_ref_head=$(git symbolic-ref HEAD 2> /dev/null)
    local branch=${symbolic_ref_head#refs/heads/}
    local stash_count=$(git stash list --oneline 2> /dev/null | sed -n "$=")
    local dirty_star=$(git status --porcelain . | sed -e "$ ! d" -e "s/.*/*/")
    echo "$branch$stash_count$dirty_star"
  else
    echo ""
  fi
}
function rbenv-prompt {
  local version=$(rbenv version-name | sed -e 's/system/s/; s/jruby-/j/')
  local gemset=$(rbenv gemset active 2>&1 | cut -d ' ' -f1)
  if (test "$gemset" = "no"); then
    echo " $version"
  else
    echo " $version@$gemset"
  fi
}
if [[ $TERM != "" ]]; then
  export red=$(tput setaf 1)
  export green=$(tput setaf 2)
  export yellow=$(tput setaf 3)
  export bold=$(tput bold)
  export reset=$(tput sgr0)
fi
export PROMPT_DIRTRIM=1
export PS1="\[$yellow\]\$(git-prompt)\[$red\]\$(rbenv-prompt)\n\[$reset\]\w: "

# Case-insensitive globbing (used in pathname expansion)
shopt -s nocaseglob

# Long history without duplicates, flush after every command
export HISTCONTROL=ignoreboth
export HISTSIZE=20000

shopt -s histappend
export PROMPT_COMMAND="$PROMPT_COMMAND; history -a; history -n" # preserve other PROMPT_COMMAND stuff!

# Start an HTTP server from a directory, optionally specifying the port
function server() {
  local port="${1:-8000}"
  open "http://localhost:${port}/"
  # Set the default Content-Type to `text/plain` instead of `application/octet-stream`
  # And serve everything as UTF-8 (although not technically correct, this doesn’t break anything for binary files)
  python -c $'import SimpleHTTPServer;\nmap = SimpleHTTPServer.SimpleHTTPRequestHandler.extensions_map;\nmap[""] = "text/plain";\nfor key, value in map.items():\n\tmap[key] = value + ";charset=UTF-8";\nSimpleHTTPServer.test();' "$port"
}

# Mirror a complete website
function mirror-website() {
  local url=$@
  local domain=`expr "$url" : '^http[s]*://\([^/?]*\)'`
  wget \
    --recursive \
    --no-clobber \
    --page-requisites \
    --html-extension \
    --convert-links \
    --restrict-file-names=windows \
    --domains $domain \
    --no-parent \
    $url
}

# Put my computer to sleep in X minutes
function sleep-in() {
  local minutes=$1
  if [ -z "$minutes" ]; then
    echo "Usage: sleep-in <minutes>"
  else
    local datetime=`date -v+${minutes}M +"%m/%d/%y %H:%M:%S"`
    echo "Scheduling sleep at $datetime"
    sudo pmset schedule sleep "$datetime"
  fi
}

# Open conflicts at once, setting the search pattern to <<<<<<< in order to cycle through them pressing 'n'
function editconflicts() { 
  vim +/"<<<<<<<" `git diff --name-only --diff-filter=U | xargs`
}

# Selectively load bash completions for better performance
function load-bash-completion() {
  local file="$(brew --prefix)/etc/bash_completion.d/$1"
  if [ -f "$file" ]; then
    . "$file"
  fi
}
. "$(brew --prefix)/etc/bash_completion"
# load-bash-completion "git-completion.bash"
# load-bash-completion "ssh"

# Heroku Toolbelt
export PATH="/usr/local/heroku/bin:$PATH"
