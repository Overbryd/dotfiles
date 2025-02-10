lua <<EOF
require('nvim-treesitter.configs').setup {
  ensure_installed = {
    "yaml",
    "json",
    "rust",
    "elixir",
    "eex",
    "heex",
    "python",
    "javascript",
    "vim",
    "lua",
    "css",
    "html",
    "terraform",
    "zig",
    "swift",
  },
  highlight = {
    enable = true,
    additional_vim_regex_highlighting = false,
  },
  autotag = {
    enable = true
  }
}
EOF

