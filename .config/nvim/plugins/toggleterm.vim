lua << EOF
require('toggleterm').setup({
  start_in_insert = true,
  hide_numbers = false,
})

function _G.set_toggleterm_keymaps()
  local opts = {buffer = 0}
  vim.keymap.set('t', '<esc>', [[<C-\><C-n>]], opts)
end
-- if you only want these mappings for toggle term use term://*toggleterm#* instead
vim.cmd('autocmd! TermOpen term://*toggleterm#* lua set_toggleterm_keymaps()')

-- Custom terminals

-- Create a terminal for ollama
local Terminal = require('toggleterm.terminal').Terminal
local ollama = Terminal:new({
cmd = "ollama run $(ollama list | tail -n+2 | fzf --cycle | awk '{print $1}')",
  hidden = true,
  close_on_exit = false,
  on_open = function(term)
    vim.api.nvim_buf_set_keymap(term.bufnr, "n", "<esc>", "<cmd>close<CR>", { noremap = true, silent = true })
  end,
})
function _ollama_toggle()
  ollama:toggle()
end
vim.api.nvim_set_keymap("n", "<leader>ai", "<cmd>lua _ollama_toggle()<CR>", { noremap = true, silent = true })
EOF

