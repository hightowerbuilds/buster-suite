import { Component, createSignal, For, Show } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { ghAuthStatus, ghRepoInfo, ghPrList, ghPrView, ghIssueList, ghIssueView } from "../lib/ipc";
import type { GhPullRequestDetail, GhIssueDetail } from "../lib/ipc";
import "../styles/github.css";

type GhView = "dashboard" | "cli";

interface GitHubPageProps {
  active: boolean;
  workspaceRoot?: string;
}

// ── CLI Reference Data ───────────────────────────────────────────────

interface CliCommandGroup {
  title: string;
  commands: { cmd: string; desc: string }[];
}

const CLI_GROUPS: CliCommandGroup[] = [
  {
    title: "Repository",
    commands: [
      { cmd: "gh repo view", desc: "View repository details" },
      { cmd: "gh repo clone <repo>", desc: "Clone a repository" },
      { cmd: "gh repo fork", desc: "Fork the current repository" },
      { cmd: "gh repo create <name>", desc: "Create a new repository" },
    ],
  },
  {
    title: "Pull Requests",
    commands: [
      { cmd: "gh pr list", desc: "List pull requests" },
      { cmd: "gh pr create", desc: "Create a pull request" },
      { cmd: "gh pr checkout <number>", desc: "Check out a PR branch locally" },
      { cmd: "gh pr merge <number>", desc: "Merge a pull request" },
      { cmd: "gh pr diff <number>", desc: "View PR diff" },
      { cmd: "gh pr review <number>", desc: "Add a review to a PR" },
      { cmd: "gh pr close <number>", desc: "Close a pull request" },
      { cmd: "gh pr reopen <number>", desc: "Reopen a pull request" },
      { cmd: "gh pr checks <number>", desc: "Show CI status for a PR" },
    ],
  },
  {
    title: "Issues",
    commands: [
      { cmd: "gh issue list", desc: "List issues" },
      { cmd: "gh issue create", desc: "Create an issue" },
      { cmd: "gh issue view <number>", desc: "View issue details" },
      { cmd: "gh issue close <number>", desc: "Close an issue" },
      { cmd: "gh issue reopen <number>", desc: "Reopen an issue" },
      { cmd: "gh issue comment <number>", desc: "Add a comment to an issue" },
    ],
  },
  {
    title: "Workflows / CI",
    commands: [
      { cmd: "gh run list", desc: "List recent workflow runs" },
      { cmd: "gh run view <id>", desc: "View a workflow run" },
      { cmd: "gh run watch <id>", desc: "Watch a run until it completes" },
      { cmd: "gh run rerun <id>", desc: "Re-run a failed workflow" },
    ],
  },
  {
    title: "Releases",
    commands: [
      { cmd: "gh release list", desc: "List releases" },
      { cmd: "gh release create <tag>", desc: "Create a release" },
      { cmd: "gh release view <tag>", desc: "View release details" },
      { cmd: "gh release delete <tag>", desc: "Delete a release" },
    ],
  },
  {
    title: "General",
    commands: [
      { cmd: "gh auth status", desc: "Check authentication status" },
      { cmd: "gh auth login", desc: "Log in to GitHub" },
      { cmd: "gh auth logout", desc: "Log out of GitHub" },
      { cmd: "gh api <endpoint>", desc: "Make an authenticated API request" },
      { cmd: "gh browse", desc: "Open the repo in a browser" },
      { cmd: "gh gist create <file>", desc: "Create a gist" },
    ],
  },
];

// ── Main Component ───────────────────────────────────────────────────

const GitHubPage: Component<GitHubPageProps> = (props) => {
  const [view, setView] = createSignal<GhView>("dashboard");

  return (
    <div class="gh-page" style={{ display: props.active ? "flex" : "none" }}>
      <div class="gh-page-tabs">
        <button
          class={`gh-page-tab ${view() === "dashboard" ? "gh-page-tab-active" : ""}`}
          onClick={() => setView("dashboard")}
        >
          Dashboard
        </button>
        <button
          class={`gh-page-tab ${view() === "cli" ? "gh-page-tab-active" : ""}`}
          onClick={() => setView("cli")}
        >
          CLI Reference
        </button>
      </div>
      <div class="gh-page-content">
        {view() === "dashboard" && (
          <GhDashboard workspaceRoot={props.workspaceRoot} />
        )}
        {view() === "cli" && (
          <GhCliReference />
        )}
      </div>
    </div>
  );
};

// ── Dashboard (repo info + PRs + Issues with detail drill-down) ──────

