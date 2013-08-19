
# Load ~/.bash_prompt, ~/.exports, ~/.aliases, ~/.functions and ~/.extra
# ~/.extra can be used for settings you don’t want to commit
FILES="
bash_prompt
exports
aliases
functions
extra
"
for file in $FILES; do
  [ -r ".$file" ] && source ".$file"
done; unset file; unset FILES

# Load completions
for completion in ~/.dotfiles/completions/*; do
  [ -r "$completion" ] && source "$completion"
done; unset completion

# Case-insensitive globbing (used in pathname expansion)
shopt -s nocaseglob
