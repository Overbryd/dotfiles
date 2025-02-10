" *.jsonschema is of type json
au BufRead,BufNewFile *.jsonschema set filetype=json

" *.tfstate is of type json
au BufRead,BufNewFile *.tfstate set filetype=json

" set tabwdith for golang
au Filetype go setlocal tabstop=4 shiftwidth=4 softtabstop=4

