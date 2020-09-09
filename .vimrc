set nocompatible
filetype off
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" Turn of modeline
set modelines=0
set nomodeline
" Prescribe Vim to switch to an existing tab page if it contains a window displaying
" the target buffer, otherwise open a new tab.
" https://stackoverflow.com/a/6853779
set switchbuf+=usetab,newtab
" Configure the quickfix buffer (also works in location lists).
" Open file using <Enter> in a new tab.
" https://vi.stackexchange.com/a/6999
autocmd FileType qf nnoremap <buffer> <Enter> <C-W><Enter><C-W>T
" Close tabs (and their splits) to the right with tabr
" https://superuser.com/questions/555011/vim-close-all-tabs-to-the-right
command -nargs=0 Tabr :.+1,$tabdo :tabc

" Manage these plugins
Plugin 'gmarik/Vundle.vim'

" repeat hooks for other plugins
Plugin 'tpope/vim-repeat'

" Easy quoting with the surround plugin
Plugin 'tpope/vim-surround'

" fuzzy search files
Plugin 'wincent/command-t'
let g:CommandTMatchWindowReverse=1
let g:CommandTMinHeight=10
let g:CommandTMaxHeight=10
let g:CommandTAcceptSelectionTabMap = '<CR>'
let g:CommandTAcceptSelectionMap = '<C-CR>'
let g:CommandTCancelMap = ['<ESC>', '<C-c>']
let g:CommandTFileScanner='find'
let g:CommandTWildIgnore=&wildignore . ",*/node_modules/*"

" Testing
Plugin 'janko-m/vim-test'
map <Leader>s :TestNearest<CR>
" map <Leader>f :TestFile<CR>

" Ruby
" Load system ruby for vim (avoid JRuby slowdowns)
let g:ruby_path=system('which -a ruby | tail -n1')
" Ruby file type support
Plugin 'vim-ruby/vim-ruby'
" workaround slow ruby file handling
if !empty(matchstr($MY_RUBY_HOME, 'jruby'))
  let g:ruby_path = join(split(glob($MY_RUBY_HOME.'/lib/ruby/*.*')."\n".glob($MY_RUBY_HOME.'/lib/rubysite_ruby/*'),"\n"),',')
endif
" splitjoin.vim
Plugin 'AndrewRadev/splitjoin.vim'
" Run RSpec tests from within vim
" Plugin 'thoughtbot/vim-rspec'
" map <Leader>s :call RunNearestSpec()<CR>
" map <Leader>f :call RunCurrentSpecFile()<CR>
" let g:rspec_command = "!`test -x bin/rspec && printf bin/rspec || printf rspec` --no-profile {spec}"

" pgsql
Plugin 'exu/pgsql.vim'

" html
" The following settings allow to match % to tags
set matchpairs+=<:>
set showmatch
set matchtime=3
" The following Plugin closes tags
Plugin 'alvan/vim-closetag'
let g:closetag_filenames = '*.html,*.xhtml,*.phtml,*.jsx,*.svelte'
let g:closetag_filetypes = 'html,xhtml,phtml,jsx,svelte'
let g:closetag_xhtml_filenames = '*.xhtml,*.jsx'
let g:closetag_xhtml_filetypes = 'xhtml,jsx'
let g:closetag_regions = {
    \ 'typescript.tsx': 'jsxRegion,tsxRegion',
    \ 'javascript.jsx': 'jsxRegion',
    \ }

" Javascript
Plugin 'yuezk/vim-js'
" Svelte
Plugin 'evanleck/vim-svelte'
let g:svelte_indent_script = 1
let g:svelte_indent_style = 1
" JSX
Plugin 'maxmellon/vim-jsx-pretty'
" GraphQL
Plugin 'jparise/vim-graphql'

" Slim templates
Plugin 'slim-template/vim-slim'

" Ruby text objects
Plugin 'kana/vim-textobj-user'
Plugin 'nelstrom/vim-textobj-rubyblock'

" Elixir
Plugin 'elixir-lang/vim-elixir'
Plugin 'mhinz/vim-mix-format'
Plugin 'slime-lang/vim-slime-syntax'

" Do not automatically format on saving.
let g:mix_format_on_save = 0
" Silence errors
let g:mix_format_silent_errors = 1
" <Leader>f to format
map <Leader>f :MixFormat<CR>

