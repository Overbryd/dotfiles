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
Plug 'neovim/nvim-lspconfig'

" auto completion
" ncm2 auto completion framework, its neatly organized and fast
Plug 'roxma/nvim-yarp'
Plug 'ncm2/ncm2'
" auto complete words from the current buffer
Plug 'ncm2/ncm2-bufword'
" auto complete from ultisnips
Plug 'ncm2/ncm2-ultisnips'
" auto complete paths
Plug 'ncm2/ncm2-path'
" detect javascript subscope in html documents
Plug 'ncm2/ncm2-html-subscope'
" auto comlete from other tmux buffers
Plug 'ncm2/ncm2-tmux'
" auto complete lsp stuff
Plug 'prabirshrestha/vim-lsp'
Plug 'ncm2/ncm2-vim-lsp'

" File search
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'
Plug 'duane9/nvim-rg'

" Snippets
Plug 'SirVer/ultisnips'
Plug 'honza/vim-snippets'

" Rename current buffer and file on disk
Plug 'danro/rename.vim'

call plug#end()

