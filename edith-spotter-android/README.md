# EDITH Spotter — Native Android (Java)

Native Android Studio project, replacing the Flutter version. Same
backend, same API contract, same design principles (persistent visible
notification while spotting, no local face-recognition processing — this
app only detects "is there a face here," the FastAPI backend does the
actual matching).

## What changed from the Flutter version

- No Flutter/Dart at all — pure Java, built directly in Android Studio.
- `ApiClient.java` talks to the exact same backend routes as before:
  `GET /api/health`, `GET /api/cases/active`, `POST /api/recognize`.
  **Same connection** — point it at the same FastAPI server URL you're
  already using for the dashboard, nothing on the backend changes.
- The foreground service (`SpottingService.java`) and permission model are
  adapted from your original native Java prototype — CameraX capture, ML
  Kit for on-device face *detection* only (never recognition/embeddings),
  crop-and-upload, real Android foreground service with
  `FOREGROUND_SERVICE_TYPE_CAMERA` and a persistent notification.

## Open this in Android Studio

1. Android Studio → **Open** → select the `edith-spotter-android` folder.
2. Let it sync Gradle (first sync downloads dependencies — needs a normal
   internet connection; nothing here is pre-vendored).
3. Run on a real device (camera + GPS work better on real hardware than
   most emulators). `minSdk 26` (Android 8.0+).

No manifest editing needed this time — permissions and the foreground
service type are already fully declared in `AndroidManifest.xml`.

## Using it

1. Launch the app, enter your backend URL (e.g. `https://your-space.hf.space`
   or `http://<your-computer-IP>:8000` for local testing on the same
   network), tap **TEST CONNECTION**.
2. Tap **START SPOTTING**, grant camera/location/notification permissions
   when prompted (requested together, once).
3. The persistent "EDITH Spotting Active" notification appears — the
   app is now capturing frames, detecting faces on-device, and sending
   any detected face crop to `/api/recognize` on your backend.
4. Enroll and activate a case on the dashboard, point the phone at that
   person, and watch the dashboard's live map for the pin.

## Honest verification note

I could not compile or run this project — there's no Android SDK,
Gradle, or path to Google's Maven repository (where AndroidX, CameraX,
and ML Kit are hosted) in the environment this was written in. Everything
here was written carefully against APIs I'm confident about (and your
own original native Java files used several of the same patterns
successfully), and I checked every file for balanced braces/parens and
well-formed XML — but that is not the same as a real build. **Open this
in Android Studio and fix whatever the first Gradle sync / build actually
flags before trusting it for a demo.** If something doesn't compile, send
me the exact error and I'll fix it directly rather than guessing twice.

## What's deliberately NOT in this app

No DeepFace, ArcFace, RetinaFace, or any embedding computation — ML Kit
here only answers "is there a face in this frame," never "whose face is
this." That question is answered entirely by the backend, same as every
other client in this project (the React dashboard, the Flutter build).
