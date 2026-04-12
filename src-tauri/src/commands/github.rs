use std::process::Command;
use tauri::command;

fn run_gh(workspace: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh error: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ── Structs ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhAuthStatus {
    pub logged_in: bool,
    pub username: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhOwner {
    pub login: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhDefaultBranch {
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhRepoInfo {
    pub name: String,
    pub owner: GhOwner,
    pub description: Option<String>,
    pub url: String,
    pub default_branch_ref: Option<GhDefaultBranch>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhAuthor {
    pub login: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPullRequest {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub author: GhAuthor,
    pub created_at: String,
    pub url: String,
    pub head_ref_name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPrFile {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhPullRequestDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub state: String,
    pub author: GhAuthor,
    pub created_at: String,
    pub url: String,
    pub head_ref_name: String,
    pub additions: u32,
    pub deletions: u32,
    pub files: Vec<GhPrFile>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GhLabel {
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhIssue {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub author: GhAuthor,
    pub created_at: String,
    pub url: String,
    pub labels: Vec<GhLabel>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhComment {
    pub author: GhAuthor,
    pub body: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhIssueDetail {
    pub number: u32,
    pub title: String,
    pub body: String,
    pub state: String,
    pub author: GhAuthor,
    pub created_at: String,
    pub url: String,
    pub labels: Vec<GhLabel>,
    pub comments: Vec<GhComment>,
}

// ── Commands ─────────────────────────────────────────────────────────

#[command]
pub fn gh_auth_status(workspace_root: String) -> Result<GhAuthStatus, String> {
    let output = Command::new("gh")
        .args(["auth", "status", "-h", "github.com"])
        .current_dir(&workspace_root)
        .output()
        .map_err(|e| format!("Failed to run gh: {}", e))?;

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    if combined.contains("Logged in to") {
        let username = combined
            .lines()
            .find(|l| l.contains("Logged in to"))
            .and_then(|l| l.split("account ").nth(1))
            .map(|s| s.split_whitespace().next().unwrap_or("unknown").to_string())
            .unwrap_or_else(|| "unknown".to_string());
        Ok(GhAuthStatus { logged_in: true, username })
    } else {
        Ok(GhAuthStatus { logged_in: false, username: String::new() })
    }
}

#[command]
pub fn gh_repo_info(workspace_root: String) -> Result<GhRepoInfo, String> {
    let raw = run_gh(&workspace_root, &[
        "repo", "view", "--json", "name,owner,description,url,defaultBranchRef",
    ])?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse gh output: {}", e))
}

#[command]
pub fn gh_pr_list(workspace_root: String, state: Option<String>, limit: Option<u32>) -> Result<Vec<GhPullRequest>, String> {
    let limit_str = limit.unwrap_or(20).to_string();
    let state_str = state.unwrap_or_else(|| "open".to_string());
    let raw = run_gh(&workspace_root, &[
        "pr", "list",
        "--state", &state_str,
        "--limit", &limit_str,
        "--json", "number,title,state,author,createdAt,url,headRefName",
    ])?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse gh output: {}", e))
}

#[command]
pub fn gh_pr_view(workspace_root: String, number: u32) -> Result<GhPullRequestDetail, String> {
    let num_str = number.to_string();
    let raw = run_gh(&workspace_root, &[
        "pr", "view", &num_str,
        "--json", "number,title,body,state,author,createdAt,url,headRefName,additions,deletions,files",
    ])?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse gh output: {}", e))
}

#[command]
pub fn gh_issue_list(workspace_root: String, state: Option<String>, limit: Option<u32>) -> Result<Vec<GhIssue>, String> {
    let limit_str = limit.unwrap_or(20).to_string();
    let state_str = state.unwrap_or_else(|| "open".to_string());
    let raw = run_gh(&workspace_root, &[
        "issue", "list",
        "--state", &state_str,
        "--limit", &limit_str,
        "--json", "number,title,state,author,createdAt,url,labels",
    ])?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse gh output: {}", e))
}

#[command]
pub fn gh_issue_view(workspace_root: String, number: u32) -> Result<GhIssueDetail, String> {
    let num_str = number.to_string();
    let raw = run_gh(&workspace_root, &[
        "issue", "view", &num_str,
        "--json", "number,title,body,state,author,createdAt,url,labels,comments",
    ])?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse gh output: {}", e))
}
