# BinZ Mobile

Flutter implementation of the supplied BinZ mobile prototype.

## Run locally

Install the [Flutter SDK](https://docs.flutter.dev/get-started/install), then run:

```sh
cd binz_mobile
flutter pub get
flutter run
```

The app connects to `https://binz-clone.onrender.com` by default. To point a
development build at another API, pass `--dart-define=BINZ_API_URL=https://api.example.com`.

The implementation is intentionally dependency-free and includes the Home, Scrap, Earn, Impact, Service, certificate, and pickup-basket flows.
