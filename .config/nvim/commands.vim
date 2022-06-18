" :Tabr
" Close tabs (and their splits) to the right with tabr
" https://superuser.com/questions/555011/vim-close-all-tabs-to-the-right
command -nargs=0 Tabr :.+1,$tabdo :tabc

" :w!!
" force the save of write protected files with sudo
cmap w!! w! !sudo tee > /dev/null %

" command line shortcuts
cnoremap <C-a> <Home>

" remove search highlight when hitting escape again
nnoremap <Enter> :nohlsearch<CR>

" disable arrow keys
noremap <Up> <NOP>
noremap <Down> <NOP>
noremap <Left> <NOP>
noremap <Right> <NOP>

" search with <leader>t
noremap <leader>t :GFiles<CR>
noremap <leader>T :Files<CR>
" search buffers with <leader>b
noremap <leader>b :Buffers<CR>

