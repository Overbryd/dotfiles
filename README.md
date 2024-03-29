# Overbryd's dotfiles

## Bootstrap

On a new mac, open a Terminal and run:

    curl --proto '=https' --tlsv1.2 -sSf -O https://raw.githubusercontent.com/Overbryd/dotfiles/master/bootstrap.sh
    chmod +x bootstrap.sh
    ./bootstrap.sh

## Maintenance

Enter the `~/dotfiles` directory, make changes and `make` it:

    cd ~/dotfiles
    make

The Makefile contains sections for installing \*nix command line utilities, macOS applications, macOS settings and maintaing specific configurations.

So you can also only re-make a section of the project, for example the macOS dock settings:

    cd ~/dotfiles
    make defaults-Dock

Or only rebuild your vim:

    cd ~/dotfiles
    make vim

Or upgrade all installed packages:

    cd ~/dotfiles
    make brew

## Contents

    .
    ├── Makefile        # This makefile controls all sections of this project
    ├── bootstrap.sh    # 0-100 bootstrap script for a new freshly installed Mac
    ├── .gitattributes  # 
    ├── .gitconfig      # colorful git config, including aliases
    ├── .gitignore      # general gitignore
    ├── .inputrc        # great for navigating bash history
    ├── .profile        # the complete bash setup with comments
    ├── .vimrc          # a great .vimrc with comments
    ├── decrypt.sh      # decrypt sensitive files and put them in place
    └── encrypt.sh      # simple wrapper to encrypt sensitive files for storage

## Credits

This seletion of dotfiles and system settings would not be possible without the great examples provided by:

* https://github.com/mathiasbynens/dotfiles
* https://github.com/matijs/dotfiles
* https://github.com/paulirish/dotfiles
* https://github.com/why-jay/osx-init
* https://github.com/simonmcc/osx-bootstrap/blob/master/osx-user-defaults.sh
* http://dotfiles.github.io
* https://www.stackoverflow.com/ :)
