#!/bin/bash

function install_osx_gcc() {
	source ~/.dotfiles/.functions
	osx_version=$(sw_vers -productVersion)
	if [ "$osx_version" =~ ^10\.6 ]; then
		install "https://github.com/downloads/kennethreitz/osx-gcc-installer/GCC-10.6.pkg"
	elif [ "$osx_version" =~ ^10\.7 ]; then
		install "https://github.com/downloads/kennethreitz/osx-gcc-installer/GCC-10.7-v2.pkg"
	fi
}

function install_homebrew() {
	which brew || /usr/bin/ruby -e "$(curl -fsSL https://raw.github.com/gist/323731)"
}

function install_ruby_tools() {
	for formula in rbenv ruby-build rbenv-gemset; do
		brew list $formula 2> /dev/null || brew install $formula
	done
}

install_osx_gcc
install_homebrew
install_ruby_tools
