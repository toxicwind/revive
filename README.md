# revive

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE) [![GitHub stars](https://img.shields.io/github/stars/toxicwind/revive?style=for-the-badge)](https://github.com/toxicwind/revive) [![GitHub issues](https://img.shields.io/github/issues/toxicwind/revive?style=for-the-badge)](https://github.com/toxicwind/revive/issues)

**Ableton Live plugin-UI recovery watchdog** · detects the dead plugin-metadata IPC channel, restarts the wedged Index peer, and VSTi UIs reopen.

</div>

---

## The problem — you are not alone

> *"For several months now I have been living with a big problem... I have to keep the plugin open all the time, otherwise the GUI dies when I close it. ... To reproduce it, simply open a window with your plugin, close it, and then try to open it again. The result is a white screen and errors in the console."*
> — **vtarasuk**, *Blank/White Screen after plugin was closed and opened again* — [JUCE forum](https://forum.juce.com/t/blank-white-screen-after-plugin-was-closed-and-opened-again/59281)

> *"I have recently noticed some VSTs are showing up with a blank/white UI. In this case, the controls and UI are invisible and unusable. It seems like VSTs that use OpenGL have this issue. The issue happens after reloading a saved set with the offending VST."*
> — **jbone1313**, *Some VST UIs appear blank/white* — [Ableton forum](https://forum.ableton.com/viewtopic.php?t=238228)

> *"When loading such a plugin in Ableton Live 12, the plugin's editor window displays correctly the first time. However, if the editor window is closed and then reopened, it appears completely blank (just white) and none of the controls are visible."*
> — **ring2**, *AUv3 plugin editor window shows blank (white) when reopened in Ableton Live 12* — [JUCE forum](https://forum.juce.com/t/auv3-plugin-editor-window-shows-blank-white-when-reopened-in-ableton-live-12/67135)

**This is the bug.** A VSTi loads and works the first time; close its UI, reopen it → **blank/white window, controls invisible, UI never comes back.** It has been reported for years across Ableton and JUCE forums.

## What's actually happening

The plugin *processor* still loads (you can hear it). What fails is the **plugin-metadata IPC channel** — Ableton's nanomsg channel to its `Ableton Index.exe` subprocess has wedged, and every editor reopen fires a metadata-reimport message into the dead channel.

Your Ableton `Log.txt` shows this signature:

```
warning: TNanoMsgIPCChannel: could not send message: ReimportMetadataForPlugin
warning: Last message repeated 139 time(s): TNanoMsgIPCChannel: could not send message: ReimportMetadataForPlugin
```

## What revive does

1. Watches Ableton's `Log.txt` (tail-only, so it stays fast as the log grows).
2. Detects the failure signature above.
3. Force-restarts the wedged `Ableton Index.exe` peer.
4. **Ableton auto-respawns it** and reconnects the channel — the self-heal shows in the log:
   ```
   error: Indexer: process stopped prematurely [1]. Restart
   info:  Indexer: start process
   ```
5. Runs as a durable scheduled task (at logon + every 10 min, restart-on-failure).

No DLL patching, no proprietary internals, no deob. Just the public `Log.txt` surface + the standard process lifecycle. **Windows + macOS.**

## Quick start

```bash
bun install

# One manual pass (detect + recover if needed)
bun bin/revive.ts run

# Dry-run: detect only, touch nothing
bun bin/revive.ts check

# Install as a durable scheduled task (logon + every 10 min)
bun bin/revive.ts install

# Remove the scheduled task
bun bin/revive.ts uninstall
```

## References (the threads behind this)

| Symptom | Source | Link |
|---|---|---|
| *"I have to keep the plugin open all the time, otherwise the GUI dies when I close it"* | JUCE — Blank/White Screen after plugin was closed and opened again | [forum.juce.com/t/…/59281](https://forum.juce.com/t/blank-white-screen-after-plugin-was-closed-and-opened-again/59281) |
| *"the controls and UI are invisible and unusable... happens after reloading a saved set"* | Ableton Forum — Some VST UIs appear blank/white | [forum.ableton.com/viewtopic.php?t=238228](https://forum.ableton.com/viewtopic.php?t=238228) |
| *"if the editor window is closed and then reopened, it appears completely blank (just white)"* | JUCE — AUv3 editor blank when reopened in Live 12 | [forum.juce.com/t/…/67135](https://forum.juce.com/t/auv3-plugin-editor-window-shows-blank-white-when-reopened-in-ableton-live-12/67135) |
| White GUI screen on many VST3 plugins + other bizarre GUI bugs | Ableton Forum | [forum.ableton.com/viewtopic.php?t=243314](https://forum.ableton.com/viewtopic.php?t=243314) |
| Plug-ins Tips and Troubleshooting (official) | Ableton Help | [help.ableton.com/hc/en-us/articles/5232428442002](https://help.ableton.com/hc/en-us/articles/5232428442002) |

## Where's the Log.txt?

- **Windows**: `C:\Users\<you>\AppData\Roaming\Ableton\Live <ver>\Preferences\Log.txt`
- **macOS**: `~/Library/Preferences/Ableton/Live <ver>/Log.txt`

`revive` finds the most recent one automatically.

## Roadmap

- [x] First release — detect + recover + scheduled task
- [ ] macOS launchd installer (currently cron best-effort)
- [ ] Configurable extra peers to restart

## License

MIT