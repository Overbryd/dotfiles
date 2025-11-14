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

" close all other buffers (buffer only)
nnoremap <leader>bo :w \| %bd \| e# \| bd# <CR>

