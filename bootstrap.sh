#!/bin/bash

# Set a hostname for the computer
hostname="$(scutil --get ComputerName)"
echo "Current hostname: $(scutil --get LocalHostName) and computer name: $hostname"
read -p "Enter a hostname (default: $hostname): " -r hostname
if [[ "x" = "x$hostname" ]]; then
  hostname="$(scutil --get ComputerName)"
fi
sudo scutil --set HostName "$hostname"
sudo scutil --set LocalHostName "$hostname"
sudo scutil --set ComputerName "$hostname"

# Generate a new ssh key
if ! test -f ~/.ssh/id_ed25519; then
  ssh-keygen -t ed25519

  # Wait for the user to add it to github
  pbcopy < ~/.ssh/id_ed25519.pub
  echo "Now login to https://github.com/settings/keys and add the key that has already been copied to your clipboard."
  read -p "Press any key to continue. Ctrl-C to abort."
fi

# Install Xcode Command Line Tools
# https://github.com/timsutton/osx-vm-templates/blob/ce8df8a7468faa7c5312444ece1b977c1b2f77a4/scripts/xcode-cli-tools.sh
touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress;
COMMAND_LINE_TOOLS=$(
  softwareupdate --list \
  | grep "\*.*Command Line" \
  | sort -n \
  | tail -n1 \
  | sed 's/* Label: //'
)
softwareupdate --install "$COMMAND_LINE_TOOLS" --verbose

# Clone my dotfiles and make them
if ! test -d /usr/local/dotfiles; then
  git clone --bare git@github.com:Overbryd/dotfiles.git --git-dir=/usr/local/dotfiles --work-tree="$HOME"
  git --git-dir=/usr/local/dotfiles config --local status.showUntrackedFiles no
  git --git-dir=/usr/local/dotfiles --work-tree="$HOME" checkout --force
fi

# Make this user
if id -Gn $(id -un) | grep -qw admin; then
  make -C /usr/local/dotfiles bootstrap-administrator
else
  make -C /usr/local/dotfiles bootstrap
fi

