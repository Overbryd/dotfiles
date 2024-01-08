" :Tabr
" Close tabs (and their splits) to the right with tabr
" https://superuser.com/questions/555011/vim-close-all-tabs-to-the-right
command -nargs=0 Tabr :.+1,$tabdo :tabc

" :Term
" Open a terminal in insert mode
function! TermOpen(...)
  function! NoOp()
  endfunction

  let cmd  = a:0 >= 1 ? a:1 : ''
  let type = a:0 >= 2 ? a:2 : 's'
  let Func = a:0 >= 3 ? a:3 : function('NoOp')

  let callback = { 'type': type, 'ext_cb': Func }
  function callback.on_exit(job_id, code, event)
    if a:code == 0  " close the terminal window when done if no error
      silent! bd!
      silent! q
    endif
    call self.ext_cb()
  endfunction

  setlocal number relativenumber signcolumn=no listchars=
  setlocal nocursorcolumn cursorline
  call termopen(len(cmd) ? cmd : &shell, callback)
  startinsert
endfunction
" Term opens a terminal
command -nargs=0 Term :call TermOpen('env TERM=st-256color bash -il', 'm')
" start in insert mode
autocmd BufEnter term://* startinsert
" map <Esc> to exit terminal-mode
tnoremap <Esc> <C-\><C-n>

" :w!!
" force the save of write protected files with sudo
cmap w!! w! !sudo tee > /dev/null %

" command line shortcuts
cnoremap <C-a> <Home>

" remove search highlight when hitting escape again
nnoremap <Enter> :nohlsearch<CR>

" disable arrow keys
map <Up> <NOP>
map <Down> <NOP>
map <Left> <NOP>
map <Right> <NOP>

" search with <leader>t
noremap <leader>t :Files<CR>
" serach files in git with <leader>g
noremap <leader>g :GFiles<CR>
" search buffers with <leader>b
noremap <leader>b :Buffers<CR>

" replace highlighted text
" first highlight text with a search or *
" then hight <leader>s to enter replace mode
noremap <leader>s :%s///g<left><left>

" prepare command to the current file, confirm with <CR>
noremap <leader>rm :!rm %
noremap <leader>grm :!git rm %

" Edit ultisnips for current filetype using <leader>U
noremap <leader>U :UltiSnipsEdit<CR>


