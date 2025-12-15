require('minuet').setup({
  -- virtualtext = {
  --   auto_trigger_ft = {
  --     'elixir',
  --     'python',
  --   },
  --   keymap = {
  --     accept = "<Right>"
  --   },
  --   show_on_completion_menu = true,
  -- },
  -- lsp = {
  --   enabled_ft = {
  --     'elixir',
  --   },
  --   adjust_intendation = true,
  -- },
  cmp = {
    enable_auto_complete = true,
  },
  provider = 'openai_fim_compatible',
  n_completions = 1,
  context_window = 512,
  throttle = 1000,
  debounce = 300,
  notify = 'debug',
  provider_options = {
    openai_fim_compatible = {
      api_key = 'TERM',
      name = 'Ollama',
      -- model = 'codestral:22b',
      model = 'codestral:22b-v0.1-q2_K',
      end_point = 'http://localhost:11434/v1/completions',
      stream = true,
      -- template = {
      --   prompt = function(context_before_cursor, context_after_cursor, opts)
      --     return context_before_cursor
      --   end,
      --   suffix = function(context_before_cursor, context_after_cursor, opts)
      --     return context_after_cursor
      --   end,
      -- },
      optional = {
        -- min_tokens = 1,
        max_tokens = 56,
        -- temperature = 0,
        top_p = 0.9,
        -- stop = '\n\n',
        -- keep_alive = -1,
      }
    },
  },
})

