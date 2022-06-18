
command! -bang -nargs=? -complete=dir Files
    \ call fzf#vim#files(<q-args>, {'options': ['--layout=reverse', '--info=inline', '--preview', 'head {}']}, <bang>0)

" fzf window anchored to the buttom
let g:fzf_layout = { 'window': { 'border': 'top', 'xoffset': 0, 'width': 1, 'height': 0.5, 'relative': v:true, 'yoffset': 1.0 } }
" hide statusline when fzf window is open
autocmd! FileType fzf
autocmd  FileType fzf set laststatus=0 noshowmode noruler
  \| autocmd BufLeave <buffer> set laststatus=2 showmode ruler

let g:fzf_action = {
  \ 'ctrl-m': 'tabedit',
  \ 'ctrl-o': 'e',
  \ 'ctrl-t': 'tabedit',
  \ 'ctrl-h':  'botright split',
  \ 'ctrl-v':  'vertical botright split' }
