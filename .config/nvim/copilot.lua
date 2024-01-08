require("copilot").setup({
  suggestion = {
    auto_trigger = true,
    filetypes = {
      terraform = true,
      hcl = true,
      javascript = true,
      typescript = true,
      python = true,
      elixir = true,
      erlang = true,
      ruby = true,
      html = true,
      css = true,
      markdown = true,
      ["*"] = false,
    },
    keymap = {
      accept = "<Right>",
      next = "<Up>",
      prev = "<Down>",
      dismiss = "<Esc>",
    }
  },
  panel = {
    auto_refresh = true
  },
  copilot_node_command = '/opt/homebrew/nodenv/versions/20.8.1/bin/node'
})

