" Taken from
" https://github.com/arp242/startscreen.vim/blob/master/plugin/startscreen.vim
fun! startscreen#start()
  " Don't run if:
  " - there are commandline arguments;
  " - the buffer isn't empty (e.g. cmd | vi -);
  " - we're not invoked as vim or gvim;
  " - we're starting in insert mode.
  if argc() || line2byte('$') != -1 || v:progname !~? '^[-gmnq]\=vim\=x\=\%[\.exe]$' || &insertmode
    return
  endif

  :Files

endfun

augroup startscreen
  autocmd!
  autocmd VimEnter * call startscreen#start()
augroup end
