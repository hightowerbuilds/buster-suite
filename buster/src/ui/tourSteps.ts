export interface TourStep {
  title: string;
  subtitle: string;
  hint: string;
  special?: "terminal" | "shortcuts" | "layouts" | "extensions" | "git" | "ai" | "blog";
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "BUSTER",
    subtitle: "a canvas-rendered ide built with tauri and rust",
    hint: "press enter to begin the tour",
  },
  {
    title: "WHY SOLID",
    subtitle: "no virtual dom. fine-grained reactivity. 7kb runtime.",
    hint: "signals update only what changed. nothing else rerenders.",
  },
  {
    title: "WHY TAURI",
    subtitle: "rust backend. native webview. 10mb app instead of 800mb.",
    hint: "tree-sitter parsing. native pty. all at native speed.",
  },
  {
    title: "WHY CANVAS",
    subtitle: "every character you see is drawn on a canvas element",
    hint: "PreText.js measures text 600x faster than the dom",
  },
  {
    title: ">_",
    subtitle: "a full terminal rendered entirely on canvas",
    hint: "vt100 parsing in rust. neovim. htop. tmux. all canvas.",
    special: "terminal",
  },
  {
    title: "GIT",
    subtitle: "",
    hint: "",
    special: "git",
  },
  {
    title: "AI AGENT",
    subtitle: "",
    hint: "",
    special: "ai",
  },
  {
    title: "EXTENSIONS",
    subtitle: "",
    hint: "",
    special: "extensions",
  },
  {
    title: "LAYOUTS",
    subtitle: "",
    hint: "drag the dividers to resize any panel",
    special: "layouts",
  },
  {
    title: "BLOG MODE",
    subtitle: "",
    hint: "",
    special: "blog",
  },
  {
    title: "KEYS",
    subtitle: "",
    hint: "",
    special: "shortcuts",
  },
  {
    title: "GO BUILD",
    subtitle: "you are ready. open a folder and start creating.",
    hint: "press enter to exit the tour",
  },
];
