use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Clone, Serialize, PartialEq)]
pub struct TermCell {
    pub ch: String,
    pub fg: [u8; 3],
    pub bg: [u8; 3],
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub inverse: bool,
}

#[derive(Clone, Serialize)]
pub struct TermScreen {
    pub rows: u16,
    pub cols: u16,
    pub cursor_row: u16,
    pub cursor_col: u16,
    pub cells: Vec<Vec<TermCell>>,
}

fn color_to_rgb(color: &vt100::Color) -> [u8; 3] {
    match color {
        vt100::Color::Default => [205, 214, 244], // Catppuccin text
        vt100::Color::Idx(i) => idx_to_rgb(*i),
        vt100::Color::Rgb(r, g, b) => [*r, *g, *b],
    }
}

fn color_to_bg_rgb(color: &vt100::Color) -> [u8; 3] {
    match color {
        vt100::Color::Default => [30, 30, 46], // Catppuccin base
        vt100::Color::Idx(i) => idx_to_rgb(*i),
        vt100::Color::Rgb(r, g, b) => [*r, *g, *b],
    }
}

fn idx_to_rgb(i: u8) -> [u8; 3] {
    // Standard 16 ANSI colors (Catppuccin Mocha mapped)
    match i {
        0 => [69, 71, 90],       // black → surface1
        1 => [243, 139, 168],    // red
        2 => [166, 227, 161],    // green
        3 => [249, 226, 175],    // yellow
        4 => [137, 180, 250],    // blue
        5 => [245, 194, 231],    // magenta
        6 => [148, 226, 213],    // cyan
        7 => [186, 194, 222],    // white
        8 => [88, 91, 112],      // bright black
        9 => [243, 139, 168],    // bright red
        10 => [166, 227, 161],   // bright green
        11 => [249, 226, 175],   // bright yellow
        12 => [137, 180, 250],   // bright blue
        13 => [245, 194, 231],   // bright magenta
        14 => [148, 226, 213],   // bright cyan
        15 => [166, 173, 200],   // bright white
        // 256-color: 16-231 = 6x6x6 cube, 232-255 = grayscale
        16..=231 => {
            let c = i - 16;
            let r = (c / 36) * 51;
            let g = ((c % 36) / 6) * 51;
            let b = (c % 6) * 51;
            [r, g, b]
        }
        232..=255 => {
            let v = 8 + (i - 232) * 10;
            [v, v, v]
        }
    }
}

fn extract_screen(parser: &vt100::Parser) -> TermScreen {
    let screen = parser.screen();
    let (rows, cols) = screen.size();
    let (cursor_row, cursor_col) = screen.cursor_position();

    let mut cells = Vec::with_capacity(rows as usize);
    for row in 0..rows {
        let mut row_cells = Vec::with_capacity(cols as usize);
        for col in 0..cols {
            let cell = screen.cell(row, col).unwrap();
            let contents = cell.contents();
            let ch = if contents.is_empty() {
                " ".to_string()
            } else {
                contents
            };

            let fg = if cell.inverse() {
                color_to_bg_rgb(&cell.bgcolor())
            } else {
                color_to_rgb(&cell.fgcolor())
            };
            let bg = if cell.inverse() {
                color_to_rgb(&cell.fgcolor())
            } else {
                color_to_bg_rgb(&cell.bgcolor())
            };

            row_cells.push(TermCell {
                ch,
                fg,
                bg,
                bold: cell.bold(),
                italic: cell.italic(),
                underline: cell.underline(),
                inverse: cell.inverse(),
            });
        }
        cells.push(row_cells);
    }

    TermScreen {
        rows,
        cols,
        cursor_row,
        cursor_col,
        cells,
    }
}

#[derive(Clone, Serialize)]
pub struct ChangedRow {
    pub index: u16,
    pub cells: Vec<TermCell>,
}

