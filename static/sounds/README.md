# Calibration sounds

Drop MP3 files here with these exact names and they're picked up automatically
(served from `/sounds/<name>.mp3`). A cue plays at each step of calibration —
whether you start it from the app **or** by pressing a glove's menu button — so
you can calibrate in VR without looking. Missing files are silently skipped, and
the 🔊/🔇 toggle on the Calibrate screen turns all cues on/off.

| File           | Played when…                                       |
| -------------- | -------------------------------------------------- |
| `start.mp3`    | calibration begins ("get ready" countdown)         |
| `fist.mp3`     | the "Make a fist" pose starts                      |
| `together.mp3` | "Make a fist" captured → "Fingers together" starts |
| `spread.mp3`   | "Fingers together" captured → "Spread" starts      |
| `captured.mp3` | the spread pose is captured (final validation)     |
| `done.mp3`     | calibration completes                              |

Keep them short. Voice clips matching the Windows app's cues work great.
