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

" Snippets
Plug 'honza/vim-snippets'

" Multiple cursors
" Plug 'mg979/vim-visual-multi', {'branch': 'master'}

" Rename current buffer and file on disk
Plug 'danro/rename.vim'

" Work smarter, not harder™
Plug 'github/copilot.vim'

call plug#end()