#[derive(Clone, Serialize)]
pub struct TermScreenDelta {
    pub rows: u16,
    pub cols: u16,
    pub cursor_row: u16,
    pub cursor_col: u16,
    pub changed_rows: Vec<ChangedRow>,
    pub full: bool,
    /// "none", "press", "press_release", "button_motion", "any_motion"
    pub mouse_mode: String,
    /// "default", "utf8", "sgr"
    pub mouse_encoding: String,
    pub bracketed_paste: bool,
}

fn compute_delta(
    new_screen: TermScreen,
    last_cells: &mut Vec<Vec<TermCell>>,
    parser: &vt100::Parser,
) -> TermScreenDelta {
    let rows = new_screen.rows;
    let cols = new_screen.cols;

    let full = last_cells.is_empty()
        || last_cells.len() != rows as usize
        || last_cells.first().map(|r| r.len()).unwrap_or(0) != cols as usize;

    let mut changed_rows = Vec::new();

    for (i, row) in new_screen.cells.iter().enumerate() {
        let changed = full || i >= last_cells.len() || last_cells[i] != *row;
        if changed {
            changed_rows.push(ChangedRow {
                index: i as u16,
                cells: row.clone(),
            });
        }
    }

    *last_cells = new_screen.cells;

    let screen = parser.screen();
    let mouse_mode = match screen.mouse_protocol_mode() {
        vt100::MouseProtocolMode::None => "none",
        vt100::MouseProtocolMode::Press => "press",
        vt100::MouseProtocolMode::PressRelease => "press_release",
        vt100::MouseProtocolMode::ButtonMotion => "button_motion",
        vt100::MouseProtocolMode::AnyMotion => "any_motion",
    };
    let mouse_encoding = match screen.mouse_protocol_encoding() {
        vt100::MouseProtocolEncoding::Default => "default",
        vt100::MouseProtocolEncoding::Utf8 => "utf8",
        vt100::MouseProtocolEncoding::Sgr => "sgr",
    };

    TermScreenDelta {
        rows,
        cols,
        cursor_row: new_screen.cursor_row,
        cursor_col: new_screen.cursor_col,
        changed_rows,
        full,
        mouse_mode: mouse_mode.to_string(),
        mouse_encoding: mouse_encoding.to_string(),
        bracketed_paste: screen.bracketed_paste(),
    }
}

pub struct PtyInstance {
    writer: Box<dyn Write + Send>,
    _master: Box<dyn MasterPty + Send>,
    parser: Arc<Mutex<vt100::Parser>>,
}

pub struct TerminalManager {
    instances: Mutex<HashMap<String, Arc<Mutex<PtyInstance>>>>,
    next_id: Mutex<u32>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            instances: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    pub fn spawn(
        &self,
        rows: u16,
        cols: u16,
        cwd: Option<String>,
        on_screen: impl Fn(String, TermScreenDelta) + Send + Sync + 'static,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let mut id_counter = self.next_id.lock().map_err(|e| e.to_string())?;
        let term_id = format!("term_{}", *id_counter);
        *id_counter += 1;

        let parser = Arc::new(Mutex::new(vt100::Parser::new(rows, cols, 10_000)));

        let instance = Arc::new(Mutex::new(PtyInstance {
            writer,
            _master: pair.master,
            parser: parser.clone(),
        }));

        self.instances
            .lock()
            .map_err(|e| e.to_string())?
            .insert(term_id.clone(), instance);

        // Send initial empty screen as a full delta
        let on_screen = Arc::new(on_screen);
        {
            let p = parser.lock().unwrap_or_else(|e| e.into_inner());
            let screen = extract_screen(&p);
            drop(p);
            let initial_delta = TermScreenDelta {
                rows: screen.rows,
                cols: screen.cols,
                cursor_row: screen.cursor_row,
                cursor_col: screen.cursor_col,
                changed_rows: screen.cells.into_iter().enumerate().map(|(i, cells)| ChangedRow {
                    index: i as u16,
                    cells,
                }).collect(),
                full: true,
                mouse_mode: "none".to_string(),
                mouse_encoding: "default".to_string(),
                bracketed_paste: false,
            };
            on_screen(term_id.clone(), initial_delta);
        }

        // Reader thread: feed PTY output into vt100, emit screen updates
        let term_id_for_reader = term_id.clone();
        let parser_for_reader = parser.clone();
        let on_screen_for_reader = on_screen.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut last_cells: Vec<Vec<TermCell>> = Vec::new();
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut p = parser_for_reader.lock().unwrap_or_else(|e| e.into_inner());
                        p.process(&buf[..n]);
                        let screen = extract_screen(&p);
                        let delta = compute_delta(screen, &mut last_cells, &p);
                        drop(p);
                        on_screen_for_reader(term_id_for_reader.clone(), delta);
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(term_id)
    }

