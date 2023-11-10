EXCLUDED_DOTFILES := .git .git-crypt .gitattributes .gitignore .gitmodules .ssh
DOTFILES := $(addprefix ~/, $(filter-out $(EXCLUDED_DOTFILES), $(wildcard .*)))
DOT_CONFIG_FILES := $(addprefix ~/, $(wildcard .config/*))
LAUNCH_AGENTS := $(addprefix ~/Library/, $(wildcard LaunchAgents/*))

DOTFILES_ROOT = $(HOME)/dotfiles
BREW = $(DOTFILES_ROOT)/.bin/brew

# execute all commands per task in one shell, allowing for environment variables to be set for
# all following commands.
.ONESHELL:

# bootstrap the administrative account
bootstrap-administrator: \
	bootstrap-user \
	bootstrap-binary-user \
	bootstrap-homebrew-folder \
	brew \
	bash \
	defaults-administrator \
	defaults \
	harder

# bootstrap after reset, this is required because files at root "/" are overwritten by macos updates
# from time to time
bootstrap-administrator-after-reset: \
	bootstrap-binary-user \
	bash

# bootstrap only, add one-time bootstrap tasks here
# setups the necessary stuff
# restore .gnupg to decrypt the secrets from this repository
# setup ssh config (relies on decrypted repository)
bootstrap: \
	dotfiles \
	~/.gnupg \
	~/.ssh/config \
	defaults

# bootstrap a daily driver user, low privileged that is used to run the computer with.
bootstrap-user:
	id partenkirchen || sudo .bin/macos-add-user partenkirchen

# Bootstrap a system user + group that is used to protect executable paths in $PATH.
# Any directory in $PATH should not be writable by normal user.
# The normal user however can execute binaries from that PATH.
# Test with `$ audit-path-writable`
bootstrap-binary-user:
	id binary || sudo .bin/macos-add-system-user binary
	sudo grep '_binary		ALL = NOPASSWD:SETENV' /etc/sudoers || echo '_binary		ALL = NOPASSWD:SETENV: /bin/cp -pR $(HOMEBREW_PREFIX)/Caskroom/* /Applications/*,/bin/cp -pR $(HOMEBREW_PREFIX)/Caskroom/* /Library/Fonts/*,/usr/sbin/installer -pkg $(HOMEBREW_PREFIX)/Caskroom/* -target /' | EDITOR='tee -a' VISUAL=$$EDITOR sudo -E visudo
	sudo grep '_binary		ALL = (_binary) NOPASSWD:SETENV: ALL' /etc/sudoers || echo '_binary		ALL = (_binary) NOPASSWD:SETENV: ALL' | EDITOR='tee -a' VISUAL=$$EDITOR sudo -E visudo

bootstrap-homebrew-folder:
	test -d $(HOMEBREW_PREFIX) || sudo mkdir $(HOMEBREW_PREFIX)
	sudo chown -R binary:binary $(HOMEBREW_PREFIX)
	sudo chmod -R g+w $(HOMEBREW_PREFIX)
	sudo chmod +a "group:_binary allow list,add_file,search,add_subdirectory,delete_child,readattr,writeattr,readextattr,writeextattr,readsecurity,file_inherit,directory_inherit" $(HOMEBREW_PREFIX)

brew-itself: $(HOMEBREW_PREFIX)/bin/brew
brew: \
	brew-itself \
	brew-upgrade

$(HOMEBREW_PREFIX)/bin/brew:
	$(BREW) doctor 2>&1 >/dev/null || sudo -Eubinary /bin/bash -c "curl --proto '=https' --tlsv1.2 -fsSL https://github.com/Homebrew/brew/tarball/master | tar xz --strip 1 -C $(HOMEBREW_PREFIX)"
	$(BREW) analytics off

brew-upgrade: brew-itself
	# upgrade all installed packages
	$(BREW) upgrade

brew-baseline: brew-itself
	@$(BREW) update
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
	# fswatch allows you to stream file changes to a unix pipe, handy for rerunning tests
	$(BREW) install fswatch

brew-work: \
	brew-programming \
	brew-devops \
	brew-nettools
	@$(BREW) update
	# tableplus is my preferred SQL-client
	$(BREW) install --cask tableplus
	# Alacritty is a better terminal emulator
	$(BREW) install --cask alacritty

brew-programming: brew-itself
	@$(BREW) update
	# erlang programming language
	$(BREW) install erlang
	# elixir programming language
	$(BREW) install elixir
	# install and manage ruby versions
	$(BREW) install ruby-install
	# install pyenv to manage python versions
	$(BREW) install pyenv
	# gum is helpful for scripting https://github.com/charmbracelet/gum
	$(BREW) install gum

brew-devops: casks-itself
	@$(BREW) update
	# handle amazon web services related stuff
	$(BREW) install awscli
	$(BREW) install aws-iam-authenticator
	# tail cloudwatch logs (e.g. from Fargate containers)
	$(BREW) tap TylerBrock/saw
	$(BREW) install saw
	# handle google cloud related stuff
	$(BREW) install python@3.8
	HOME=$(HOMEBREW_PREFIX) $(BREW) install --cask google-cloud-sdk
	# Google, you are fucking kidding me
	# gcloud config set disable_usage_reporting false
	# gcloud config set survey/disable_prompts True
	# neat way to expose a locally running service
	$(BREW) install cloudflared
	# smartmontools great for monitoring disks
	$(BREW) install smartmontools
	# I need to control kubernetes clusters
	$(BREW) install kubernetes-cli
	kubectl completion bash > $$HOME/.completion.d/kubectl
	# Terraform, this is what makes the money
	$(BREW) install terraform-ls terraform-docs
	# Kops is an alternative to EKS clusters (I no longer prefer)
	$(BREW) install kops

brew-nettools: brew-itself
	@$(BREW) update
	# nmap is great for test and probing network related stuff
	$(BREW) install nmap
	# curl is a http development essential
	$(BREW) install curl
	# websocket client
	$(BREW) install websocat
	# vegeta is an insanely great http load tester and scalable http-client
	$(BREW) install vegeta
	# caddy is an outstanding web server
	$(BREW) install caddy
	# ipcalc helps with network planning
	$(BREW) install ipcalc

brew-fzf: brew-itself
	@$(BREW) update
	# fd is a alternative find command
	$(BREW) install fd
	# fzf is a fuzzy file finder
	$(BREW) install fzf
	$(HOMEBREW_PREFIX)/opt/fzf/install --key-bindings --completion --no-update-rc --no-zsh --no-fish

mas-itself: brew-itself
	$(BREW) install mas

mas-baseline: mas-itself
	# Keynote
	mas install 409183694
	# Numbers
	mas install 409203825
	# Pages
	mas install 409201541
	# Pixelmator Pro
	mas install 1289583905
	# Wireguard VPN Client
	mas install 1451685025
	# Spark E-Mail
	mas install 1176895641
	# 1Password password manager
	mas install 1333542190

mas-work: mas-itself
	# Slack
	mas install 803453959
	# Apple Remote Desktop
	mas install 409907375

casks-itself: brew-itself
	# tap homebrew-cask to install other osx related stuff
	$(BREW) tap homebrew/cask

casks: \
	casks-itself \
	casks-baseline

casks-baseline: casks-itself
	@$(BREW) update
	# phoenix is a scriptable window management/tiling system
	$(BREW) install --cask phoenix
	# spectacle for mac osx window management/tiling
	$(BREW) install --cask spectacle
	# vivaldi for browsing the web
	$(BREW) install --cask vivaldi
	# 1password is my password manager
	$(BREW) install --cask 1password-cli
	# gpg-suite provide me with all gpp related things
	$(BREW) install --cask gpg-suite
	# Flux reduces blue/green colors on the display spectrum and helps me sleep better
	$(BREW) install --cask flux
	# launchbar is my preferred app launcher/clipboard history, calculator and goto mac utility
	$(BREW) install --cask launchbar
	# appcleaner removed macOS applications and their cruft
	$(BREW) install --cask appcleaner
	# Carbon Copy Cloner is my backup tool of choice
	$(BREW) install --cask carbon-copy-cloner
	# dropbox synchronised files across devices
	HOMEBREW_CASK_OPTS=$${HOMEBREW_CASK_OPTS#--require-sha} $(BREW) install --cask dropbox

casks-work: casks-itself
	@$(BREW) update
	# tableplus is the best graphical multi-database client
	$(BREW) install --cask tableplus

fonts: \
	casks-itself
	# tap homebrew-fonts to install freely available fonts
	$(BREW) tap homebrew/cask-fonts
	# install IBM Plex, an excellent modern font (https://www.ibm.com/plex/)
	$(BREW) install --fontdir /Library/Fonts --cask font-ibm-plex
	# install Adobe Source Code Pro, an excellent mono space font for programming
	HOMEBREW_CASK_OPTS=$${HOMEBREW_CASK_OPTS#--require-sha} $(BREW) install --fontdir /Library/Fonts --cask font-source-code-pro

bash: brew-itself
	@$(BREW) update
	# newer version of bash
	$(BREW) install bash
	$(BREW) install bash-completion
	# change shell to homebrew bash
	grep $(HOMEBREW_PREFIX)/bin/bash /etc/shells || (echo "$(HOMEBREW_PREFIX)/bin/bash" | sudo tee -a /etc/shells)
	test "$$SHELL" = $(HOMEBREW_PREFIX)/bin/bash || chsh -s $(HOMEBREW_PREFIX)/bin/bash

ruby: \
	$(HOMEBREW_PREFIX)/rbenv \
	$(HOMEBREW_PREFIX)/rbenv/plugins/ruby-build \
	$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-update \
	$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-readline \
	$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-gemset
	$(BREW) install libyaml
	TMPDIR=/tmp sudo -Eu binary $(HOMEBREW_PREFIX)/rbenv/bin/rbenv install 3.2.2
	TMPDIR=/tmp sudo -Eu binary $(HOMEBREW_PREFIX)/rbenv/bin/rbenv global 3.2.2

# rbenv is an amazing ruby version manager, simple, straightforward, local
$(HOMEBREW_PREFIX)/rbenv:
	test -d $(HOMEBREW_PREFIX)/rbenv || sudo -Eu binary git clone https://github.com/rbenv/rbenv.git $(HOMEBREW_PREFIX)/rbenv
	cd $(HOMEBREW_PREFIX)/rbenv && sudo -Eu binary git pull && sudo -Eu binary src/configure && sudo -Eu binary make -C src

# ruby-build is a repository hosting all kinds of ruby versions to install
$(HOMEBREW_PREFIX)/rbenv/plugins/ruby-build:
	sudo -Eu binary git clone https://github.com/rbenv/ruby-build.git $(HOMEBREW_PREFIX)/rbenv/plugins/ruby-build

# rbenv-update allows updating rbenv plugins easily
$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-update:
	sudo -Eu binary git clone https://github.com/rkh/rbenv-update.git $(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-update

# rbenv-readline does the right thing when it comes to linking a brew installed readline to ruby
$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-readline:
	sudo -Eu binary git clone https://github.com/tpope/rbenv-readline.git $(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-readline

# rbenv-gemset allows managing project specific set of gems
$(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-gemset:
	sudo -Eu binary git clone https://github.com/jf/rbenv-gemset.git $(HOMEBREW_PREFIX)/rbenv/plugins/rbenv-gemset

python:
	TMPDIR=/tmp sudo -Eubinary pyenv install --skip-existing 3.11.6
	TMPDIR=/tmp sudo -Eubinary pyenv global 3.11.6
	TMPDIR=/tmp sudo -Eubinary pip install --upgrade pip
	TMPDIR=/tmp sudo -Eubinary pip install neovim

node: \
	$(HOMEBREW_PREFIX)/nodenv
	cd $(HOMEBREW_PREFIX)
	TMPDIR=/tmp NODENV_ROOT=$(HOMEBREW_PREFIX)/nodenv sudo -Eubinary nodenv install 20.8.1
	TMPDIR=/tmp NODENV_ROOT=$(HOMEBREW_PREFIX)/nodenv sudo -Eubinary nodenv global 20.8.1

$(HOMEBREW_PREFIX)/nodenv:
	$(BREW) install nodenv node-build
	NODENV_ROOT=$(HOMEBREW_PREFIX)/nodenv sudo -Eubinary nodenv init - > /dev/null

terraform: \
	$(HOMEBREW_PREFIX)/tfenv
	sudo -Eubinary $(HOMEBREW_PREFIX)/bin/tfenv install latest
	sudo -Eubinary $(HOMEBREW_PREFIX)/bin/tfenv use latest

$(HOMEBREW_PREFIX)/tfenv:
	$(BREW) install tfenv
	sudo -Eubinary mkdir $(HOMEBREW_PREFIX)/tfenv

nvim: \
	nvim-itself \
	nvim-user

nvim-user: \
	nvim-directories \
	~/.config/nvim \
	nvim-plugins \
	nvim-coc-install

nvim-directories:
	# create nvim directories
	mkdir -p ~/.nvim/tmp/{backup,swap,undo}
	chmod go= ~/.nvim/tmp{,/*}

nvim-itself: python
	$(BREW) install nvim
	TMPDIR=/tmp sudo -Eubinary pip install pynvim

nvim-coc-install: nvim-plugins
	nvim -c 'CocInstall -sync coc-just-complete coc-pairs coc-tsserver coc-json coc-html coc-css coc-pyright coc-docker coc-erlang_ls coc-fzf-preview coc-go coc-html coc-svelte coc-yaml coc-elixir coc-terraform coc-snippets | qa'

nvim-plugins:
	nvim -c 'PlugInstall | qa'
	nvim -c 'PlugClean | qa'

tmux: \
	~/.tmux.conf
	$(BREW) install tmux
	$(BREW) install reattach-to-user-namespace

imagemagick:
	# build imagemagic from source, also to support things like HEIC image formats
	$(BREW) install imagemagic --build-from-source

# See also: https://macos-defaults.com
defaults: \
	defaults-Trackpad \
	defaults-Terminal \
	defaults-Dock \
	defaults-NSGlobalDomain \
	defaults-Calendar \
	defaults-Menubar \
	defaults-LaunchAgents \
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
	# Require password after 5 seconds on sleep or screen saver begins
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
	# defaults write -g CGFontRenderingFontSmoothingDisabled -bool false

defaults-administrator:
	# disable apple captive portal (security issue)
	# sudo defaults write /Library/Preferences/SystemConfiguration/com.apple.captive.control Active -bool false
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
	defaults write com.apple.dock persistent-others -array-add "$$(echo '{"tile-type": "directory-tile", "tile-data": {"displayas": 0, "file-type":2, "showas":1, "file-label":"Dropbox", "file-data":{"_CFURLString":"file:///Users/$(USER)/Library/CloudStorage/Dropbox","_CFURLStringType":15}}}' | plutil -convert xml1 - -o -)";
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
	defaults write NSGlobalDomain com.apple.mouse.tapBehavior -int 1
	defaults write NSGlobalDomain com.apple.trackpad.tapBehavior -int 1
	# Enable three-finger dragging
	defaults write NSGlobalDomain com.apple.driver.AppleBluetoothMultitouch.trackpad.TrackpadThreeFingerDrag -int 1
	# Make the trackpad fast
	defaults write NSGlobalDomain com.apple.mouse.scaling -float 10.0
	defaults write NSGlobalDomain com.apple.trackpad.scaling -float 10.0

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
	defaults write com.apple.terminal Shell -string "$(HOMEBREW_PREFIX)/bin/bash"
	# Open new windows with our own Theme
	plutil -replace "Window Settings"."Pro-gramming" -xml "$$(cat Pro-gramming.terminal)" ~/Library/Preferences/com.apple.Terminal.plist
	defaults write com.apple.Terminal "Default Window Settings" -string "Pro-gramming"
	defaults write com.apple.Terminal "Startup Window Settings" -string "Pro-gramming"

defaults-Menubar:
	# I want my menubar to look like this
	defaults write com.apple.systemuiserver menuExtras -array \
		"/System/Library/CoreServices/Menu Extras/AirPort.menu" \
		"/System/Library/CoreServices/Menu Extras/Bluetooth.menu" \
		"/System/Library/CoreServices/Menu Extras/Clock.menu" \
		"/System/Library/CoreServices/Menu Extras/Displays.menu" \
		"/System/Library/CoreServices/Menu Extras/Volume.menu"
	# I want the datetime display in my menubar to look like this
	defaults write com.apple.menuextra.clock DateFormat -string "EEE d MMM HH:mm"
	killall SystemUIServer

defaults-LaunchAgents: \
	$(LAUNCH_AGENTS)

~/Library/LaunchAgents/%:
	cp -v ~/LaunchAgents/$(notdir $@) $@

dotfiles:
dotfiles: \
	~/dotfiles \
	$(DOTFILES) \
	$(DOT_CONFIG_FILES)

~/dotfiles:
	ln -s /usr/local/dotfiles ~/dotfiles

~/.ssh/config:
	# Copy a default .ssh/config
	grep "Host *" ~/.ssh/config || cp $(DOTFILES_ROOT)/.ssh/config ~/.ssh/config

~/.gnupg:
	# Ask where to get .gnupg from
	@read -p "Where is .gnupg (from backup) located?" gnupg_source;
	cp -v $$gnupg_source ~/.gnupg

~/.config/%: ~/.config
	cd ~ && test -h $(DOTFILES_ROOT)/.config$(notdir $@) || ln -svf $(DOTFILES_ROOT)/.config/$(notdir $@) .config/$(notdir $@)

~/.config:
	mkdir ~/.config

~/.%:
	cd ~ && ln -svf $(DOTFILES_ROOT)/$(notdir $@) $@

docker:
	# Run colima as administrator after install to setup the network.
	# Works for low privileged users afterwards.
	# $ colima start --cpu 4 --memory 4 --disk 50 --mount-type=virtiofs --network-address
	# $ colima stop
	$(BREW) install colima
	$(BREW) install docker docker-completion

# Here is a comprehensive guide: https://github.com/drduh/macOS-Security-and-Privacy-Guide
# The following settings implement some basic security measures
harder: \
	harder-common \
	harder-filevault
	# harder-firewall \

harder-common:
	# Enable secure keyboard entry for Terminal
	defaults write com.apple.terminal SecureKeyboardEntry -bool true
	# Require a firmware password to change boot disk (mode full requires a firmware password on all startups)
	# sudo firmwarepasswd -setpasswd -setmode command
	# Enable touch id for sudo (if available)
	# sudo .bin/macos-enable-sudo-pam_tid

harder-filevault:
	# Enable FileVault (requires restart)
	(fdesetup status | grep "FileVault is On") || (sudo fdesetup enable && sudo fdesetup add -usertoadd partenkirchen && read -p "Please note down the FileVault recovery key. Ready to restart?" noop && sudo shutdown -r +1 "Restarting in 1 minute... FileVault setup requires a restart")

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

