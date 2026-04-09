# Extension Idea: Master Password Vault

## Summary

A Buster extension that upgrades the built-in secrets storage from machine-derived encryption to user-password-derived encryption via PBKDF2 or Argon2.

## How It Works

- User sets a master password on first use
- Encryption key derived from that password using Argon2id (memory-hard, resistant to GPU/ASIC attacks) or PBKDF2-HMAC-SHA256 as a fallback
- All API keys and secrets encrypted with AES-256-GCM using the derived key
- User enters the master password once per session (cached in memory, never written to disk)
- Optional auto-lock after configurable idle timeout

## Why an Extension

The default Buster secrets storage uses a machine-derived key (zero friction, good enough for most users). This extension is for users who want stronger guarantees — the secrets file is unreadable without the password, even to someone with full disk access and knowledge of the derivation scheme.

## Capabilities Needed

- `workspace_write` — to read/write the encrypted vault file
- `notifications` — to prompt for master password on session start

## Prior Art

- 1Password, KeePass, Bitwarden — all use master password + KDF
- VS Code with the "Secret Storage" extension API
- Git credential helpers with encrypted stores