const GhDashboard: Component<{ workspaceRoot?: string }> = (props) => {
  // Detail drill-down state
  const [prDetail, setPrDetail] = createSignal<GhPullRequestDetail | null>(null);
  const [issueDetail, setIssueDetail] = createSignal<GhIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = createSignal(false);

  // Queries — each fires independently, UI populates progressively
  const authQuery = createQuery(() => ({
    queryKey: ["gh-auth", props.workspaceRoot],
    queryFn: () => ghAuthStatus(props.workspaceRoot!),
    enabled: !!props.workspaceRoot,
  }));

  const repoQuery = createQuery(() => ({
    queryKey: ["gh-repo", props.workspaceRoot],
    queryFn: () => ghRepoInfo(props.workspaceRoot!),
    enabled: !!props.workspaceRoot && !!authQuery.data?.logged_in,
  }));

  const prQuery = createQuery(() => ({
    queryKey: ["gh-prs", props.workspaceRoot],
    queryFn: () => ghPrList(props.workspaceRoot!, "open", 20),
    enabled: !!props.workspaceRoot && !!authQuery.data?.logged_in,
  }));

  const issueQuery = createQuery(() => ({
    queryKey: ["gh-issues", props.workspaceRoot],
    queryFn: () => ghIssueList(props.workspaceRoot!, "open", 20),
    enabled: !!props.workspaceRoot && !!authQuery.data?.logged_in,
  }));

  async function openPr(number: number) {
    const root = props.workspaceRoot;
    if (!root) return;
    setDetailLoading(true);
    try {
      const result = await ghPrView(root, number);
      setPrDetail(result);
    } catch {}
    setDetailLoading(false);
  }

  async function openIssue(number: number) {
    const root = props.workspaceRoot;
    if (!root) return;
    setDetailLoading(true);
    try {
      const result = await ghIssueView(root, number);
      setIssueDetail(result);
    } catch {}
    setDetailLoading(false);
  }

  return (
    <div class="gh-dashboard">
      {/* PR Detail view */}
      <Show when={prDetail()}>
        <div class="gh-detail">
          <button class="gh-back-btn" onClick={() => setPrDetail(null)}>&larr; Back</button>
          <div class="gh-detail-header">
            <span class="gh-detail-num">#{prDetail()!.number}</span>
            <span class="gh-detail-title">{prDetail()!.title}</span>
          </div>
          <div class="gh-detail-meta">
            {prDetail()!.author.login} &middot; {prDetail()!.state} &middot; {prDetail()!.headRefName}
          </div>
          <div class="gh-detail-stats">
            <span class="gh-stat-add">+{prDetail()!.additions}</span>
            <span class="gh-stat-del">-{prDetail()!.deletions}</span>
            <span class="gh-stat-files">{prDetail()!.files.length} files</span>
          </div>
          <Show when={prDetail()!.body}>
            <div class="gh-detail-body">{prDetail()!.body}</div>
          </Show>
          <Show when={prDetail()!.files.length > 0}>
            <div class="gh-section">
              <div class="gh-section-title">Files Changed</div>
              <For each={prDetail()!.files}>
                {(file) => (
                  <div class="gh-file-row">
                    <span class="gh-file-path">{file.path}</span>
                    <span class="gh-stat-add">+{file.additions}</span>
                    <span class="gh-stat-del">-{file.deletions}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* Issue Detail view */}
      <Show when={issueDetail() && !prDetail()}>
        <div class="gh-detail">
          <button class="gh-back-btn" onClick={() => setIssueDetail(null)}>&larr; Back</button>
          <div class="gh-detail-header">
            <span class="gh-detail-num">#{issueDetail()!.number}</span>
            <span class="gh-detail-title">{issueDetail()!.title}</span>
          </div>
          <div class="gh-detail-meta">
            {issueDetail()!.author.login} &middot; {issueDetail()!.state}
            <Show when={issueDetail()!.labels.length > 0}>
              {" "}&middot;{" "}
              <For each={issueDetail()!.labels}>
                {(label) => <span class="gh-label">{label.name}</span>}
              </For>
            </Show>
          </div>
          <Show when={issueDetail()!.body}>
            <div class="gh-detail-body">{issueDetail()!.body}</div>
          </Show>
          <Show when={issueDetail()!.comments.length > 0}>
            <div class="gh-section">
              <div class="gh-section-title">Comments ({issueDetail()!.comments.length})</div>
              <For each={issueDetail()!.comments}>
                {(comment) => (
                  <div class="gh-comment">
                    <div class="gh-comment-header">
                      <span class="gh-accent">{comment.author.login}</span>
                      <span class="gh-comment-date">{comment.createdAt}</span>
                    </div>
                    <div class="gh-comment-body">{comment.body}</div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* Main dashboard list */}
      <Show when={!prDetail() && !issueDetail()}>
        <Show when={detailLoading()}>
          <div class="gh-loading">Loading...</div>
        </Show>

        <Show when={!props.workspaceRoot}>
          <div class="gh-error">No workspace open</div>
        </Show>

        <Show when={authQuery.isLoading}>
          <div class="gh-loading">Checking authentication...</div>
        </Show>

        <Show when={authQuery.isError}>
          <div class="gh-error">gh CLI not available. Install it from cli.github.com</div>
        </Show>

        <Show when={authQuery.data && !authQuery.data.logged_in}>
          <div class="gh-error">Not logged in. Run: gh auth login</div>
        </Show>

        <Show when={authQuery.data?.logged_in}>
          <div class="gh-auth-info">
            Logged in as <span class="gh-accent">{authQuery.data!.username}</span>
          </div>
        </Show>

        <Show when={repoQuery.data}>
          <div class="gh-section">
            <div class="gh-section-title">Repository</div>
            <div class="gh-repo-card">
              <div class="gh-repo-name">{repoQuery.data!.owner.login}/{repoQuery.data!.name}</div>
              <Show when={repoQuery.data!.description}>
                <div class="gh-repo-desc">{repoQuery.data!.description}</div>
              </Show>
              <Show when={repoQuery.data!.defaultBranchRef}>
                <div class="gh-repo-branch">Default branch: <span class="gh-accent">{repoQuery.data!.defaultBranchRef!.name}</span></div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="gh-section">
          <div class="gh-section-title">Pull Requests</div>
          <Show when={prQuery.isLoading}>
            <div class="gh-loading">Loading PRs...</div>
          </Show>
          <Show when={prQuery.data && prQuery.data.length > 0}>
            <For each={prQuery.data!}>
              {(pr) => (
                <div class="gh-list-row gh-list-clickable" onClick={() => openPr(pr.number)}>
                  <span class="gh-list-num">#{pr.number}</span>
                  <span class="gh-list-title">{pr.title}</span>
                  <span class="gh-list-meta">{pr.author.login} &middot; {pr.headRefName}</span>
                </div>
              )}
            </For>
          </Show>
          <Show when={prQuery.data && prQuery.data.length === 0}>
            <div class="gh-empty">No open pull requests</div>
          </Show>
        </div>

        <div class="gh-section">
          <div class="gh-section-title">Issues</div>
          <Show when={issueQuery.isLoading}>
            <div class="gh-loading">Loading issues...</div>
          </Show>
          <Show when={issueQuery.data && issueQuery.data.length > 0}>
            <For each={issueQuery.data!}>
              {(issue) => (
                <div class="gh-list-row gh-list-clickable" onClick={() => openIssue(issue.number)}>
                  <span class="gh-list-num">#{issue.number}</span>
                  <span class="gh-list-title">{issue.title}</span>
                  <span class="gh-list-meta">
                    {issue.author.login}
                    <Show when={issue.labels.length > 0}>
                      {" "}&middot;{" "}
                      <For each={issue.labels}>
                        {(label) => <span class="gh-label">{label.name}</span>}
                      </For>
                    </Show>
                  </span>
                </div>
              )}
            </For>
          </Show>
          <Show when={issueQuery.data && issueQuery.data.length === 0}>
            <div class="gh-empty">No open issues</div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// ── CLI Reference ────────────────────────────────────────────────────

const GhCliReference: Component = () => {
  const [search, setSearch] = createSignal("");
  const [copied, setCopied] = createSignal<string | null>(null);

  function copyCmd(cmd: string) {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(cmd);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  const filteredGroups = () => {
    const q = search().toLowerCase();
    if (!q) return CLI_GROUPS;
    return CLI_GROUPS
      .map((g) => ({
        ...g,
        commands: g.commands.filter(
          (c) => c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.commands.length > 0);
  };

  return (
    <div class="gh-cli">
      <div class="gh-cli-search-wrap">
        <input
          class="gh-cli-search"
          type="text"
          placeholder="Search commands..."
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>
      <div class="gh-cli-body">
        <For each={filteredGroups()}>
          {(group) => (
            <div class="gh-cli-group">
              <div class="gh-cli-group-title">{group.title}</div>
              <div class="gh-cli-list">
                <For each={group.commands}>
                  {(entry) => (
                    <div class="gh-cli-row">
                      <span class="gh-cli-cmd">{entry.cmd}</span>
                      <span class="gh-cli-desc">{entry.desc}</span>
                      <button
                        class="gh-cli-copy"
                        onClick={() => copyCmd(entry.cmd)}
                      >
                        {copied() === entry.cmd ? "Copied" : "Copy"}
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
        <Show when={filteredGroups().length === 0}>
          <div class="gh-empty">No matching commands</div>
        </Show>
      </div>
    </div>
  );
};

export default GitHubPage;
