# print some information on the current tmate session
function tmate-info {
  echo "rw: $(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}' 2>/dev/null)"
  echo "ro: $(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh_ro}' 2>/dev/null)"
}

# start tmate session
function tmate-start {
  tmate -S /tmp/tmate.sock new-session -d
  tmate -S /tmp/tmate.sock wait tmate-ready
  eval "$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')"
}

# tmux, be there and be named well
function tms {
  local name=$(basename $PWD | sed -e s/\[^a-zA-Z0-9\\\//\$]/-/g -e s/--*/-/g)
  tmux new -s $name || tmux attach-session -t $name
}

# docker-machine, be there and make it happen
function dms {
  docker-machine start
  eval `docker-machine env`
}

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

# quickly cleanup cruft from docker machine
function docker-cleanup() {
  docker rm `docker ps -a -q`
  docker rmi `docker images | grep "^<none" | tr -s ' ' | cut -d' ' -f 3`
  docker volume prune -f
}

# quickly peek at secrets stored in kubernetes yaml files (base64 encoded)
function print-kube-secrets() {
  for file in $@; do
    echo "${file}:"
    yaml2json < $file | jq '[.select(.type == "Secret") | .data | to_entries[] | .value = (.value | @base64d)] | from_entries'
  done
}

# better bundle open, that changes current directory
function bundle-open() {
  (cd $($(which bundle) show $@) && $EDITOR .)
}

# Use local dns server
function localdns() {
  if [[ "$1" == "on" ]]; then
    sudo networksetup -setdnsservers Wi-Fi 127.0.0.1
    sudo killall -HUP mDNSResponder
  elif [[ "$1" == "off" ]]; then
    sudo networksetup -setdnsservers Wi-Fi empty
    sudo killall -HUP mDNSResponder
  else
    cat <<USAGE
Usage: localdns <enable|disable>
Enables or disables local DNS configuration (knot-resolver@127.0.0.1 ==(tls)==> cloudflare)
USAGE
  fi
}
