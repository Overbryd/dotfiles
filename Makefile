EXCLUDED_DOTFILES := .git .gitattributes .gitignore .gitmodules
DOTFILES := $(addprefix ~/, $(filter-out $(EXCLUDED_DOTFILES), $(wildcard .*)))

all: \
	brew \
	casks \
	bash \
	vim \
	tmux \
	dotfiles

brew: \
	/usr/local/bin/brew
	# upgrade all installed packages
	brew upgrade
	# GNU coreutils instead of outdated mac os defaults
	brew install coreutils
	brew install moreutils
	# newer version of git
	brew install git
	# git-crypt for encrypted repository contents
	brew install git-crypt
	# install silver searcher, a very fast grep alternative
	brew install ag
	# tree, a nice directory tree listing
	brew install tree
	# install readline, useful in combination with ruby-build because it will link ruby installations to it
	brew install readline
	# install direnv for project specific .envrc support
	brew install direnv
	# postgres
	brew install postgres 
	# mysql
	brew install mysql
	# elasticsearch
	brew install elasticsearch
	# sed, stream editor, but replace mac os version
	brew install gnu-sed --with-default-names
	# erlang programming language
	brew install erlang
	# elixir programming language
	brew install elixir
	# docker related tools
	brew install docker
	brew install docker-machine
	brew install docker-compose
	# handle amazon web services related stuff
	brew install awscli
	# handle json on the command line
	brew install jq --HEAD
	# pipeviewer allows to display throughput/eta information on unix pipes
	brew install pv

/usr/local/bin/brew:
	ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

casks: \
	/usr/local/bin/brew
	# tap homebrew-cask to install other osx related stuff
	brew tap caskroom/cask
	# tap into homebrew-fonts
	brew tap caskroom/fonts
	# install Adobe Source Code Pro, an excellent mono space font for programming
	brew cask install font-source-code-pro
	# spectacle for mac osx window management/tiling
	brew cask install spectacle
	# opera for browsing the web
	brew cask install opera
	# dropbox synchronised files across devices
	brew cask install dropbox
	# 1password is an excellent password manager
	brew cask install 1password
	# gpgtools provide me with all gpp related things
	brew cask install gpgtools
	# virtualbox to handle virtual machines
	brew cask install virtualbox
	# handle google cloud related stuff
	brew cask install google-cloud-sdk

bash:
	# newer version of bash
	brew install bash
	brew install bash-completion
	# change shell to homebrew bash
	echo "/usr/local/bin/bash" | sudo tee -a /etc/shells
	chsh -s /usr/local/bin/bash

vim: \
	vim-itself \
	vim-plugins

vim-itself:
	# newer version of vim
	brew install vim --with-override-system-vi
	# create vim directories
	mkdir -p .vim/tmp/{backup,swap,undo}

vim-plugins: \
	~/.vim/bundle/Vundle.vim
	vim +PluginInstall +qall

# install vundle, a vim package manager
~/.vim/bundle/Vundle.vim:
	git clone https://github.com/gmarik/Vundle.vim.git ~.vim/bundle/Vundle.vim

tmux: \
	~/.tmux.conf \
	~/.tmux/plugins/tpm
	brew install tmux
	tmux source ~/.tmux.conf
	# install plugins
	~/.tmux/plugins/tpm/bin/install_plugins

~/.tmux/plugins/tpm:
	# install tmux plugin manager
	git clone --depth=10 https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

dotfiles: $(DOTFILES)

~/.%:
	cd ~ && ln -sv dotfiles/$(notdir $@) $@

