# Overbryd’s dotfiles

## Installation

```bash
curl "https://raw.github.com/Overbryd/dotfiles/master/dotfiles.sh" | bash
```

## Updating

```bash
~/.dotfiles/dotfiles.sh
```

## Provisioning

Installs OSX GCC (u don't need XCode), homebrew and some ruby tools. (rbenv ruby-build rbenv-gemset)

```bash
~/.dotfiles/provision.sh
```
## Maintain and setup OSX defaults

While working with your Mac you start customizing all the stuff. If you setup a new machine you can reproduce the setup using `defaults.sh`.
Any customization that you do via `defaults` should be appended to `defaults.sh`.

```bash
~/.dotfiles/defaults.sh
```

## Feedback

Suggestions/improvements
[welcome](https://github.com/Overbryd/dotfiles/issues)!

## Thanks to…

* [Gianni Chiappetta](http://gf3.ca/) for sharing his [amazing collection of dotfiles](https://github.com/gf3/dotfiles)
* [Matijs Brinkhuis](http://hotfusion.nl/) and his [homedir repository](https://github.com/matijs/homedir)
* [Jan Moesen](http://jan.moesen.nu/) and his [ancient `.bash_profile`](https://gist.github.com/1156154) + [shiny tilde repository](https://github.com/janmoesen/tilde)
* [Ben Alman](http://benalman.com/) and his [dotfiles repository](https://github.com/cowboy/dotfiles)
* [Tim Esselens](http://devel.datif.be/)
* anyone who [contributed a patch](https://github.com/mathiasbynens/dotfiles/contributors) or [made a helpful suggestion](https://github.com/mathiasbynens/dotfiles/issues)