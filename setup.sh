#!/bin/bash

function brew-install() {
  local executeable=$1
  if ! which $executeable; then brew install $executeable; fi
}

function rbenv-install-plugin() {
  local repository=$1
  local name=${repository##*/}
  if [ ! -d .rbenv/plugins/$name ]; then
    git clone "https://github.com/$repository.git" .rbenv/plugins/$name
  fi
}

cd $HOME

# symlink dotfiles
for file in dotfiles/.{profile,vimrc,tmux.conf,vim,slate,inputrc,gitignore,gitconfig,gitattributes,gemrc}; do
  if [ ! -e "$file" ]; then ln -s "$file" .; fi
done

# install homebrew
if ! which brew; then ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"; fi
# install silver searcher
brew-install ag
# install readline, useful in combination with ruby-build because it will link ruby installations to it
brew-install readline
# install homebrew-cask to install other osx related stuff
brew install caskroom/cask/brew-cask
# tap into homebrew-fonts
brew tap caskroom/fonts
# install Adobe Source Code Pro
brew cask install font-source-code-pro

# install direnv for project specific .envrc support
brew install direnv

# install rbenv
if [ ! -d .rbenv ]; then git clone https://github.com/sstephenson/rbenv.git .rbenv; fi

# install rbenv plugins
mkdir -p .rbenv/plugins
rbenv-install-plugin rkh/rbenv-update
rbenv-install-plugin sstephenson/ruby-build
rbenv-install-plugin jf/rbenv-gemset

# create vim directories
mkdir -p .vimtmp/{backup,swap,undo}

# install vundle and all plugins for vim
if [ ! -d .vim/bundle/Vundle.vim ]; then git clone https://github.com/gmarik/Vundle.vim.git .vim/bundle/Vundle.vim; fi
vim +PluginInstall +qall

# install vim command-t extension
if [ ! -f .vim/bundle/command-t/ruby/command-t/.done ]; then
  cd .vim/bundle/command-t/ruby/command-t
  ruby extconf.rb
  if [ make ]; then touch .done; fi
  cd -
fi

# install slate
if [ ! -d /Applications/Slate.app ]; then
  cd /Applications && curl http://www.ninjamonkeysoftware.com/slate/versions/slate-latest.tar.gz | tar xz
  cd -
fi

# source .profile
. .profile