" Dockerfile syntax
" Plugin 'docker/docker' , {'rtp': '/contrib/syntax/vim/'}

" Insert or delete brackets, parens, quotes in pair
Plugin 'jiangmiao/auto-pairs'

" Rg (ripgrep) file searching
Plugin 'jremmen/vim-ripgrep'
" highlight matches
let g:rg_highlight=1
" derive root from cwd
let g:rg_derive_root=1
" Searches case insensitively if the pattern is all lowercase, case
" sensitively otherwise.
let g:rg_command='rg --vimgrep --smart-case'

" textmate like <Tab> expansion snippets
Plugin 'MarcWeber/vim-addon-mw-utils'
Plugin 'tomtom/tlib_vim'
Plugin 'garbas/vim-snipmate'

" load a bunch of those snippets
Plugin 'honza/vim-snippets'

" comment stuff in/out with gc<motion>
Plugin 'tpope/vim-commentary'

" plugin that helps to end certain structures like if ... end
Plugin 'tpope/vim-endwise'

" Rename a buffer within Vim and on the disk
Plugin 'danro/rename.vim'

" Syntax and style checking
Plugin 'scrooloose/syntastic'
let g:syntastic_aggregate_errors = 1
let g:syntastic_always_populate_loc_list = 1
let g:syntastic_auto_loc_list = 1
let g:syntastic_check_on_open = 0
let g:syntastic_check_on_wq = 0
let g:syntastic_mode_map = {'mode':'passive'}
set statusline+=%#warningmsg#
set statusline+=%{SyntasticStatuslineFlag()}
set statusline+=%*
" JSX syntastic configuration
let g:syntastic_javascript_checkers = ['jsxhint']
let g:syntastic_javascript_jsxhint_exec = 'npm run lint'

" Change code right in the quickfix window
Plugin 'stefandtw/quickfix-reflector.vim'

" Graph vim undo tree to make it usable
Plugin 'vim-scripts/Gundo'

" Git integration, using it for git blame in a vertical split
Plugin 'tpope/vim-fugitive'

" Mainly working with bash .sh scripts
let g:is_bash=1

" Install colorschema paramount
Plugin 'owickstrom/vim-colors-paramount'

" Terraform support
Plugin 'hashivim/vim-terraform'

call vundle#end()

filetype plugin indent on
set number
set ruler
set encoding=utf-8
set nowrap
set tabstop=2
set shiftwidth=2
set softtabstop=2
set expandtab
set norelativenumber
syntax on
colorscheme paramount

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

" enable clipboard integration on osx (if compiled with +clipboard)
set clipboard=unnamed

" enable matchit
runtime macros/matchit.vim

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
set backupdir=~/.vim/tmp/backup
set directory=~/.vim/tmp/swap

" save an undofile to be able to undo changes after closing files
set undofile
set undodir=~/.vimtmp/undo
" use many levels of undo

" I got enough memory, no need for swap files
set noswapfile

" do not show where the cursor is (very slow with ruby syntax *sigh*)
set nocursorline

" set a scroll offset above and below the cursor
set scrolloff=10

" turn off that visual and audible bell
set vb t_vb=

" limit syntax coloring to a certain length. speeds up things when working with long lines
set synmaxcol=160

" we have a good terminal connection, send more characters for redrawing
set ttyfast

" disable arrow keys
" noremap <Up> <NOP>
" noremap <Down> <NOP>
" noremap <Left> <NOP>
" noremap <Right> <NOP>

" remap close buffer to the OSX default for close window
noremap <D-w> <C-w>q

" remove search highlight when hitting escape again
nnoremap <Enter> :nohlsearch<CR>

" yank till end of line
nnoremap Y y$

" command line shortcuts
cnoremap <C-a> <Home>

" force the save of write protected files with sudo
cmap w!! w! !sudo tee > /dev/null %

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
autocmd BufWritePre .vimrc,Gemfile,Rakefile,*.{js,jsx,rb,ru,html,erl,erb,ex,exs} :call Preserve("%s/\\s\\+$//e")

" Reset CommandT cache when regaining focus or writing to a file
autocmd FocusGained * :CommandTFlush
autocmd BufWritePost * :CommandTFlush

" Allow editing crontabs
" http://stackoverflow.com/questions/15395479/why-ive-got-no-crontab-entry-on-os-x-when-using-vim
autocmd FileType crontab setlocal nowritebackup

