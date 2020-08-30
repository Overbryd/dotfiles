EXCLUDED_DOTFILES := .git .git-crypt .gitattributes .gitignore .gitmodules .ssh
DOTFILES := $(addprefix ~/, $(filter-out $(EXCLUDED_DOTFILES), $(wildcard .*)))

DOTFILES_ROOT = /usr/local/dotfiles
BREW = sudo -ubinary brew
CASK = /usr/local/bin/brew cask

# Execute all commands per task in one shell, allowing for environment variables to be set for
# all following commands.
.ONESHELL:

# bootstrap only, add one-time bootstrap tasks here
# setups the necessary stuff
# restore .gnupg to decrypt the secrets from this repository
# setup ssh config (relies on decrypted repository)
bootstrap: \
	bootstrap-fonts-directory \
	bash \
	tmux \
	dotfiles \
	vim \
	~/.gnupg \
	~/.ssh/config \
	defaults

bootstrap-administrator: \
	bootstrap-binary-user \
	bootstrap-homebrew-folder \
	bootstrap-fonts-directory \
	bash \
	tmux \
	casks-baseline \
	mas-baseline \
	dotfiles \
	vim \
	docker \
	defaults \
	defaults-administrator \
	harder

# bootstrap a system user + group that is used to procted executable paths in $PATH
# Any directory in $PATH should not be writable by normal user.
# The normal user however can execute binaries from that PATH
bootstrap-binary-user:
	id binary || sudo .bin/macos-add-system-user binary 503 "Binary"
	echo "partenkirchen	ALL = (_binary) ALL" | sudo tee /etc/sudoers.d/partenkirchen
	echo 'Defaults!/usr/local/bin/brew env_keep += "HOMEBREW_*"' | sudo tee -a /etc/sudoers.d/partenkirchen

bootstrap-homebrew-folder:
	test -d /usr/local/Caches || sudo mkdir /usr/local/Caches
	test -d /usr/local/Logs/Homebrew || sudo mkdir -p /usr/local/Logs/Homebrew
	test -d /usr/local/Fonts || sudo mkdir /usr/local/Fonts
	sudo chown root:staff /usr/local/Logs
	sudo chmod g+w /usr/local/Logs
	# The binary user + group own everything around homebrew.
	# The administrative user is member of the binary group, hence he can use brew directly.
	sudo chown -R binary:binary /usr/local/{Fonts,Caches,Caskroom,Cellar,Frameworks,Homebrew,Logs/Homebrew,bin,etc,include,lib,opt,sbin,share,var}
	# Set the proper ACLs on the Homebrew folders in order to inherit ACLs
	sudo chmod g+w /usr/local/{Fonts,Caches,Caskroom,Cellar,Frameworks,Homebrew,Logs/Homebrew,bin,etc,include,lib,opt,sbin,share,var}
	sudo chmod +a "group:_binary allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" /usr/local/{Caches,Caskroom,Cellar,Frameworks,Homebrew,Logs/Homebrew,bin,etc,include,lib,opt,sbin,share,var}

brew-itself: /usr/local/bin/brew
brew: \
	brew-itself \
	brew-upgrade

/usr/local/bin/brew:
	$(BREW) doctor || sudo -ubinary ruby -e "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
	$(BREW) analytics off

brew-upgrade: brew-itself
	# upgrade all installed packages
	$(BREW) upgrade

brew-baseline: brew-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# GNU coreutils instead of outdated mac os defaults
	-$(BREW) install coreutils moreutils
	# newer version of git
	$(BREW) install git
	# git-crypt for encrypted repository contents
	$(BREW) install git-crypt
	# install ripgrep, currently the fasted grep alternative
	$(BREW) install ripgrep
	# tree, a nice directory tree listing
	$(BREW) install tree
	# install readline, useful in combination with ruby-build because it will link ruby installations to it
	$(BREW) install readline
	# install direnv for project specific .envrc support
	$(BREW) install direnv
	# pipeviewer allows to display throughput/eta information on unix pipes
	$(BREW) install pv
	# pstree is nice to look at
	$(BREW) install pstree
	# watch is great for building an overview on running stuff
	$(BREW) install watch
	# sed, stream editor, but replace mac os version
	$(BREW) install gnu-sed
	# handle json on the command line
	$(BREW) install jq --HEAD

brew-work: \
	brew-programming \
	brew-devops \
	brew-nettools
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# slack is the current communication platform
	$(CASK) install slack

