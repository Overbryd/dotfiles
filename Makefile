EXCLUDED_DOTFILES := .git .git-crypt .gitattributes .gitignore .gitmodules .ssh
DOTFILES := $(addprefix ~/, $(filter-out $(EXCLUDED_DOTFILES), $(wildcard .*)))

# everything, geared towards to be run for setup and maintenance
all: \
	brew \
	casks \
	fonts \
	bash \
	ruby \
	vim \
	tmux \
	dotfiles \
	defaults \
	docker \
	harder

# bootstrap only, add one-time bootstrap tasks here
# setups everything
# restore .gnupg and thus decrypt the secrets from this repository
# setup ssh config (relies on decrypted repository)
bootstrap: \
	all \
	~/.gnupg \
	~/.ssh/config

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
	# redis
	brew install redis
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
	# pstree is nice to look at
	brew install pstree
	# watch is great for building an overview on running stuff
	brew install watch
	# nmap is great for test and probing network related stuff
	brew install nmap

/usr/local/bin/brew:
	ruby -e "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
	brew analytics off

casks: \
	/usr/local/bin/brew
	# tap homebrew-cask to install other osx related stuff
	brew tap caskroom/cask
	# spectacle for mac osx window management/tiling
	brew cask install spectacle
	# opera for browsing the web
	brew cask install opera
	# dropbox synchronised files across devices
	brew cask install dropbox
	# 1password is an excellent password manager
	brew cask install 1password
	# gpg-suite provide me with all gpp related things
	brew cask install gpg-suite
	# virtualbox to handle virtual machines
	brew cask install virtualbox
	# handle google cloud related stuff
	brew cask install google-cloud-sdk
	# adium is a nice chat client
	brew cask install adium
	# I do some JRuby development where java comes in handy :)
	brew cask install java
	# Skype is still used by many of my friends :)
	brew cask install skype
	# VLC an excellent video player
	brew cask install vlc
	# TextMate is an excellent GUI based editor
	brew cask install textmate
	# Flux reduces blue/green colors on the display spectrum and helps me sleep better
	brew cask install flux
	# slack is my preferred team chat
	brew cask install slack
	# launchbar is my preferred app launcher/clipboard history, calculator and goto mac utility
	brew cask install launchbar
	# graphiql helps debugging graphql based apis
	brew cask install graphiql
	# sequel-pro is a great graphical MySQL client
	brew cask install sequel-pro
	# postico is a great graphical PostgreSQL client
	brew cask install postico
	# itsycal is a nice menu bar clock replacement that features a calendar with events from iCal
	brew cask install itsycal
	# macdown is a nice markdown editor, I use it to write my articles/presentation scripts
	brew cask install macdown

fonts: \
	/usr/local/bin/brew
	# tap homebrew-fonts to install freely available fonts
	brew tap caskroom/fonts
	# install IBM Plex, an excellent modern font (https://www.ibm.com/plex/)
	brew cask install font-ibm-plex
	# install Adobe Source Code Pro, an excellent mono space font for programming
	brew cask install font-source-code-pro

bash:
	# newer version of bash
	brew install bash
	brew install bash-completion
	# change shell to homebrew bash
	echo "/usr/local/bin/bash" | sudo tee -a /etc/shells
	chsh -s /usr/local/bin/bash

ruby: \
	~/.rbenv \
	~/.rbenv/plugins/ruby-build \
	~/.rbenv/plugins/rbenv-update \
	~/.rbenv/plugins/rbenv-readline \
	~/.rbenv/plugins/rbenv-gemset

# rbenv is an amazing ruby version manager, simple, straightforward, local
~/.rbenv:
	git clone https://github.com/rbenv/rbenv.git ~/.rbenv
	cd ~/.rbenv && src/configure && make -C src

# ruby-build is a repository hosting all kinds of ruby versions to install
~/.rbenv/plugins/ruby-build:
	git clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build

# rbenv-update allows updating rbenv plugins easily
~/.rbenv/plugins/rbenv-update:
	git clone https://github.com/rkh/rbenv-update.git ~/.rbenv/plugins/rbenv-update

# rbenv-readline does the right thing when it comes to linking a brew installed readline to ruby
~/.rbenv/plugins/rbenv-readline:
	git clone git://github.com/tpope/rbenv-readline.git ~/.rbenv/plugins/rbenv-readline

# rbenv-gemset allows managing project specific set of gems
~/.rbenv/plugins/rbenv-gemset:
	git clone git://github.com/jf/rbenv-gemset.git ~/.rbenv/plugins/rbenv-gemset

