# tmux, be there and be named well
function tms {
  local name=$(basename $PWD | sed -e s/\[^a-zA-Z0-9\\\//\$]/-/g -e s/--*/-/g)
  tmux new -s $name || tmux attach-session -t $name
}

# Start a HTTP server from a directory, optionally specifying the port
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

# Open conflicts at once, setting the search pattern to <<<<<<< in order to cycle through them pressing 'n'
function editconflicts() { 
  vim +/"<<<<<<<" `git diff --name-only --diff-filter=U | xargs`
}

# quickly cleanup cruft from docker machine
function docker-cleanup() {
  docker rm `docker ps -a -q`
  docker rmi `docker images | grep "^<none" | tr -s ' ' | cut -d' ' -f 3`
  docker volume prune -f
}

