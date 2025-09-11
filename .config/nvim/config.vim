" disable old-time vi compatibility
set nocompatible

" disable ruby provider
let g:loaded_ruby_provider = 0

" disable perl provider
let g:loaded_perl_provider = 0

" disable node provider
let g:loaded_node_provider = 0

" setup python provider
let g:python3_host_prog = $PYENV_ROOT . '/versions/' . $PYENV_GLOBAL . '/bin/python'

" common settings
filetype plugin indent on
set signcolumn=yes
set number
set ruler
set encoding=utf-8
set nowrap
set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab
set norelativenumber
set clipboard+=unnamedplus
syntax on

" colorschema and color customisations
" reduce colors
" let g:yowish = {}
" let g:yowish.colors = {
"   \ 'green': ['#ffbe3c', '215'],
"   \ 'lightGreen': ['#ffcc66', '222'],
"   \ 'lightBlue': ['#ffcc66', '222'],
"   \ 'lightViolet': ['#bebebe', '249'],
"   \ 'selected': ['#0e0e0e', '232'],
"   \ }
" colorscheme yowish
colorscheme paramount
highlight TabLineFill ctermfg=white ctermbg=DarkGrey
highlight TabLine ctermfg=white ctermbg=DarkGrey
highlight TabLineSel ctermfg=Black ctermbg=LightMagenta

" turn off modeline
set modelines=0
set nomodeline

" we have a good terminal connection, send more characters for redrawing
set ttyfast

" turn off that visual and audible bell
set vb t_vb=

" disable netrw banner
let g:netrw_banner=0
" disable netrw history
let g:netrw_dirhistmax=0
" netrw liststyle as tree
let g:netrw_liststyle=3
" open files on right
let g:netrw_altv=1
" open previews vertically
let g:netrw_preview=1

" make backspace work as expected
set backspace=indent,eol,start

" show hard tabs and trailing spaces
set list listchars=tab:»·,trail:·

" use a vertical line at 100 column width
" set fillchars=
set cc=100

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
set backupdir=~/.nvim/tmp/backup//
set directory=~/.nvim/tmp/swap//

" save an undofile to be able to undo changes after closing files
set undofile
set undodir=~/.nvim/tmp/undo//

" I got enough memory, no need for swap files
set noswapfile

" do not show where the cursor is (very slow with ruby syntax *sigh*)
set nocursorline

" set a scroll offset above and below the cursor
set scrolloff=10

" Prescribe Vim to switch to an existing tab page if it contains a window displaying
" the target buffer, otherwise open a new tab.
" https://stackoverflow.com/a/6853779
set switchbuf+=usetab,newtab

" Configure the quickfix buffer (also works in location lists).
" Open file using <Enter> in a new tab.
" https://vi.stackexchange.com/a/6999
autocmd FileType qf nnoremap <buffer> <Enter> <C-W><Enter><C-W>T

" Allow editing crontabs
" http://stackoverflow.com/questions/15395479/why-ive-got-no-crontab-entry-on-os-x-when-using-vim
autocmd FileType crontab setlocal nowritebackup

" Removes trailing whitespace on save
autocmd BufWritePre .vimrc,Gemfile,Rakefile,*.{js,jsx,rb,ru,html,erl,erb,ex,exs,py,tf} :call Preserve("%s/\\s\\+$//e")

" Preserves the cursor and search history around executing a command
function! Preserve(command)
  let _s=@/
  let line = line(".")
  let col = col(".")
  execute a:command
  let @/=_s
  call cursor(line, col)
endfunction
