use tauri::command;
use mlua::prelude::*;

const DEFAULT_KEYMAP: &str = include_str!("../../defaults/keymap.lua");

/// Evaluate a Lua keymap file and return the resulting table as JSON.
/// Reads ~/.buster/keymap.lua if it exists, otherwise uses the bundled default.
#[command]
pub fn evaluate_keymap() -> Result<String, String> {
    // Try user keymap first
    let user_keymap = dirs::home_dir()
        .map(|h| h.join(".buster").join("keymap.lua"));

    let lua_source = if let Some(ref path) = user_keymap {
        if path.exists() {
            std::fs::read_to_string(path)
                .unwrap_or_else(|_| DEFAULT_KEYMAP.to_string())
        } else {
            DEFAULT_KEYMAP.to_string()
        }
    } else {
        DEFAULT_KEYMAP.to_string()
    };

    let lua = Lua::new();
    let value: LuaValue = lua
        .load(&lua_source)
        .eval()
        .map_err(|e| format!("Lua error: {}", e))?;

    // Serialize Lua value to JSON via serde
    let json = serde_json::to_string(&lua_to_json(&value))
        .map_err(|e| format!("JSON serialization error: {}", e))?;

    Ok(json)
}

/// Convert a Lua value to a serde_json::Value.
fn lua_to_json(val: &LuaValue) -> serde_json::Value {
    match val {
        LuaValue::Nil => serde_json::Value::Null,
        LuaValue::Boolean(b) => serde_json::Value::Bool(*b),
        LuaValue::Integer(n) => serde_json::json!(*n),
        LuaValue::Number(n) => serde_json::json!(*n),
        LuaValue::String(s) => {
            serde_json::Value::String(s.to_string_lossy().to_string())
        }
        LuaValue::Table(t) => {
            // Check if this is an array (sequential integer keys starting at 1)
            let len = t.raw_len();
            if len > 0 {
                // Check if it's a pure array
                let mut is_array = true;
                let mut arr = Vec::new();
                for i in 1..=len {
                    if let Ok(v) = t.raw_get::<LuaValue>(i) {
                        arr.push(lua_to_json(&v));
                    } else {
                        is_array = false;
                        break;
                    }
                }
                // Also check for non-integer keys
                let mut has_string_keys = false;
                if let Ok(pairs) = t.clone().pairs::<LuaValue, LuaValue>().collect::<Result<Vec<_>, _>>() {
                    for (k, _) in &pairs {
                        if matches!(k, LuaValue::String(_)) {
                            has_string_keys = true;
                            break;
                        }
                    }
                }
                if is_array && !has_string_keys {
                    return serde_json::Value::Array(arr);
                }
            }

            // It's a table with string keys — convert to object
            let mut map = serde_json::Map::new();
            if let Ok(pairs) = t.clone().pairs::<LuaValue, LuaValue>().collect::<Result<Vec<_>, _>>() {
                for (k, v) in pairs {
                    let key = match &k {
                        LuaValue::String(s) => s.to_string_lossy().to_string(),
                        LuaValue::Integer(n) => n.to_string(),
                        _ => continue,
                    };
                    map.insert(key, lua_to_json(&v));
                }
            }
            serde_json::Value::Object(map)
        }
        _ => serde_json::Value::Null,
    }
}
