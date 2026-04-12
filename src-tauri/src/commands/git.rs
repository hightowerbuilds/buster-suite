use std::collections::HashMap;
use std::process::Command;
use tauri::command;

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,      // "M", "A", "D", "??", "R", "MM", etc.
    pub staged: bool,
    pub conflicted: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConflictRegion {
    pub ours: String,
    pub theirs: String,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitStatusResult {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
}

/// Parse `git status --porcelain -u` output into structured file statuses.
fn parse_porcelain_status(raw: &str) -> Vec<GitFileStatus> {
    let mut files = Vec::new();
    for line in raw.lines() {
        if line.len() < 4 {
            continue;
        }
        let index_status = line.chars().nth(0).unwrap_or(' ');
        let work_status = line.chars().nth(1).unwrap_or(' ');
        let path = line[3..].to_string();

        let conflicted = matches!(
            (index_status, work_status),
            ('U', 'U') | ('A', 'A') | ('D', 'D') |
            ('U', 'A') | ('A', 'U') | ('U', 'D') | ('D', 'U')
        );

        let (status, staged) = if conflicted {
            (format!("{}{}", index_status, work_status), false)
        } else {
            match (index_status, work_status) {
                ('?', '?') => ("??".to_string(), false),
                ('A', ' ') => ("A".to_string(), true),
                ('M', ' ') => ("M".to_string(), true),
                ('D', ' ') => ("D".to_string(), true),
                ('R', ' ') => ("R".to_string(), true),
                (' ', 'M') => ("M".to_string(), false),
                (' ', 'D') => ("D".to_string(), false),
                ('M', 'M') => ("M".to_string(), false),
                ('A', 'M') => ("M".to_string(), false),
                _ => {
                    let s = format!("{}{}", index_status, work_status).trim().to_string();
                    let is_staged = index_status != ' ' && index_status != '?';
                    (s, is_staged)
                }
            }
        };

        files.push(GitFileStatus { path, status, staged, conflicted });
    }
    files
}

fn run_git(workspace: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(workspace)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git error: {}", stderr.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[command]
pub fn git_status(workspace_root: String) -> Result<GitStatusResult, String> {
    // Get branch name
    let branch = run_git(&workspace_root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .unwrap_or_else(|_| "HEAD".to_string())
        .trim()
        .to_string();

    // Get file statuses
    let raw = run_git(&workspace_root, &["status", "--porcelain", "-u"])?;
    let files = parse_porcelain_status(&raw);

    Ok(GitStatusResult { branch, files })
}

#[command]
pub fn git_branch(workspace_root: String) -> Result<String, String> {
    let branch = run_git(&workspace_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    Ok(branch.trim().to_string())
}

#[command]
pub fn git_stage(workspace_root: String, path: String) -> Result<(), String> {
    run_git(&workspace_root, &["add", "--", &path])?;
    Ok(())
}

#[command]
pub fn git_unstage(workspace_root: String, path: String) -> Result<(), String> {
    run_git(&workspace_root, &["restore", "--staged", "--", &path])?;
    Ok(())
}

#[command]
pub fn git_commit(workspace_root: String, message: String) -> Result<String, String> {
    let output = run_git(&workspace_root, &["commit", "-m", &message])?;
    Ok(output.trim().to_string())
}

// ── Push / Pull / Fetch ──────────────────────────────────────────────

#[command]
pub fn git_push(workspace_root: String, remote: Option<String>, branch: Option<String>, force: Option<bool>) -> Result<String, String> {
    let mut args = vec!["push"];
    if force.unwrap_or(false) { args.push("--force-with-lease"); }
    let r = remote.unwrap_or_else(|| "origin".into());
    args.push(&r);
    if let Some(ref b) = branch { args.push(b); }
    let output = run_git(&workspace_root, &args)?;
    Ok(output.trim().to_string())
}

#[command]
pub fn git_pull(workspace_root: String, remote: Option<String>, branch: Option<String>, rebase: Option<bool>) -> Result<String, String> {
    let mut args = vec!["pull"];
    if rebase.unwrap_or(false) { args.push("--rebase"); }
    let r = remote.unwrap_or_else(|| "origin".into());
    args.push(&r);
    if let Some(ref b) = branch { args.push(b); }
    let output = run_git(&workspace_root, &args)?;
    Ok(output.trim().to_string())
}

#[command]
pub fn git_fetch(workspace_root: String, remote: Option<String>, prune: Option<bool>) -> Result<String, String> {
    let mut args = vec!["fetch"];
    if prune.unwrap_or(false) { args.push("--prune"); }
    match &remote {
        Some(r) => args.push(r),
        None => args.push("--all"),
    }
    let output = run_git(&workspace_root, &args)?;
    Ok(output.trim().to_string())
}

#[command]
pub fn git_ahead_behind(workspace_root: String) -> Result<(i32, i32), String> {
    let output = run_git(&workspace_root, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
    match output {
        Ok(raw) => {
            let parts: Vec<&str> = raw.trim().split_whitespace().collect();
            if parts.len() == 2 {
                let ahead = parts[0].parse::<i32>().unwrap_or(0);
                let behind = parts[1].parse::<i32>().unwrap_or(0);
                Ok((ahead, behind))
            } else {
                Ok((0, 0))
            }
        }
        Err(_) => Ok((0, 0)), // No upstream configured
    }
}

// ── Branch operations ────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitBranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub tracking: Option<String>,
}

#[command]
pub fn git_branch_list(workspace_root: String) -> Result<Vec<GitBranchInfo>, String> {
    let raw = run_git(&workspace_root, &["branch", "-a", "--format=%(refname:short)|%(HEAD)|%(upstream:short)"])?;
    let mut branches = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(3, '|').collect();
        if parts.is_empty() { continue; }
        let name = parts[0].to_string();
        let is_current = parts.get(1).map(|s| s.trim() == "*").unwrap_or(false);
        let tracking = parts.get(2).and_then(|s| {
            let t = s.trim().to_string();
            if t.is_empty() { None } else { Some(t) }
        });
        let is_remote = name.contains('/');
        branches.push(GitBranchInfo { name, is_current, is_remote, tracking });
    }
    Ok(branches)
}

#[command]
pub fn git_branch_create(workspace_root: String, name: String, start_point: Option<String>) -> Result<(), String> {
    let mut args = vec!["checkout", "-b"];
    args.push(&name);
    if let Some(ref sp) = start_point { args.push(sp); }
    run_git(&workspace_root, &args)?;
    Ok(())
}

#[command]
pub fn git_branch_switch(workspace_root: String, name: String) -> Result<(), String> {
    run_git(&workspace_root, &["checkout", &name])?;
    Ok(())
}

#[command]
pub fn git_branch_delete(workspace_root: String, name: String, force: Option<bool>) -> Result<(), String> {
    let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
    run_git(&workspace_root, &["branch", flag, &name])?;
    Ok(())
}

// ── Stash operations ─────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitStashEntry {
    pub index: u32,
    pub message: String,
    pub date: String,
}

#[command]
pub fn git_stash_save(workspace_root: String, message: Option<String>, include_untracked: Option<bool>) -> Result<String, String> {
    let mut args = vec!["stash", "push"];
    if include_untracked.unwrap_or(false) { args.push("-u"); }
    if let Some(ref m) = message { args.push("-m"); args.push(m); }
    let output = run_git(&workspace_root, &args)?;
    Ok(output.trim().to_string())
}

#[command]
pub fn git_stash_pop(workspace_root: String, index: Option<u32>) -> Result<String, String> {
    let stash_ref = index.map(|i| format!("stash@{{{}}}", i));
    let mut args = vec!["stash", "pop"];
    if let Some(ref r) = stash_ref { args.push(r); }
    let output = run_git(&workspace_root, &args)?;
    Ok(output.trim().to_string())
}

#[command]
pub fn git_stash_list(workspace_root: String) -> Result<Vec<GitStashEntry>, String> {
    let raw = run_git(&workspace_root, &["stash", "list", "--format=%gd|%gs|%ar"]);
    match raw {
        Ok(output) => {
            let mut entries = Vec::new();
            for line in output.lines() {
                let parts: Vec<&str> = line.splitn(3, '|').collect();
                if parts.len() < 3 { continue; }
                let idx_str = parts[0].trim_start_matches("stash@{").trim_end_matches('}');
                let index = idx_str.parse::<u32>().unwrap_or(0);
                entries.push(GitStashEntry {
                    index,
                    message: parts[1].to_string(),
                    date: parts[2].to_string(),
                });
            }
            Ok(entries)
        }
        Err(_) => Ok(Vec::new()), // No stashes
    }
}

#[command]
pub fn git_stash_drop(workspace_root: String, index: u32) -> Result<(), String> {
    let stash_ref = format!("stash@{{{}}}", index);
    run_git(&workspace_root, &["stash", "drop", &stash_ref])?;
    Ok(())
}

// ── Commit amend ─────────────────────────────────────────────────────

#[command]
pub fn git_commit_amend(workspace_root: String, message: Option<String>) -> Result<String, String> {
    let output = match message {
        Some(ref m) => run_git(&workspace_root, &["commit", "--amend", "-m", m])?,
        None => run_git(&workspace_root, &["commit", "--amend", "--no-edit"])?,
    };
    Ok(output.trim().to_string())
}

// ── Existing commands ────────────────────────────────────────────────

#[command]
pub fn git_diff_file(workspace_root: String, path: String) -> Result<String, String> {
    // Returns unified diff for a file (working tree vs HEAD)
    let diff = run_git(&workspace_root, &["diff", "--", &path])
        .unwrap_or_default();
    Ok(diff)
}

#[command]
pub fn git_diff_staged(workspace_root: String, path: String) -> Result<String, String> {
    let diff = run_git(&workspace_root, &["diff", "--cached", "--", &path])
        .unwrap_or_default();
    Ok(diff)
}

#[command]
pub fn git_show_file(workspace_root: String, path: String) -> Result<String, String> {
    // Get the HEAD version of a file
    let ref_path = format!("HEAD:{}", path);
    let content = run_git(&workspace_root, &["show", &ref_path])
        .unwrap_or_default();
    Ok(content)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitCommitNode {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: String,
    pub refs: Vec<String>,      // branch/tag names
    pub parents: Vec<String>,   // parent hashes
    pub is_merge: bool,
}

#[command]
pub fn git_log_graph(workspace_root: String, count: Option<u32>) -> Result<Vec<GitCommitNode>, String> {
    let limit = count.unwrap_or(80).to_string();
    // Use a structured format we can parse reliably
    let raw = run_git(&workspace_root, &[
        "log",
        "--all",
        &format!("-{}", limit),
        "--format=%H|%h|%s|%an|%ar|%D|%P",
    ])?;

    let mut commits = Vec::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.splitn(7, '|').collect();
        if parts.len() < 7 { continue; }

        let refs: Vec<String> = parts[5]
            .split(", ")
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect();

        let parents: Vec<String> = parts[6]
            .split(' ')
            .filter(|s| !s.is_empty())
            .map(|s| s[..7.min(s.len())].to_string())
            .collect();

        commits.push(GitCommitNode {
            hash: parts[0].to_string(),
            short_hash: parts[1].to_string(),
            message: parts[2].to_string(),
            author: parts[3].to_string(),
            date: parts[4].to_string(),
            is_merge: parents.len() > 1,
            refs,
            parents,
        });
    }

    Ok(commits)
}

#[command]
pub fn git_is_repo(workspace_root: String) -> Result<bool, String> {
    match run_git(&workspace_root, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(out) => Ok(out.trim() == "true"),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_untracked_file() {
        let raw = "?? new_file.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "new_file.txt");
        assert_eq!(files[0].status, "??");
        assert!(!files[0].staged);
    }

    #[test]
    fn parses_staged_added_file() {
        let raw = "A  added.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "A");
        assert!(files[0].staged);
    }

    #[test]
    fn parses_staged_modified_file() {
        let raw = "M  modified.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "M");
        assert!(files[0].staged);
    }

    #[test]
    fn parses_unstaged_modified_file() {
        let raw = " M unstaged.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "M");
        assert!(!files[0].staged);
    }

    #[test]
    fn parses_staged_deleted_file() {
        let raw = "D  deleted.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "D");
        assert!(files[0].staged);
    }

    #[test]
    fn parses_modified_in_both() {
        let raw = "MM both.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].status, "M");
        assert!(!files[0].staged);
    }

    #[test]
    fn parses_multiple_files() {
        let raw = "?? untracked.txt\nM  staged.txt\n M modified.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].status, "??");
        assert_eq!(files[1].status, "M");
        assert!(files[1].staged);
        assert_eq!(files[2].status, "M");
        assert!(!files[2].staged);
    }

    #[test]
    fn skips_short_lines() {
        let raw = "ok\n?? real.txt\n";
        let files = parse_porcelain_status(raw);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "real.txt");
    }

    #[test]
    fn empty_input_returns_empty() {
        let files = parse_porcelain_status("");
        assert_eq!(files.len(), 0);
    }
}

#[command]
pub fn git_conflict_markers(workspace_root: String, file_path: String) -> Result<Vec<ConflictRegion>, String> {
    let full_path = std::path::Path::new(&workspace_root).join(&file_path);
    let content = std::fs::read_to_string(&full_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut regions = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        if lines[i].starts_with("<<<<<<<") {
            let start_line = i + 1; // 1-based
            let mut ours_lines = Vec::new();
            let mut theirs_lines = Vec::new();
            let mut found_separator = false;
            let mut end_line = start_line;
            i += 1;

            while i < lines.len() {
                if lines[i].starts_with("=======") {
                    found_separator = true;
                    i += 1;
                    continue;
                }
                if lines[i].starts_with(">>>>>>>") {
                    end_line = i + 1; // 1-based
                    break;
                }
                if found_separator {
                    theirs_lines.push(lines[i]);
                } else {
                    ours_lines.push(lines[i]);
                }
                i += 1;
            }

            if found_separator && end_line > start_line {
                regions.push(ConflictRegion {
                    ours: ours_lines.join("\n"),
                    theirs: theirs_lines.join("\n"),
                    start_line,
                    end_line,
                });
            }
        }
        i += 1;
    }

    Ok(regions)
}

#[command]
pub fn git_resolve_conflict(workspace_root: String, file_path: String, resolved_content: String) -> Result<(), String> {
    let full_path = std::path::Path::new(&workspace_root).join(&file_path);
    std::fs::write(&full_path, &resolved_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    run_git(&workspace_root, &["add", "--", &file_path])?;
    Ok(())
}

// ── Remote management ─────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitRemote {
    pub name: String,
    pub url: String,
}

#[command]
pub fn git_remote_list(workspace_root: String) -> Result<Vec<GitRemote>, String> {
    let raw = run_git(&workspace_root, &["remote", "-v"])?;
    let mut seen = HashMap::new();
    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            seen.entry(parts[0].to_string())
                .or_insert_with(|| parts[1].to_string());
        }
    }
    Ok(seen.into_iter().map(|(name, url)| GitRemote { name, url }).collect())
}