brew-programming: brew-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# erlang programming language
	$(BREW) install erlang
	# elixir programming language
	$(BREW) install elixir

brew-devops: casks-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# handle amazon web services related stuff
	$(BREW) install awscli
	# tail cloudwatch logs (e.g. from Fargate containers)
	$(BREW) install saw
	# handle google cloud related stuff
	$(CASK) install google-cloud-sdk
	# neat way to expose a locally running service
	$(BREW) install cloudflare/cloudflare/cloudflared
	# smartmontools great for monitoring disks
	$(BREW) install smartmontools

brew-nettools: brew-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# nmap is great for test and probing network related stuff
	$(BREW) install nmap
	# curl is a http development essential
	$(BREW) install curl
	# websocket client
	$(BREW) install websocat
	# vegeta is an insanely great http load tester and scalable http-client
	# hugo is my blogging engine
	$(BREW) install hugo

mas-itself: brew-itself
	$(BREW) install mas

mas-baseline: mas-itself
	# Keynote
	mas install 409183694
	# Numbers
	mas install 409203825
	# Pages
	mas install 409201541
	# Pixelmator
	mas install 407963104
	# Wireguard VPN Client
	mas install 1451685025

casks-itself: brew-itself
	# tap homebrew-cask to install other osx related stuff
	$(BREW) tap homebrew/cask

casks: \
	casks-itself \
	casks-baseline

casks-baseline: casks-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# spectacle for mac osx window management/tiling
	$(CASK) install spectacle
	# opera for browsing the web
	$(CASK) install opera
	# dropbox synchronised files across devices
	$(CASK) install dropbox
	# 1password is my password manager
	$(CASK) install 1password
	$(CASK) install 1password-cli
	# gpg-suite provide me with all gpp related things
	$(CASK) install gpg-suite
	# Flux reduces blue/green colors on the display spectrum and helps me sleep better
	$(CASK) install flux
	# launchbar is my preferred app launcher/clipboard history, calculator and goto mac utility
	$(CASK) install launchbar
	# appcleaner removed macOS applications and their cruft
	$(CASK) install appcleaner
	# Carbon Copy Cloner is my backup tool of choice
	$(CASK) install carbon-copy-cloner

casks-work: casks-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# tableplus is the best graphical multi-database client
	$(CASK) install tableplus

bootstrap-fonts-directory:
	# Share user fonts via /usr/local
	chmod -a "group:everyone deny delete" ~/Library/Fonts || echo "No ACL present"
	rm -rf ~/Library/Fonts
	ln -svf /usr/local/Fonts ~/Library/Fonts

fonts: \
	casks-itself
	# tap homebrew-fonts to install freely available fonts
	$(BREW) tap homebrew/cask-fonts
	# install IBM Plex, an excellent modern font (https://www.ibm.com/plex/)
	$(CASK) install font-ibm-plex
	# install Adobe Source Code Pro, an excellent mono space font for programming
	$(CASK) install font-source-code-pro

bash: brew-itself
	@$(BREW) update
	@export HOMEBREW_NO_AUTO_UPDATE=1
	# newer version of bash
	$(BREW) install bash
	$(BREW) install bash-completion
	# change shell to homebrew bash
	grep /usr/local/bin/bash /etc/shells || (echo "/usr/local/bin/bash" | sudo tee -a /etc/shells)
	test "$$SHELL" = /usr/local/bin/bash || chsh -s /usr/local/bin/bash

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

vim-itself: brew-itself
	# newer version of vim
	$(BREW) install vim
	# create vim directories
	mkdir -p ~/.vim/tmp/{backup,swap,undo}

vim-plugins: \
	~/.vim/bundle/Vundle.vim
	# disable colorscheme for installing plugins to a temporary .vimrc
	sed 's/colorscheme/"colorscheme/' .vimrc > /tmp/.vimrc
	# install plugins with temporary vimrc
	vim -u /tmp/.vimrc +PluginInstall +qall
	-rm /tmp/.vimrc
	# post installation steps of command-t (use the ruby that ships with vim)
	cd ~/.vim/bundle/command-t/ruby/command-t/ext/command-t && /usr/local/opt/ruby/bin/ruby extconf.rb && make

# install vundle, a vim package manager
~/.vim/bundle/Vundle.vim:
	git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim

tmux: \
	~/.tmux.conf
	$(BREW) install tmux
	$(BREW) install reattach-to-user-namespace

