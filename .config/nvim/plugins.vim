call plug#begin("~/.nvim/plugged")

" colorscheme
Plug 'owickstrom/vim-colors-paramount'

" Easy quoting with the surround plugin
Plug 'tpope/vim-surround'

" repeat hooks for other plugins
Plug 'tpope/vim-repeat'

" A generic and modular lua sidebar inspired by lualine
Plug 'sidebar-nvim/sidebar.nvim'

" coc is a lsp integration
Plug 'neoclide/coc.nvim', {'branch': 'release'}

" Terraform
Plug 'hashivim/vim-terraform'

" Elixir
Plug 'elixir-editors/vim-elixir'

" File search
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'

call plug#end()
