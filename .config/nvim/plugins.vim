call plug#begin("~/.nvim/plugged")

" colorscheme
Plug 'KabbAmine/yowish.vim'
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

" lsp integration
Plug 'neovim/nvim-lspconfig'
" format on save, async via lsp
Plug 'lukas-reineke/lsp-format.nvim'

" File search
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'
Plug 'duane9/nvim-rg'

" Snippets
Plug 'SirVer/ultisnips'
Plug 'honza/vim-snippets'

" Rename current buffer and file on disk
Plug 'danro/rename.vim'

" Terminal manager, used to toggle ollama sessions
Plug 'akinsho/toggleterm.nvim'

" Undotree
Plug 'mbbill/undotree'

" Copilot
" Disabled for now.
" Plug 'zbirenbaum/copilot.lua'

" Supermaven
Plug 'supermaven-inc/supermaven-nvim'

"Generative AI
Plug 'David-Kunz/gen.nvim'

" auto completion
Plug 'hrsh7th/cmp-nvim-lsp'
Plug 'hrsh7th/cmp-buffer'
Plug 'hrsh7th/cmp-path'
Plug 'hrsh7th/cmp-cmdline'
Plug 'hrsh7th/nvim-cmp'
Plug 'quangnguyen30192/cmp-nvim-ultisnips'
Plug 'andersevenrud/cmp-tmux'
" ncm2 auto completion framework, its neatly organized and fast
" Plug 'roxma/nvim-yarp'
" Plug 'ncm2/ncm2'
" " auto complete words from the current buffer
" Plug 'ncm2/ncm2-bufword'
" Plug 'fgrsnau/ncm2-otherbuf'
" " auto complete from ultisnips
" Plug 'ncm2/ncm2-ultisnips'
" " auto complete paths
" Plug 'ncm2/ncm2-path'
" " detect javascript subscope in html documents
" Plug 'ncm2/ncm2-html-subscope'
" Plug 'ncm2/ncm2-markdown-subscope'
" " auto comlete from other tmux buffers
" Plug 'ncm2/ncm2-tmux'
" auto complete lsp stuff
" Plug 'prabirshrestha/vim-lsp'
" Plug 'ncm2/ncm2-vim-lsp'

" TailwindCSS support
Plug 'luckasRanarison/tailwind-tools.nvim'

" Golang support
Plug 'fatih/vim-go'
Plug 'sebdah/vim-delve'

call plug#end()

