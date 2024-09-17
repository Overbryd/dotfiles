local supermaven = require'supermaven-nvim'

supermaven.setup({
  keymaps = {
    accept_suggestion = "<Right>",
    -- clear_suggestion = "<Esc>",
  },
  condition = function()
    return string.match(vim.fn.expand("%:t"), ".envrc")
  end,
})
