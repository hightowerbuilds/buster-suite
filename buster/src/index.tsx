/* @refresh reload */
import { render } from "solid-js/web";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { HotkeysProvider } from "@tanstack/solid-hotkeys";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/unifrakturmaguntia/400.css";
import App from "./App";
import BusterProvider from "./lib/BusterProvider";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: false,
    },
  },
});

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true } }}>
        <BusterProvider>
          <App />
        </BusterProvider>
      </HotkeysProvider>
    </QueryClientProvider>
  ),
  document.getElementById("root") as HTMLElement
);
