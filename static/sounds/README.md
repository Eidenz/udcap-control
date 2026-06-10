# Calibration sounds

Drop MP3 files here with these exact names and they're picked up automatically
by the Calibrate screen (no rebuild needed for the file contents — they're
served from `/sounds/<name>.mp3`). Any missing file is silently skipped, and the
🔊/🔇 toggle on the Calibrate screen turns all cues on/off.

| File             | Played when…                                  |
| ---------------- | --------------------------------------------- |
| `start.mp3`      | calibration begins ("get ready")              |
| `fist.mp3`       | the "Make a fist" pose starts                 |
| `together.mp3`   | the "Fingers together" pose starts            |
| `spread.mp3`     | the "Spread fingers" pose starts              |
| `captured.mp3`   | each pose is captured (validation beep/voice) |
| `done.mp3`       | calibration completes                         |

Keep them short. Voice clips matching the Windows app's cues work great.
