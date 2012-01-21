#!/bin/bash

function install_homebrew() {
	/usr/bin/ruby -e "$(curl -fsSL https://raw.github.com/gist/323731)"
}

function install_ruby_tools() {
	brew install rbenv ruby-build rbenv-gemset
}
