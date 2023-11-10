" Inspired by https://github.com/arp242/startscreen.vim/blob/master/plugin/startscreen.vim
fun! vimenter#letthefunbegin()
  " Don't run if:
  " - there are commandline arguments;
  " - the buffer isn't empty (e.g. cmd | vi -);
  " - we're not invoked as vim or gvim;
  " - we're starting in insert mode.
  if argc() || line2byte('$') != -1 || v:progname !~? '^[-gmnq]\=vim\=x\=\%[\.exe]$' || &insertmode
    return
  endif

  " Just open the fuzzy file finder
  :Files!

endfun

augroup vimenter
  autocmd!
  autocmd VimEnter * call vimenter#letthefunbegin()
augroup end

