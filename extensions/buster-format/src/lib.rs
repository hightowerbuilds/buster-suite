//! buster-format — reference extension for Buster IDE.
//!
//! Detects file type by extension, picks the right formatter (prettier, rustfmt,
//! black, gofmt), and runs it via `host_run_command`. Validates the full
//! extension lifecycle: activate, host function round-trip, notify, deactivate.

#![no_std]

extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

// ── Host imports (provided by Buster runtime) ────────────────────────

#[link(wasm_import_module = "buster")]
extern "C" {
    fn log(level: i32, ptr: *const u8, len: usize);
    fn notify(title_ptr: *const u8, title_len: usize, msg_ptr: *const u8, msg_len: usize);
    fn set_return(ptr: *const u8, len: usize);
    fn host_run_command(cmd_ptr: *const u8, cmd_len: usize) -> i32;
    fn host_read_file(path_ptr: *const u8, path_len: usize) -> i32;
}

// ── Memory management (required by host for data transfer) ───────────

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    core::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, 0, len);
    }
}

// ── Helper: call host and get return buffer ──────────────────────────

static mut RETURN_BUF: Vec<u8> = Vec::new();

fn host_log(level: i32, msg: &str) {
    unsafe { log(level, msg.as_ptr(), msg.len()) }
}

fn host_notify(title: &str, body: &str) {
    unsafe { notify(title.as_ptr(), title.len(), body.as_ptr(), body.len()) }
}

fn run_cmd(cmd: &str) -> (i32, Vec<u8>) {
    let code = unsafe { host_run_command(cmd.as_ptr(), cmd.len()) };
    // Return buffer is set by the host after the call
    (code, unsafe { RETURN_BUF.clone() })
}

// ── Formatter detection ──────────────────────────────────────────────

fn formatter_for_ext(ext: &str) -> Option<&'static str> {
    match ext {
        "js" | "jsx" | "ts" | "tsx" | "json" | "css" | "html" | "md" | "yaml" | "yml" =>
            Some("npx prettier --write"),
        "rs" => Some("rustfmt"),
        "py" => Some("black"),
        "go" => Some("gofmt -w"),
        _ => None,
    }
}

fn extract_ext(path: &str) -> &str {
    match path.rfind('.') {
        Some(i) => &path[i + 1..],
        None => "",
    }
}

// ── Exported functions ───────────────────────────────────────────────

/// Called when the extension is loaded. Returns 0 on success.
#[no_mangle]
pub extern "C" fn activate() -> i32 {
    host_log(1, "buster-format activated");
    host_notify("Buster Format", "Extension loaded — ready to format files");
    0
}

/// Called when the extension is unloaded.
#[no_mangle]
pub extern "C" fn deactivate() {
    host_log(1, "buster-format deactivated");
}

/// Format a file. Receives the file path as a UTF-8 string at (ptr, len).
/// Returns 0 on success, -1 on error.
#[no_mangle]
pub extern "C" fn format_file(ptr: *const u8, len: usize) -> i32 {
    let path = unsafe {
        let slice = core::slice::from_raw_parts(ptr, len);
        match core::str::from_utf8(slice) {
            Ok(s) => s,
            Err(_) => {
                host_log(3, "format_file: invalid UTF-8 path");
                return -1;
            }
        }
    };

    let ext = extract_ext(path);
    let formatter = match formatter_for_ext(ext) {
        Some(f) => f,
        None => {
            let msg = format!("No formatter configured for .{} files", ext);
            host_log(2, &msg);
            host_notify("Format", &msg);
            let ret = msg.into_bytes();
            unsafe { set_return(ret.as_ptr(), ret.len()) };
            return -1;
        }
    };

    let cmd = format!("{} {}", formatter, path);
    host_log(1, &format!("Running: {}", cmd));

    let (code, _output) = run_cmd(&cmd);

    if code == 0 {
        let msg = format!("Formatted {}", path);
        host_log(1, &msg);
        host_notify("Format", &msg);
        let ret = b"ok";
        unsafe { set_return(ret.as_ptr(), ret.len()) };
        0
    } else {
        let msg = format!("Formatter failed for {} (exit {})", path, code);
        host_log(3, &msg);
        host_notify("Format Error", &msg);
        let ret = msg.into_bytes();
        unsafe { set_return(ret.as_ptr(), ret.len()) };
        -1
    }
}

/// Check which formatters are available on the system.
/// Returns JSON array of {name, available} objects.
#[no_mangle]
pub extern "C" fn check_formatters(_ptr: *const u8, _len: usize) -> i32 {
    let checkers = [
        ("prettier", "npx prettier --version"),
        ("rustfmt", "rustfmt --version"),
        ("black", "black --version"),
        ("gofmt", "gofmt -h"),
    ];

    let mut results = String::from("[");
    for (i, (name, cmd)) in checkers.iter().enumerate() {
        let (code, _) = run_cmd(cmd);
        if i > 0 { results.push(','); }
        results.push_str(&format!(
            r#"{{"name":"{}","available":{}}}"#,
            name,
            code == 0,
        ));
    }
    results.push(']');

    host_log(1, &format!("Formatter check: {}", results));
    host_notify("Formatters", &results);

    let bytes = results.into_bytes();
    unsafe { set_return(bytes.as_ptr(), bytes.len()) };
    0
}

// ── Global allocator (required for no_std + alloc) ───────────────────

use core::alloc::{GlobalAlloc, Layout};

struct BumpAllocator;

unsafe impl GlobalAlloc for BumpAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let size = layout.size();
        let align = layout.align();
        let total = size + align;
        let mut buf: Vec<u8> = Vec::with_capacity(total);
        let raw: *mut u8 = buf.as_mut_ptr();
        core::mem::forget(buf);
        let addr = raw as usize;
        let aligned_addr = (addr + align - 1) & !(align - 1);
        aligned_addr as *mut u8
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
        // No-op — memory freed when WASM instance is dropped
    }
}

#[global_allocator]
static ALLOC: BumpAllocator = BumpAllocator;

#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
