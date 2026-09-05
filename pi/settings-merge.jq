.[0] as $runtime
| .[1] as $managed
| ($runtime * $managed)
| if (($runtime.defaultProvider? | type) == "string" and ($runtime.defaultModel? | type) == "string") then
    .defaultProvider = $runtime.defaultProvider
    | .defaultModel = $runtime.defaultModel
  else . end
| if (($runtime.defaultThinkingLevel? | type) == "string") then
    .defaultThinkingLevel = $runtime.defaultThinkingLevel
  else . end
