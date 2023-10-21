#!/bin/bash

if !(id -Gn $(id -un) | grep -qw admin); then
  echo "This must be executed by an administrative user on the system."
  exit 1
fi

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
if !(softwareupdate --history | grep "Command Line Tools"); then
  touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
  COMMAND_LINE_TOOLS=$(
    softwareupdate --list \
    | grep "\*.*Command Line" \
    | sort -n \
    | tail -n1 \
    | sed 's/* Label: //'
  )
  softwareupdate --install "$COMMAND_LINE_TOOLS" --verbose
  rm /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
fi

# Clone the dotfiles
if ! test -d /usr/local/dotfiles; then
  sudo mkdir /usr/local/dotfiles
  sudo chown $(id -un):admin /usr/local/dotfiles
  git clone git@github.com:Overbryd/dotfiles.git /usr/local/dotfiles
  cd /usr/local/dotfiles
  git checkout 2023-10
  cd -
fi

# Make the administrative stuff
export PATH="$PATH:/usr/local/dotfiles/.bin"
source /usr/local/dotfiles/.profile.d/homebrew
make -C /usr/local/dotfiles bootstrap-administrator

