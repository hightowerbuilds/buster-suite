use tauri::{command, State};
use crate::debugger::{DebugManager, DebugState, SourceBreakpoint, StackFrame, Variable};

#[command]
pub fn debug_toggle_breakpoint(
    state: State<'_, DebugManager>,
    file_path: String,
    line: u32,
) -> Result<bool, String> {
    Ok(state.toggle_breakpoint(&file_path, line))
}

#[command]
pub fn debug_get_breakpoints(
    state: State<'_, DebugManager>,
    file_path: String,
) -> Result<Vec<SourceBreakpoint>, String> {
    Ok(state.get_breakpoints(&file_path))
}

#[command]
pub fn debug_state(state: State<'_, DebugManager>) -> Result<String, String> {
    Ok(match state.state() {
        DebugState::Idle => "idle",
        DebugState::Running => "running",
        DebugState::Paused => "paused",
        DebugState::Stopped => "stopped",
    }.to_string())
}

#[command]
pub async fn debug_launch(
    state: State<'_, DebugManager>,
    adapter_cmd: String,
    adapter_args: Vec<String>,
    program: String,
    workspace_root: String,
) -> Result<(), String> {
    let args_ref: Vec<&str> = adapter_args.iter().map(|s| s.as_str()).collect();
    state.launch(&adapter_cmd, &args_ref, &program, &workspace_root).await
}

#[command]
pub async fn debug_continue(state: State<'_, DebugManager>) -> Result<(), String> {
    state.continue_execution().await
}

#[command]
pub async fn debug_step_over(state: State<'_, DebugManager>) -> Result<(), String> {
    state.step_over().await
}

#[command]
pub async fn debug_step_into(state: State<'_, DebugManager>) -> Result<(), String> {
    state.step_into().await
}

#[command]
pub async fn debug_step_out(state: State<'_, DebugManager>) -> Result<(), String> {
    state.step_out().await
}

#[command]
pub async fn debug_pause(state: State<'_, DebugManager>) -> Result<(), String> {
    state.pause().await
}

#[command]
pub async fn debug_stop(state: State<'_, DebugManager>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[command]
pub async fn debug_stack_trace(state: State<'_, DebugManager>) -> Result<Vec<StackFrame>, String> {
    state.stack_trace().await
}

#[command]
pub async fn debug_variables(
    state: State<'_, DebugManager>,
    variables_reference: i64,
) -> Result<Vec<Variable>, String> {
    state.variables(variables_reference).await
}
