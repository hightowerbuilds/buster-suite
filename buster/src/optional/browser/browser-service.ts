import { invoke } from "@tauri-apps/api/core";

export interface LocalPort {
  port: number;
  url: string;
}

export const createBrowserView = (url: string, x: number, y: number, width: number, height: number) =>
  invoke<string>("create_browser_view", { url, x, y, width, height });

export const navigateBrowserView = (browserId: string, url: string) =>
  invoke<void>("navigate_browser_view", { browserId, url });

export const resizeBrowserView = (browserId: string, x: number, y: number, width: number, height: number) =>
  invoke<void>("resize_browser_view", { browserId, x, y, width, height });

export const showBrowserView = (browserId: string) =>
  invoke<void>("show_browser_view", { browserId });

export const hideBrowserView = (browserId: string) =>
  invoke<void>("hide_browser_view", { browserId });

export const closeBrowserView = (browserId: string) =>
  invoke<void>("close_browser_view", { browserId });

export const scanLocalPorts = () =>
  invoke<LocalPort[]>("scan_local_ports");