#[command]
pub fn git_remote_add(workspace_root: String, name: String, url: String) -> Result<(), String> {
    run_git(&workspace_root, &["remote", "add", &name, &url])?;
    Ok(())
}

#[command]
pub fn git_remote_remove(workspace_root: String, name: String) -> Result<(), String> {
    run_git(&workspace_root, &["remote", "remove", &name])?;
    Ok(())
}

#[command]
pub fn git_remote_rename(workspace_root: String, old_name: String, new_name: String) -> Result<(), String> {
    run_git(&workspace_root, &["remote", "rename", &old_name, &new_name])?;
    Ok(())
}

#[command]
pub fn git_remote_set_url(workspace_root: String, name: String, url: String) -> Result<(), String> {
    run_git(&workspace_root, &["remote", "set-url", &name, &url])?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffHunk {
    pub start_line: u32,
    pub line_count: u32,
    pub kind: String, // "add", "modify", "delete"
}

#[command]
pub fn git_diff_hunks(workspace_root: String, path: String) -> Result<Vec<DiffHunk>, String> {
    let raw = run_git(&workspace_root, &["diff", "--unified=0", "HEAD", "--", &path])
        .unwrap_or_default();

    let mut hunks = Vec::new();
    for line in raw.lines() {
        if !line.starts_with("@@") {
            continue;
        }
        // Parse @@ -old_start[,old_count] +new_start[,new_count] @@
        let parts: Vec<&str> = line.splitn(4, ' ').collect();
        if parts.len() < 3 {
            continue;
        }

        let old_part = parts[1].trim_start_matches('-');
        let new_part = parts[2].trim_start_matches('+');

        let old_count = parse_hunk_range(old_part).1;
        let (new_start, new_count) = parse_hunk_range(new_part);

        let kind = if old_count == 0 && new_count > 0 {
            "add"
        } else if old_count > 0 && new_count == 0 {
            "delete"
        } else {
            "modify"
        };

        hunks.push(DiffHunk {
            start_line: new_start,
            line_count: new_count,
            kind: kind.to_string(),
        });
    }

    Ok(hunks)
}

fn parse_hunk_range(s: &str) -> (u32, u32) {
    if let Some(comma) = s.find(',') {
        let start = s[..comma].parse::<u32>().unwrap_or(0);
        let count = s[comma + 1..].parse::<u32>().unwrap_or(0);
        (start, count)
    } else {
        let start = s.parse::<u32>().unwrap_or(0);
        (start, 1)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitBlameLine {
    pub hash: String,
    pub author: String,
    pub timestamp: i64,
    pub line: usize,
}

#[command]
pub fn git_blame(workspace_root: String, path: String) -> Result<Vec<GitBlameLine>, String> {
    let raw = run_git(&workspace_root, &["blame", "--porcelain", &path])?;
    let mut result: Vec<GitBlameLine> = Vec::new();

    // Cache commit metadata — porcelain only emits author/author-time on the
    // FIRST occurrence of each commit hash. Subsequent lines reuse the hash
    // with a short header (no metadata lines). Without this cache, repeated
    // commits would inherit stale author/timestamp from the previous entry.
    let mut commit_cache: HashMap<String, (String, i64)> = HashMap::new();

    let mut current_hash = String::new();
    let mut current_final_line: usize = 0;
    let mut current_author = String::new();
    let mut current_timestamp: i64 = 0;

    for line in raw.lines() {
        if line.starts_with('\t') {
            // Content line marks the end of an entry.
            // If we didn't see author/author-time lines (repeated commit),
            // look up from the cache.
            if let Some((cached_author, cached_ts)) = commit_cache.get(&current_hash) {
                if current_author.is_empty() {
                    current_author = cached_author.clone();
                    current_timestamp = *cached_ts;
                }
            }
            // Store in cache for future lookups
            if !current_author.is_empty() {
                commit_cache.entry(current_hash.clone())
                    .or_insert_with(|| (current_author.clone(), current_timestamp));
            }

            result.push(GitBlameLine {
                hash: current_hash.clone(),
                author: current_author.clone(),
                timestamp: current_timestamp,
                line: current_final_line,
            });
            // Reset per-entry state for next block
            current_author = String::new();
            current_timestamp = 0;
        } else if line.starts_with("author ") {
            current_author = line[7..].to_string();
        } else if line.starts_with("author-time ") {
            current_timestamp = line[12..].parse::<i64>().unwrap_or(0);
        } else {
            // Commit header: <40-char-hash> <orig> <final> [<count>]
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[0].len() == 40 && parts[0].chars().all(|c| c.is_ascii_hexdigit()) {
                current_hash = parts[0].to_string();
                current_final_line = parts[2].parse::<usize>().unwrap_or(1);
            }
        }
    }

    Ok(result)
}