vim: \
	vim-itself \
	vim-plugins

vim-itself:
	# newer version of vim
	brew install vim --with-override-system-vi
	# create vim directories
	mkdir -p ~/.vim/tmp/{backup,swap,undo}

vim-plugins: \
	~/.vim/bundle/Vundle.vim
	# disable colorscheme for installing plugins to a temporary .vimrc
	sed 's/colorscheme/"colorscheme/' .vimrc > /tmp/.vimrc
	# install plugins with temporary vimrc
	vim -u /tmp/.vimrc +PluginInstall +qall
	-rm /tmp/.vimrc
	# post installation steps of command-t
	cd ~/.vim/bundle/command-t/ruby/command-t/ext/command-t && ruby extconf.rb && make

# install vundle, a vim package manager
~/.vim/bundle/Vundle.vim:
	git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim

tmux: \
	~/.tmux.conf \
	brew install tmux

defaults: \
	defaults-Dock \
	defaults-NSGlobalDomain \
	defaults-Calendar
	# Show remaining battery time; hide percentage
	defaults write com.apple.menuextra.battery ShowPercent -string "NO"
	defaults write com.apple.menuextra.battery ShowTime -string "YES"
	# Enable AirDrop over Ethernet and on unsupported Macs running Lion
	defaults write com.apple.NetworkBrowser BrowseAllInterfaces -bool true
	# Automatically open a new Finder window when a volume is mounted
	defaults write com.apple.frameworks.diskimages auto-open-ro-root -bool true
	defaults write com.apple.frameworks.diskimages auto-open-rw-root -bool true
	# Avoid creating .DS_Store files on network volumes
	defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
	# Disable the warning when changing a file extension
	defaults write com.apple.finder FXEnableExtensionChangeWarning -bool false
	# Automatically quit printer app once the print jobs complete
	defaults write com.apple.print.PrintingPrefs "Quit When Finished" -bool true
	# Check for software updates daily, not just once per week
	defaults write com.apple.SoftwareUpdate ScheduleFrequency -int 1
	# Automatically illuminate built-in MacBook keyboard in low light
	defaults write com.apple.BezelServices kDim -bool true
	# Turn off keyboard illumination when computer is not used for 5 minutes
	defaults write com.apple.BezelServices kDimTime -int 300
	# Save screenshots to the desktop
	defaults write com.apple.screencapture location -string "${HOME}/Desktop"
	# Disable shadow in screenshots
	defaults write com.apple.screencapture disable-shadow -bool true
	# Save screenshots in PNG format (other options: BMP, GIF, JPG, PDF, TIFF)
	defaults write com.apple.screencapture type -string "png"
	# Hide all desktop icons because who need 'em'
	defaults write com.apple.finder CreateDesktop -bool false
	# Enable HiDPI display modes (requires restart)
	sudo defaults write /Library/Preferences/com.apple.windowserver DisplayResolutionEnabled -bool true
	# Finder: disable window animations and Get Info animations
	defaults write com.apple.finder DisableAllAnimations -bool true
	# Finder: show hidden files by default
	defaults write com.apple.Finder AppleShowAllFiles -bool true
	# Finder: show path bar
	defaults write com.apple.finder ShowPathbar -bool true
	# Empty Trash securely by default
	defaults write com.apple.finder EmptyTrashSecurely -bool false
	# Require password immediately after 5 seconds on sleep or screen saver begins
	defaults write com.apple.screensaver askForPassword -int 1
	defaults write com.apple.screensaver askForPasswordDelay -int 5
	# Only use UTF-8 in Terminal.app
	defaults write com.apple.terminal StringEncodings -array 4
	# Show the ~/Library folder
	chflags nohidden ~/Library
	# disable apple captive portal (seucrity issue)
	sudo defaults write /Library/Preferences/SystemConfiguration/com.apple.captive.control Active -bool false
	# setup Quad9 DNS
	networksetup -setdnsservers Wi-Fi 9.9.9.9
	# Keep this bit last
	# Kill affected applications
	for app in Safari Finder Mail SystemUIServer; do killall "$$app" >/dev/null 2>&1; done

