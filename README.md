# Airbridge

Send files of any type, plus text and links, between your phone and your PC — in both
directions. One Flutter codebase, running as an Android app and a Windows desktop app.

## Status

Stage 0: skeleton + CI pipeline. The app currently just proves it builds and lists the
device's local IPv4 addresses. Transport, transfer, history and clipboard sync land next.

## How this repo is built

There is no Flutter SDK on the development machine, so **all builds happen on GitHub
Actions**. Push to `main`, then grab the artifacts from the Actions run:

- `airbridge-android-apk` — installable `app-release.apk`
- `airbridge-windows` — folder containing `airbridge.exe` and its DLLs

The `android/`, `windows/` and other platform folders are deliberately **not committed**.
CI regenerates them with `flutter create` on every run, so there is no hand-maintained
Gradle or CMake boilerplate to drift or break. Only `lib/`, `pubspec.yaml`, the relay
server and the workflow are version-controlled.

If you ever do install Flutter locally, run this once to get the platform folders back:

```
flutter create --project-name airbridge --org com.yniti --platforms=android,windows .
flutter pub get
```

## Planned architecture

A single `Transport` interface with swappable implementations, chosen in Settings:

- **Local Wi-Fi** — UDP broadcast discovery, then a small embedded HTTP server on each
  device streaming files in chunks. Fast, private, no server involved.
- **Internet relay** — a small self-hosted WebSocket relay that pairs two devices by code
  and forwards frames between them without storing anything. For when the devices are on
  different networks.
- **Bluetooth** — placeholder. Flutter's Windows Bluetooth support is not reliable enough
  to ship.

Because the transport is behind an interface, the UI, history and clipboard features do
not know or care which route the data takes.

## Known platform limits

Android blocks background clipboard reads (Android 10+). Clipboard sync from the phone
therefore only works while the app is in the foreground. This is an OS restriction with
no legitimate workaround, so the phone side is a "send my clipboard" action rather than a
silent background sync.
