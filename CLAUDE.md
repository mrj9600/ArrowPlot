# Project context

Background notes carried over from an earlier chat. Covers what we learned about
MyTargets backups and how a web app (Angular) can store data on a phone.

## MyTargets (Android archery app) — lessons learned

- MyTargets is open source (GitHub: DreierF/MyTargets, Kotlin, GPL v2).
- Backups are listed under Settings → Backup ("Sikkerhedskopi"). Backup location
  offers fixed choices only; there is **no folder picker and no "import from file"**.
- Replacing a backup file in Downloads with an externally generated file makes it
  **disappear from the app's list**. Reason: on Android 10+ (scoped storage) an app
  only sees files in shared folders that it created itself. A file written by a file
  manager or browser belongs to that app, so MyTargets can't see it.
- Possible workarounds (unverified):
  - Overwrite the *contents* of an existing app-created backup in place (not
    delete + recreate), so ownership stays with MyTargets.
  - `adb` writes may or may not preserve ownership depending on Android version.
- Risk: GitHub issue #390 reports that a malformed backup can break restoring
  *other* backups too. Always keep a known-good backup copied outside the app
  folder before restoring a generated file.
- File size note: backups include photos, so size drops sharply if a photo is
  deleted (3.5 MB → 121 kB observed). That alone is not a sign of data loss.

**Design takeaway for our app:** provide an explicit import/export via the system
file picker, so users are never locked out of their own backup files.

## Storing private data in an Angular web app on mobile

The framework doesn't matter; it's what the browser allows.

### Works like a native app
- **IndexedDB** (recommended via Dexie.js) and the **Origin Private File System
  (OPFS)** are sandboxed per origin — private to the app.
- Generous quotas (Chrome allows a large share of free disk per origin).
- As a **PWA** (manifest + service worker) it installs to the home screen and
  works offline.

### Limitations to design around
- Storage is "best effort" by default and can be evicted under storage pressure.
  Call `navigator.storage.persist()` at startup; installed PWAs usually get it.
  Check with `navigator.storage.persisted()`.
- **iOS Safari** may delete storage for sites not used for ~7 days unless the app
  is added to the home screen.
- Clearing site data or uninstalling the PWA wipes everything.
- No silent filesystem access: can't write to Downloads in the background.
  Available instead: file download (`<a download>`), Web Share API with files,
  `<input type="file">` for import.
- Browser storage is **not** included in Android's system backup.

### Recommended setup
1. Data layer: IndexedDB via Dexie.js.
2. On first run: request `navigator.storage.persist()`.
3. Export button: serialize data (JSON, or zip incl. images) → download / share.
4. Import button: file picker → validate schema/version → restore.
   Validate before overwriting, and keep the previous data until import succeeds.
5. Optional: wrap with **Capacitor** later for native filesystem/storage APIs
   while keeping the same Angular codebase.
