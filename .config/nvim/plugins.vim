call plug#begin("~/.nvim/plugged")

" colorscheme
Plug 'owickstrom/vim-colors-paramount'

" treesitter
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
" nvim-ts-autotag automatically closes html tags
Plug 'windwp/nvim-ts-autotag'
Plug 'windwp/nvim-autopairs'

" Easy quoting with the surround plugin
Plug 'tpope/vim-surround'

" repeat hooks for other plugins
Plug 'tpope/vim-repeat'

" coc is a lsp integration
Plug 'neoclide/coc.nvim', {'branch': 'release'}

" File search
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'

" Snippets
Plug 'honza/vim-snippets'

" Rename current buffer and file on disk
Plug 'danro/rename.vim'

" A little help from OpenAI
Plug 'aduros/ai.vim'

call plug#end()

