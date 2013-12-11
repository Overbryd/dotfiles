set nocompatible
filetype off
set rtp+=~/.vim/bundle/vundle/
call vundle#rc()

" Manage these plugins
Bundle 'gmarik/vundle'

" fuzzy search files
Bundle 'wincent/Command-T'
let g:CommandTMatchWindowReverse=1
let g:CommandTMinHeight=10
let g:CommandTMaxHeight=10
let g:CommandTAcceptSelectionTabMap = '<CR>'
let g:CommandTAcceptSelectionMap = '<C-CR>'

" auto close parantheses, etc...
Bundle 'vim-scripts/AutoClose'

" Text objects
Bundle 'kana/vim-textobj-user'
Bundle 'nelstrom/vim-textobj-rubyblock'

filetype plugin indent on
set number
set ruler
set encoding=utf-8
set nowrap
set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab
syntax on

" show hard tabs and trailing spaces
set list listchars=tab:»·,trail:·

" allow incremental search and highlight results
set incsearch
set hlsearch

" disable code folding
set nofoldenable

" directories for swp files
set backupdir=~/.vimbackup
set directory=~/.vimbackup

" remove search highlight when hitting return again
nnoremap <CR> :noh<CR><CR>
noremap <D-w> <C-w>q