    pub fn write(&self, term_id: &str, data: &[u8]) -> Result<(), String> {
        let instances = self.instances.lock().map_err(|e| e.to_string())?;
        let instance = instances.get(term_id).ok_or("Terminal not found")?;
        let mut inst = instance.lock().map_err(|e| e.to_string())?;
        inst.writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        inst.writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, term_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let instances = self.instances.lock().map_err(|e| e.to_string())?;
        let instance = instances.get(term_id).ok_or("Terminal not found")?;
        let inst = instance.lock().map_err(|e| e.to_string())?;
        inst._master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))?;
        // Also resize the vt100 parser
        inst.parser.lock().unwrap_or_else(|e| e.into_inner()).set_size(rows, cols);
        Ok(())
    }

    pub fn kill(&self, term_id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().map_err(|e| e.to_string())?;
        instances.remove(term_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idx_to_rgb_standard_black() {
        assert_eq!(idx_to_rgb(0), [69, 71, 90]);
    }

    #[test]
    fn idx_to_rgb_standard_red() {
        assert_eq!(idx_to_rgb(1), [243, 139, 168]);
    }

    #[test]
    fn idx_to_rgb_standard_green() {
        assert_eq!(idx_to_rgb(2), [166, 227, 161]);
    }

    #[test]
    fn idx_to_rgb_bright_white() {
        assert_eq!(idx_to_rgb(15), [166, 173, 200]);
    }

    #[test]
    fn idx_to_rgb_256_cube_origin() {
        // Color 16 = (0,0,0) in 6x6x6 cube
        assert_eq!(idx_to_rgb(16), [0, 0, 0]);
    }

    #[test]
    fn idx_to_rgb_256_cube_red() {
        // Color 196 = (5,0,0) in 6x6x6 cube → (255, 0, 0)
        assert_eq!(idx_to_rgb(196), [255, 0, 0]);
    }

    #[test]
    fn idx_to_rgb_256_cube_white() {
        // Color 231 = (5,5,5) → (255, 255, 255)
        assert_eq!(idx_to_rgb(231), [255, 255, 255]);
    }

    #[test]
    fn idx_to_rgb_grayscale_darkest() {
        // Color 232 = darkest gray → 8
        assert_eq!(idx_to_rgb(232), [8, 8, 8]);
    }

    #[test]
    fn idx_to_rgb_grayscale_lightest() {
        // Color 255 = lightest gray → 238
        assert_eq!(idx_to_rgb(255), [238, 238, 238]);
    }

    #[test]
    fn color_to_rgb_default_is_catppuccin_text() {
        let c = color_to_rgb(&vt100::Color::Default);
        assert_eq!(c, [205, 214, 244]);
    }

    #[test]
    fn color_to_bg_rgb_default_is_catppuccin_base() {
        let c = color_to_bg_rgb(&vt100::Color::Default);
        assert_eq!(c, [30, 30, 46]);
    }

    #[test]
    fn color_to_rgb_direct_rgb() {
        let c = color_to_rgb(&vt100::Color::Rgb(100, 200, 50));
        assert_eq!(c, [100, 200, 50]);
    }

    #[test]
    fn terminal_manager_starts_empty() {
        let mgr = TerminalManager::new();
        let instances = mgr.instances.lock().unwrap();
        assert!(instances.is_empty());
    }
}