defaults-Dock:
	# Enable the 2D Dock
	defaults write com.apple.dock no-glass -bool true
	# Automatically hide and show the Dock
	defaults write com.apple.dock autohide -bool true
	# Make Dock icons of hidden applications translucent
	defaults write com.apple.dock showhidden -bool true
	# Enable highlight hover effect for the grid view of a stack (Dock)
	defaults write com.apple.dock mouse-over-hilte-stack -bool true
	# Enable spring loading for all Dock items
	defaults write enable-spring-load-actions-on-all-items -bool true
	# Show indicator lights for open applications in the Dock
	defaults write com.apple.dock show-process-indicators -bool true
	# Don’t animate opening applications from the Dock
	defaults write com.apple.dock launchanim -bool false
	# clean up right side (persistent)
	-defaults delete com.apple.dock persistent-others
	# and add these folders
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Dropbox", "file-data":{"_CFURLString":"file:///Users/lukas/Dropbox/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Desktop", "file-data":{"_CFURLString":"file:///Users/lukas/Desktop/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Downloads", "file-data":{"_CFURLString":"file:///Users/lukas/Downloads/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	# restart dock
	killall Dock

defaults-NSGlobalDomain:
	# Locale
	defaults write NSGlobalDomain AppleLocale -string "en_US"
	defaults write NSGlobalDomain AppleMeasurementUnits -string "Centimeters"
	defaults write NSGlobalDomain AppleMetricUnits -bool true
	# 24-Hour Time
	defaults write NSGlobalDomain AppleICUForce12HourTime -bool false
	# Enable full keyboard access for all controls (e.g. enable Tab in modal dialogs)
	defaults write NSGlobalDomain AppleKeyboardUIMode -int 3
	# Enable subpixel font rendering on non-Apple LCDs
	defaults write NSGlobalDomain AppleFontSmoothing -int 2
	# Disable menu bar transparency
	defaults write NSGlobalDomain AppleEnableMenuBarTransparency -bool false
	# Enable press-and-hold for keys
	defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false
	# Set a blazingly fast keyboard repeat rate (1 = fastest for macOS high sierra, older versions support 0)
	defaults write NSGlobalDomain KeyRepeat -int 2
	# Decrase the time to initially trigger key repeat
	defaults write NSGlobalDomain InitialKeyRepeat -int 15
	# Enable auto-correct
	defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool true
	# Disable window animations
	defaults write NSGlobalDomain NSAutomaticWindowAnimationsEnabled -bool false
	# Increase window resize speed for Cocoa applications
	defaults write NSGlobalDomain NSWindowResizeTime -float 0.001
	# Save to disk (not to iCloud) by default
	defaults write NSGlobalDomain NSDocumentSaveNewDocumentsToCloud -bool false
	# Disable smart quotes as they’re annoying when typing code
	defaults write NSGlobalDomain NSAutomaticQuoteSubstitutionEnabled -bool false
	# Disable smart dashes as they’re annoying when typing code
	defaults write NSGlobalDomain NSAutomaticDashSubstitutionEnabled -bool false
	# Trackpad: enable tap to click for this user and for the login screen
	defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
	defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
	defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
	# Finder: show all filename extensions
	defaults write NSGlobalDomain AppleShowAllExtensions -bool true

defaults-Calendar:
	# Show week numbers (10.8 only)
	defaults write com.apple.iCal "Show Week Numbers" -bool true
	# Show 7 days
	defaults write com.apple.iCal "n days of week" -int 7
	# Week starts on monday
	defaults write com.apple.iCal "first day of week" -int 1
	# Show event times
	defaults write com.apple.iCal "Show time in Month View" -bool true

dotfiles: $(DOTFILES)

~/.ssh/config:
	# Test that .ssh/config is decrypted (gpg has been setup)
	grep "Host *" ~/dotfiles/.ssh/config
	# Symlink .ssh/config
	cd ~/.ssh && ln -sv ../dotfiles/.ssh/config .

~/.gnupg:
	# Ask where to get .gnupg from
	@read -p "Where is .gnupg (from backup) located?" gnupg_source;
	cp -v $$gnupg_source ~/.gnupg

~/.%:
	cd ~ && ln -sv dotfiles/$(notdir $@) $@

~/.kube/bash_completion:
	kubectl completion bash > ~/.kube/bash_completion

docker:
	brew cask install docker


# Here is a comprehensive guide: https://github.com/drduh/macOS-Security-and-Privacy-Guide
# The following settings implement some basic security measures
harder:
	# Enable the firewall
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
	# Enable logging on the firewall
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setloggingmode on
	# Enable stealth mode (computer does not respond to PING or TCP connections on closed ports)
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
	# Prevent built-in software as well as code-signed, downloaded software from being whitelisted automatically
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setallowsigned off
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setallowsignedapp off
	# Restart the firewall (this should remain last)
	-sudo pkill -HUP socketfilterfw

