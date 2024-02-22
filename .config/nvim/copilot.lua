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
      go = true,
      rust = true,
      java = true,
      zig = true,
      html = true,
      css = true,
      markdown = true,
      vim = true,
      lua = true,
      sh = true,
      yaml = true,
      json = true,
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

