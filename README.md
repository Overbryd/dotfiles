# Overbryd's dotfiles
    .
    ├── .gitattributes  # 
    ├── .gitconfig      # colorful git config, including aliases
    ├── .gitignore      # general gitignore
    ├── .inputrc        # great for navigating bash history
    ├── .profile        # simple bash setup
    ├── .slate          # configuration for Slate, a Mac OSX window manager
    ├── .tm_properties  # configuration for TextMate, a great Code editor
    └── defaults.sh     # a collection of interesting Mac OSX defaults

## Maintain and setup OSX defaults

While working with your Mac you start customizing all the stuff. If you setup a new machine you can reproduce the setup using `defaults.sh`.
Any customization that you do via `defaults` should be appended to `defaults.sh`.

```bash
~/.dotfiles/defaults.sh
```
