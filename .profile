eval "$(rbenv init -)"
alias l="ls -Glah"
alias g="git"
alias minecraft="java -d64 -Xms4096M -Xmx4096M -jar Minecraft.app/Contents/Resources/Java/MinecraftLauncher.jar"
export EDITOR="mvim -f"
export PATH="$HOME/bin:$PATH"
export LC_ALL=en_US.UTF-8
export LANG=en_US.UTF-8

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
export red=$(tput setaf 1)
export green=$(tput setaf 2)
export yellow=$(tput setaf 3)
export bold=$(tput bold)
export reset=$(tput sgr0)
export PROMPT_DIRTRIM=1
export PS1="\[$yellow\]\$(git-prompt)\[$red\]\$(rbenv-prompt)\n\[$reset\]\w: "

# Case-insensitive globbing (used in pathname expansion)
shopt -s nocaseglob

# Long history without duplicates, flush after every command
export HISTCONTROL=ignoreboth
export HISTSIZE=20000

# Name the current tab after the current directory
function name-tab {
  printf "\e]1;%s\a" "${PWD##*/}"
}
export PROMPT_COMMAND="history -a; name-tab; $PROMPT_COMMAND" # preserve other PROMPT_COMMAND stuff!
shopt -s histappend

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

# bash-completion installed via homebrew
if [ -f "$(brew --prefix)/share/bash-completion/bash_completion" ]; then
  . $(brew --prefix)/share/bash-completion/bash_completion
fi

# Heroku Toolbelt
export PATH="/usr/local/heroku/bin:$PATH"