lua <<EOF
require('nvim-treesitter.configs').setup {
  ensure_installed = {
    "yaml",
    "json",
    "rust",
    "elixir",
    "python",
    "javascript",
    "vim",
    "lua",
    "css",
    "html",
    "terraform",
    "zig",
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

