import { Component, createMemo } from "solid-js";
import { marked } from "marked";
import { useBuster } from "../lib/buster-context";
import { resolveBlogTokens } from "../lib/blog-themes";

interface BlogPreviewProps {
  text: string;
  fontSize: number;
  theme?: string;
}

const BlogPreview: Component<BlogPreviewProps> = (props) => {
  const { store } = useBuster();
  const html = createMemo(() => {
    try {
      return marked.parse(props.text, { async: false }) as string;
    } catch {
      return `<p>${props.text}</p>`;
    }
  });

  const vars = createMemo(() => {
    const blogTheme = props.theme || "normal";
    const themeMode = store.settings.theme_mode || "dark";
    return resolveBlogTokens(blogTheme, themeMode, store.palette);
  });

  return (
    <div
      class="blog-preview"
      style={{
        ...vars(),
        "font-size": `${props.fontSize}px`,
      }}
      innerHTML={html()}
    />
  );
};

export default BlogPreview;
