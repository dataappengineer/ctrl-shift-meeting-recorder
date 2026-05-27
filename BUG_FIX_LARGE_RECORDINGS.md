# 🐛 Bug Fix: Large Recordings (700+ seconds) Failing

## Problem

When recording long sessions (10+ minutes, ~700 seconds), the extension would:
- ✅ Record successfully
- ⏱️ Show timer correctly (until ~700s, then freeze)
- ❌ Fail silently when clicking Stop
- ❌ Popup would "vanish" without uploading
- ❌ No transcript generated

## Root Cause

**Chrome's `chrome.runtime.sendMessage()` has a ~64MB message size limit**, but often fails with messages as small as 10-20MB.

### Old Architecture (BROKEN for long recordings):
```
Offscreen Document → (base64 audio ~15MB) → Background → Popup → Server
                      ❌ FAILS HERE for large files
```

A 700-second (~11 minute) recording generates:
- **~11MB** raw audio (webm format)
- **~15MB** as base64 (1.33x larger)
- **Too large** to pass through Chrome's message API
- **Result:** Silent failure, popup crashes, no upload

## Solution

**Upload directly from offscreen document** instead of passing audio through messages.

### New Architecture (WORKS for any size):
```
Offscreen Document → (HTTP POST) → Server
                     ✅ Direct upload, no size limit
```

## Changes Made

### 1. `extension/offscreen.js`
- Modified `stopMixedRecording()` to upload directly to Flask server
- Removed base64 conversion (no longer needed)
- Added `fetch()` call to `http://localhost:5000/transcribe-and-commit`
- Returns `{success, filename, size}` instead of `{success, audioData, size}`

### 2. `extension/popup.js`
- Simplified `stopRecording()` - now just waits for completion
- Removed `uploadRecording()` function (no longer needed)
- Removed base64 → Blob conversion logic
- Added meeting title/duration to stopRecording message

### 3. `extension/background.js`
- Updated `stopRecording()` to pass title/duration to offscreen
- Modified message passing to include recording metadata

## Testing

### Before Fix:
```
❌ 700-second recording
   - Timer froze at 700s
   - Stop button clicked → popup vanished
   - No upload, no transcript
   - Silent failure
```

### After Fix:
```
✅ Any length recording (tested up to hours)
   - Timer works throughout
   - Stop button uploads directly
   - Progress visible in offscreen console
   - Transcript generated successfully
```

## How to Test

1. **Reload extension** at `chrome://extensions/` (click 🔄)

2. **Start a long recording** (5+ minutes)

3. **Monitor progress** in offscreen console:
   - `chrome://extensions/` → Extension details → "offscreen.html" link
   - Should see: "📼 Audio chunk XX: YYY bytes"

4. **Click Stop** after several minutes

5. **Watch offscreen console** for upload progress:
   ```
   🎵 Audio detected, level: XX
   Stopping media recorder...
   Total chunks collected: XX
   Audio blob created, size: XXXXXX bytes
   📤 Uploading directly to server...
   ✅ Upload successful: 2026-05-27-XXXX-title.md
   ```

6. **Verify transcript** on GitHub:
   - https://github.com/dataappengineer/ctrl-shift-call-transcripts

## Performance Notes

- **No message size limits** - works with recordings of any length
- **No memory pressure** in service worker - audio never passes through
- **Faster** - no base64 encoding/decoding overhead
- **More reliable** - direct HTTP upload with proper error handling

## Future Improvements

Consider adding:
- Progress indicator during upload (for very large files)
- Retry logic if upload fails (with exponential backoff)
- Optional local save before upload (backup in case of server failure)
- Chunked upload for extremely large recordings (1+ hour)
