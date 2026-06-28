---
name: รวมฟังชั้น
description: >-
  Scans a Google Apps Script project for duplicate functions across all files, identifies conflicts, safely merges them into a Single Source of Truth (SSOT), and enforces standard .js file extensions.
---

# รวมฟังชั้น (Merge Functions)

## Overview
Google Apps Script (GAS) projects often grow to include multiple files with duplicated helper functions (e.g., `logAuditTrail`, `getConfig`). This skill automates the detection of duplicated function signatures across the entire project, allows the agent to merge them into a single file to eliminate redundancy, and ensures that no `.gs` files exist alongside `.js` files in the local environment.

## Dependencies
None.

## Quick Start
"Please scan my GAS project for duplicated functions and merge them into one."

## Workflow

### 1. Scan for Duplicate Functions
- Use a Python script via the `run_command` tool to parse all `.js` files for function definitions.
- Example Python snippet:
  ```python
  import os, re, collections
  funcs = collections.defaultdict(list)
  for f in os.listdir('.'):
      if f.endswith('.js'):
          with open(f, 'r', encoding='utf-8') as file:
              matches = re.findall(r'function\s+([a-zA-Z0-9_]+)\s*\(', file.read())
              for m in matches: funcs[m].append(f)
  print({k: v for k, v in funcs.items() if len(v) > 1})
  ```

### 2. Analyze Differences and Signatures
- Check the parameters and the body of the duplicated functions. 
- If their signatures (parameters) differ, identify which signature is most commonly used in caller files across the project.

### 3. Create Implementation Plan
- Propose an `implementation_plan.md` to the user outlining:
  - Which file will host the Single Source of Truth (SSOT) version of the function.
  - Which files will have the duplicate definitions deleted.
  - Any parameter adaptations required to not break existing calls.

### 4. Apply Changes
- Safely remove the duplicated functions using surgical Python scripts or `multi_replace_file_content`.
- Rewrite the SSOT function to accommodate the logic of all calls.

### 5. Standardize File Extensions
- Ensure all local GAS scripts use `.js`. 
- Rename any `.gs` to `.js` and delete duplicate filenames.
- Run `clasp push -f` to verify syntax.

## Common Mistakes
- **Deleting the version with bug fixes**: Sometimes older files have the original function while a newer file has a patched version (e.g. Deadlock fixes). Ensure the *logic* of the patched version is preserved.
- **Breaking existing calls**: If function parameters are merged, you must ensure that callers passing 5 parameters still work if the new function expects 7.
