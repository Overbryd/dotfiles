# if we are in a tmate session, alias tmux as tmate
if [[ $TMUX =~ tmate ]]; then alias tmux=tmate; fi

# nice directory listing
alias l="ls -Glah"

# nice directory tree listing showing permissions, user, group and size (human readable)
alias t="tree -L 1 --dirsfirst -shugp"
# nice directory tree listing, but just 2 levels
alias tt="tree -L 2 --dirsfirst"

# I use git so often that aliasing it saves a lot
alias g="git"

