# Load ~/.bash_prompt, ~/.exports, ~/.aliases, ~/.functions and ~/.extra
# ~/.extra can be used for settings you don’t want to commit
for file in ~/.{bash_prompt,exports,aliases,functions,extra}; do
  [ -r "$file" ] && source "$file"
done
unset file

# Load completions
for completion in ~/.dotfiles/completions/*; do
  [ -r "$completion" ] && source "$completion"
done

# Case-insensitive globbing (used in pathname expansion)
shopt -s nocaseglob