defaults: \
	defaults-Trackpad \
	defaults-Terminal \
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
	# Hide all desktop icons because who needs them, I certainly don't
	defaults write com.apple.finder CreateDesktop -bool false
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
	# Disable Game Center
	defaults write com.apple.gamed Disabled -bool true
	# Show the ~/Library folder
	chflags nohidden ~/Library
	# Keep this bit last
	# Kill affected applications
	for app in Safari Finder Mail SystemUIServer; do killall "$$app" >/dev/null 2>&1; done
	# Re-enable subpixel aliases that got disabled by default in Mojave
	defaults write -g CGFontRenderingFontSmoothingDisabled -bool false

defaults-administrator:
	# disable apple captive portal (seucrity issue)
	sudo defaults write /Library/Preferences/SystemConfiguration/com.apple.captive.control Active -bool false
	# Enable HiDPI display modes (requires restart)
	sudo defaults write /Library/Preferences/com.apple.windowserver DisplayResolutionEnabled -bool true

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
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Dropbox", "file-data":{"_CFURLString":"file:///Users/$(USER)/Dropbox/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Desktop", "file-data":{"_CFURLString":"file:///Users/$(USER)/Desktop/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Downloads", "file-data":{"_CFURLString":"file:///Users/$(USER)/Downloads/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
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
	# Finder: show all filename extensions
	defaults write NSGlobalDomain AppleShowAllExtensions -bool true

defaults-Trackpad:
	# Trackpad: enable tap to click for this user and for the login screen
	defaults write com.apple.driver.AppleBluetoothMultitouch.trackpad Clicking -bool true
	defaults -currentHost write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
	defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
	# Enable three-finger dragging
	defaults write com.apple.AppleMultitouchTrackpad TrackpadThreeFingerDrag -int 1

defaults-Calendar:
	# Show week numbers (10.8 only)
	defaults write com.apple.iCal "Show Week Numbers" -bool true
	# Show 7 days
	defaults write com.apple.iCal "n days of week" -int 7
	# Week starts on monday
	defaults write com.apple.iCal "first day of week" -int 1
	# Show event times
	defaults write com.apple.iCal "Show time in Month View" -bool true

defaults-Terminal:
	# Only use UTF-8 in Terminal.app
	defaults write com.apple.terminal StringEncodings -array 4
	# Set the default shell
	defaults write com.apple.terminal Shell -string "/usr/local/bin/bash"
	# Open new windows with our own Theme
	plutil -replace "Window Settings"."Pro-gramming" -xml "$$(cat Pro-gramming.terminal)" ~/Library/Preferences/com.apple.Terminal.plist
	defaults write com.apple.Terminal "Default Window Settings" -string "Pro-gramming"
	defaults write com.apple.Terminal "Startup Window Settings" -string "Pro-gramming"

dotfiles: \
	$(DOTFILES) \
	~/dotfiles

~/dotfiles:
	cd ~ && ln -svf $(DOTFILES_ROOT) dotfiles

~/.ssh/config:
	# Copy a default .ssh/config
	grep "Host *" ~/.ssh/config || cp $(DOTFILES_ROOT)/.ssh/config ~/.ssh/config

~/.gnupg:
	# Ask where to get .gnupg from
	@read -p "Where is .gnupg (from backup) located?" gnupg_source;
	cp -v $$gnupg_source ~/.gnupg

~/.%:
	cd ~ && ln -svf $(DOTFILES_ROOT)/$(notdir $@) $@

docker:
	$(CASK) install docker

# Here is a comprehensive guide: https://github.com/drduh/macOS-Security-and-Privacy-Guide
# The following settings implement some basic security measures
harder: harder-firewall
	# Enable secure keyboard entry for Terminal
	defaults write com.apple.terminal SecureKeyboardEntry -bool true
	# Enable touch id for sudo (if available)
	sudo .bin/macos-enable-sudo-pam_tid

harder-firewall:
	# Enable the firewall
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
	# Block all incoming connections
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setblockall on
	# Enable logging on the firewall
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setloggingmode on
	# Enable stealth mode (computer does not respond to PING or TCP connections on closed ports)
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on
	# Prevent built-in software as well as code-signed, downloaded software from being whitelisted automatically
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setallowsigned off
	sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setallowsignedapp off
	##
	# Restart the firewall (this should remain last)
	sudo pkill -HUP socketfilterfw

