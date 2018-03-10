EXCLUDED_DOTFILES := .git .gitattributes .gitignore .gitmodules
DOTFILES := $(addprefix ~/, $(filter-out $(EXCLUDED_DOTFILES), $(wildcard .*)))

all: \
	brew \
	casks \
	bash \
	vim \
	tmux \
	dotfiles \
	defaults

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
	ruby -e "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

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
	git clone https://github.com/gmarik/Vundle.vim.git ~/.vim/bundle/Vundle.vim

tmux: \
	~/.tmux.conf \
	~/.tmux/plugins/tpm
	brew install tmux
	# install plugins
	~/.tmux/plugins/tpm/bin/install_plugins

~/.tmux/plugins/tpm:
	# install tmux plugin manager
	git clone --depth=10 https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

defaults: \
	defaults-dock
	# Show remaining battery time; hide percentage
	defaults write com.apple.menuextra.battery ShowPercent -string "NO"
	defaults write com.apple.menuextra.battery ShowTime -string "YES"
	# Enable AirDrop over Ethernet and on unsupported Macs running Lion
	defaults write com.apple.NetworkBrowser BrowseAllInterfaces -bool true
	# Disable disk image verification
	# defaults write com.apple.frameworks.diskimages skip-verify -bool true
	# defaults write com.apple.frameworks.diskimages skip-verify-locked -bool true
	# defaults write com.apple.frameworks.diskimages skip-verify-remote -bool true
	# Disable the “Are you sure you want to open this application?” dialog
	# defaults write com.apple.LaunchServices LSQuarantine -bool false
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
	# Keep this bit last
	# Kill affected applications
	for app in Safari Finder Mail SystemUIServer; do killall "$$app" >/dev/null 2>&1; done

defaults-dock:
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
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":3, "file-label":"Dropbox", "file-data":{"_CFURLString":"file:///Users/lukas/Dropbox/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":3, "file-label":"Desktop", "file-data":{"_CFURLString":"file:///Users/lukas/Desktop/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":3, "file-label":"Downloads", "file-data":{"_CFURLString":"file:///Users/lukas/Downloads/","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
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
	# Disable press-and-hold for keys in favor of key repeat
	defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool false
	# Set a blazingly fast keyboard repeat rate
	defaults write NSGlobalDomain KeyRepeat -int 0
	# Disable auto-correct
	defaults write NSGlobalDomain NSAutomaticSpellingCorrectionEnabled -bool false
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


dotfiles: $(DOTFILES)

~/.%:
	cd ~ && ln -sv dotfiles/$(notdir $@) $@

