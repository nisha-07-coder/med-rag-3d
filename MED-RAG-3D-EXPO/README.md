# MED-RAG: Inside the Intelligence (3D expo site)

Standalone site (HTML, CSS, JS, Three.js bundled locally in `vendor/`). No API keys, no internet needed, no changes to MED-RAG-COMPLETE.

## Run on your Mac
Chrome blocks ES modules from `file://`, so serve the folder locally:

```bash
cd ~/Downloads/MED-RAG-3D-EXPO     # wherever you saved the folder
python3 -m http.server 8000
```
Then open **http://localhost:8000** in Google Chrome. Press `F11` (or View > Enter Full Screen) for the projector. Stop the server with `Ctrl+C`.

## Presenting
- Click **Enter the MED-RAG world**, then **Start journey** (auto-plays ~11 s per stage). Pause/Resume, Prev/Next, Replay, and numbered stage buttons 1-10 let you jump anywhere. Arrow keys also work.
- Top bar: **Before / After**, **Question demo** (simulated sample data), **MED-RAG vs general AI**, **Full architecture**.
- If WebGL is unavailable, the site falls back to 2D explanation mode.

## Accuracy notes
Animations are illustrative, not live telemetry. Sample values (HbA1c 8.1%, file/page) are illustrative. Prototype, not a diagnosis or treatment tool.
