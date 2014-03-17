autocmd!
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

" repeat hooks for other plugins
Bundle 'tpope/vim-repeat'

" Ruby
Bundle 'vim-ruby/vim-ruby'

" Javascript
Bundle 'pangloss/vim-javascript'

" Ruby text objects
Bundle 'kana/vim-textobj-user'
Bundle 'nelstrom/vim-textobj-rubyblock'

" Easy quoting with the surround plugin
Bundle 'tpope/vim-surround'

" Ag file searching
Bundle 'rking/ag.vim'
map <D-F> :Ag --literal ""<Left>

" textmate like <Tab> expansion snippets
Bundle 'msanders/snipmate.vim'

" complete as you type
""Bundle 'Valloric/YouCompleteMe'
""let g:ycm_key_list_select_completion = ['<Enter>', '<Down>']

colorscheme Tomorrow-Night

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

" enable matchit
runtime macros/matchit.vim

" show hard tabs and trailing spaces
set list listchars=tab:»·,trail:·

" no vertical line
set fillchars=

" allow incremental search and highlight results
set incsearch
set hlsearch
set showmatch

" No crappy vim regular expression infile searching
" see :help magic for an explanation of flags.
nnoremap / /\M
nnoremap ? ?\M

" be case insensitive until an uppercase character is typed
set smartcase

" disable code folding
set nofoldenable

" directories for backup, tmp and swp files
set backupdir=~/.vimtmp/backup
set directory=~/.vimtmp/swap

" save an undofile to be able to undo changes after closing files
set undofile
set undodir=~/.vimtmp/undo

" I got enough memory, no need for swap files
set noswapfile

" show where the cursor is
set cursorline

" set a scroll offset above and below the cursor
set scrolloff=10

" turn off that visual and audible bell
set vb t_vb=

" remap close buffer to the OSX default for close window
noremap <D-w> <C-w>q

" remove search highlight when hitting return again
nnoremap <CR> :nohlsearch<CR>

" Preserves the cursor and search history around executing a command
function! Preserve(command)
  let _s=@/
  let line = line(".")
  let col = col(".")
  execute a:command
  let @/=_s
  call cursor(line, col)
endfunction

" Removes trailing whitespace on save
autocmd BufWritePre .vimrc,Gemfile,Rakefile,*.{js,rb,ru,html,erl,erb} :call Preserve("%s/\\s\\+$//e")

" Reset CommandT cache when regaining focus
autocmd FocusGained * :CommandTFlush

