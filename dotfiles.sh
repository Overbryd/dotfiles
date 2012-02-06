#!/bin/bash

function update() {
  cd ~/.dotfiles && git pull
}

function download() {
  cd ~ && git clone git://github.com/Overbryd/dotfiles.git .dotfiles
}

function symlink() {
  for file in $(find ~/.dotfiles -name ".*" -type f); do
    basename=$(basename $file)
    if [ -e ~/$basename ]; then
      echo "Skipping symlink to ~/$basename"
    else
      cd ~ && ln -s .dotfiles/$basename ~/$basename
    fi
  done
}

if [ -d ~/.dotfiles ]; then
  update
else
  download
fi

symlink
