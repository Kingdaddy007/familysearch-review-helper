# FamilySearch Full Name Review Helper (Stage 1)

Local Manifest V3 Chrome Extension scoped to FamilySearch Full Name Review (`familysearch.org/en/getinvolved/full-name-review`). Zero cloud services, zero API keys, and zero external network calls.

## Install Steps (Chrome)

1. Open Chrome and go to `chrome://extensions`.
2. Turn **Developer mode** ON (top-right toggle).
3. Click **Load unpacked**.
4. Select this folder:
   `C:\Users\Oviks\.gemini\antigravity\scratch\fs-review-stage1`
5. Open a FamilySearch **Full Name Review** page. A compact **FS Helper** bar appears in the bottom-left corner.

## Keyboard Shortcuts

Shortcuts only fire when the matching FamilySearch control is visible and enabled on a recognized step, and are ignored when **Paused**, holding a key down (`repeat`), typing in any input/text field, or when a modal/dialog is open.

| Key | Action | Recognized Step(s) |
| --- | --- | --- |
| `Y` | Click **Yes** | Step 1 of 4 |
| `N` | Click **No** | Step 1 of 4 |
| `U` | Click **Unsure** | Step 1 of 4 |
| `H` | Click **New Highlight** | Step 2 of 4 |
| `A` | Click **Attach** | Step 2 of 4 |
| `D` | Click **Detach** | Step 2 of 4 |
| `Enter` | Click **Next** or **Done** | Step 1–4 (works right after editing `Given Name` / `Surname` boxes too) |

- **Editing name boxes:** Letter shortcuts (`Y`, `N`, `U`, `H`, `A`) are paused while typing inside `Given Name` / `Surname` fields, while **`Enter`** commits the field and clicks **Next** (or **Done** on the final step) without clicking outside first.
- **Auto-Attach:** Optional and **OFF by default**. It only auto-clicks **Attach** when a ready-made word box is explicitly distinguishable from an active user draw/resize. On unverified live DOM states, Auto-Attach refuses to click blindly and prompts you to press `A`.

## Local Tests

Run unit tests:

```powershell
node --test C:\Users\Oviks\.gemini\antigravity\scratch\fs-review-stage1\tests\stage1.test.js
```

Open `tests\stage1-local-harness.html` in any browser to test all 5 comparison cases interactively with click, keypress, and timing counters.
