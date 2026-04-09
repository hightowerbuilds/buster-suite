import { listen } from "@tauri-apps/api/event";
import {
  extList,
  extLoad,
  extUnload,
  extGatewayConnect,
  extGatewaySend,
  extGatewayDisconnect,
  extCall,
  type ExtensionInfo,
  type GatewayEvent,
  type GatewayConfig,
} from "./ipc";
import { registry } from "./command-registry";

export type { ExtensionInfo, GatewayEvent, GatewayConfig };

type GatewayEventHandler = (event: GatewayEvent) => void;

const eventHandlers = new Map<string, GatewayEventHandler[]>();
let listening = false;

/** Start listening for gateway events from the backend. Call once at startup. */
export async function initExtensionHost(): Promise<void> {
  if (listening) return;
  listening = true;

  await listen<GatewayEvent>("gateway-event", (event) => {
    const gw = event.payload;
    // Dispatch to extension-specific handlers
    const handlers = eventHandlers.get(gw.extension_id) ?? [];
    for (const h of handlers) {
      h(gw);
    }
    // Dispatch to wildcard handlers
    const wildcardHandlers = eventHandlers.get("*") ?? [];
    for (const h of wildcardHandlers) {
      h(gw);
    }
  });
}

/** Subscribe to gateway events for a specific extension (or "*" for all). */
export function onGatewayEvent(
  extensionId: string,
  handler: GatewayEventHandler
): () => void {
  const handlers = eventHandlers.get(extensionId) ?? [];
  handlers.push(handler);
  eventHandlers.set(extensionId, handlers);

  // Return unsubscribe function
  return () => {
    const h = eventHandlers.get(extensionId);
    if (h) {
      const idx = h.indexOf(handler);
      if (idx >= 0) h.splice(idx, 1);
    }
  };
}

/** List all available extensions. */
export async function listExtensions(): Promise<ExtensionInfo[]> {
  return extList();
}

/** Load an extension by ID. Registers its commands in the command palette. */
export async function loadExtension(id: string): Promise<ExtensionInfo> {
  const info = await extLoad(id);
  // Register extension commands in the command palette
  for (const cmd of info.commands) {
    registry.register({
      id: cmd.id,
      label: cmd.label,
      category: info.name,
      execute: () => { extCall(id, cmd.id).catch(console.error); },
    });
  }
  return info;
}

/** Unload an extension. Unregisters its commands from the command palette. */
export async function unloadExtension(id: string): Promise<void> {
  // Unregister commands before unloading
  const exts = await extList();
  const ext = exts.find(e => e.id === id);
  if (ext) {
    for (const cmd of ext.commands) {
      registry.unregister(cmd.id);
    }
  }
  return extUnload(id);
}

/** Connect to an agent gateway through an extension. */
export async function connectGateway(
  extensionId: string,
  config: GatewayConfig
): Promise<number> {
  return extGatewayConnect(extensionId, config);
}

/** Send a message to a gateway connection. */
export async function sendToGateway(
  connectionId: number,
  message: string
): Promise<void> {
  return extGatewaySend(connectionId, message);
}

/** Disconnect a gateway connection. */
export async function disconnectGateway(
  connectionId: number
): Promise<void> {
  return extGatewayDisconnect(connectionId);
}

/** Call a method on a loaded extension. */
export async function callExtension(
  extensionId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<string> {
  return extCall(extensionId, method, params ? JSON.stringify(params) : undefined);
}
