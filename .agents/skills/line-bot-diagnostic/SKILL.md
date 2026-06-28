---
name: line-bot-diagnostic
description: >-
  Diagnoses silent failures in the LINE Bot system by verifying Security Whitelists, API Keys (Config.js), and Error Handling mappings. Use when the user reports that the bot is unresponsive or ignoring messages.
---

# LINE Bot Diagnostic Skill

## Overview
This skill investigates reasons why the Google Apps Script (GAS) LINE bot might be ignoring messages or failing silently. It applies the lessons learned from previous outages where strict group filtering or missing fallback API keys caused complete systemic silence.

## Dependencies
None. This relies on the agent's code reading tools.

## Quick Start
When the user says "the bot is not responding" or "บอทไม่ทำงาน", invoke this skill to run the diagnostic checklist.

## Workflow

### 1. Check Security Whitelists (`0_Security.js` or similar)
- **Goal:** Verify that the bot is not locking itself out due to an empty whitelist.
- **Action:** Read the `isAllowedGroup` or equivalent security functions.
- **Rule:** If the whitelist property is empty or undefined, the system MUST default to allowing access (or at least allowing admin access). It should never return `false` outright for everyone when unconfigured.

### 2. Check API Key Fallbacks (`Config.js`)
- **Goal:** Ensure the bot can function even if `PropertiesService` fails or loses its data.
- **Action:** Read the configuration file where `CHANNEL_ACCESS_TOKEN` is defined.
- **Rule:** There must be a hardcoded fallback value for critical API keys in the source code if `PropertiesService.getScriptProperties().getProperty()` returns null. 

### 3. Check Error Handling and Catch Blocks
- **Goal:** Ensure errors are logged and not swallowed silently.
- **Action:** Check the main `doPost()` webhook function.
- **Rule:** The `try-catch` block MUST record the error (e.g., via `logAuditTrail` or `CloudLoggingService`) and attempt to send a fallback reply to the user if possible.

### 4. Code Synchronization Status
- **Goal:** Verify that the code running on GAS matches the local code.
- **Action:** Remind the user that Webhook relies on the *Deployed Version*, not the *HEAD*. If changes were made via `clasp push` or Rollback commands, the user MUST manually deploy a new version for the Webhook to reflect those changes.

## Common Mistakes
1. Assuming `PropertiesService` is permanent. (Properties can be accidentally cleared during logic rollbacks).
2. Forgetting that `clasp push` only updates HEAD, which does not affect the active Webhook deployment.
3. Using strict security whitelists that block all messages (including admin commands) when the list is accidentally emptied.
