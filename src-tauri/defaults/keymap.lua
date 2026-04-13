-- Buster IDE — Default Vim Keymap
-- Edit ~/.buster/keymap.lua to customize.
-- Changes take effect on next app launch.

local keymap = {
  normal = {
    -- Motion
    ["h"] = "cursor.left",
    ["l"] = "cursor.right",
    ["j"] = "cursor.down",
    ["k"] = "cursor.up",
    ["w"] = "cursor.word_right",
    ["b"] = "cursor.word_left",
    ["e"] = "cursor.word_end",
    ["0"] = "cursor.line_start",
    ["$"] = "cursor.line_end",
    ["^"] = "cursor.first_non_blank",
    ["gg"] = "cursor.document_start",
    ["G"] = "cursor.document_end",

    -- Enter Insert mode
    ["i"] = "mode.insert",
    ["a"] = "mode.insert_after",
    ["o"] = "mode.open_below",
    ["O"] = "mode.open_above",
    ["I"] = "mode.insert_line_start",
    ["A"] = "mode.insert_line_end",

    -- Visual mode
    ["v"] = "mode.visual",
    ["V"] = "mode.visual_line",

    -- Command / search
    [":"] = "mode.command",
    ["/"] = "editor.find",

    -- Editing
    ["x"] = "edit.delete_char",
    ["dd"] = "edit.delete_line",
    ["yy"] = "edit.yank_line",
    ["p"] = "edit.paste_after",
    ["P"] = "edit.paste_before",
    ["u"] = "edit.undo",
    ["<C-r>"] = "edit.redo",
    ["."] = "edit.repeat",
    ["J"] = "edit.join_lines",
    [">>"] = "edit.indent",
    ["<<"] = "edit.outdent",
    ["~"] = "edit.toggle_case",

    -- Search
    ["n"] = "search.next",
    ["N"] = "search.prev",
    ["*"] = "search.word_under_cursor",

    -- Operators (trigger pending-operator state)
    ["d"] = "op.delete",
    ["c"] = "op.change",
    ["y"] = "op.yank",
  },

  insert = {
    ["<Esc>"] = "mode.normal",
    ["<C-[>"] = "mode.normal",
  },

  visual = {
    ["<Esc>"] = "mode.normal",
    ["d"] = "visual.delete",
    ["y"] = "visual.yank",
    ["c"] = "visual.change",
    [">"] = "visual.indent",
    ["<"] = "visual.outdent",
  },

  passthrough = { "<Mod>+" },

  options = {
    timeout = 1000,
  },
}

return keymap
