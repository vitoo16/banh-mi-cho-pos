# React Native release bundling validation

GitHub Actions `.github/workflows/mobile-bundle-ci.yml` now checks the Expo Staff build with **Metro production export for both Android and iOS** on mobile/shared contract changes. It catches missing modules, Babel transpilation and asset resolution not covered by TypeScript alone. The build supplies an intentionally nonfunctional HTTPS placeholder for `EXPO_PUBLIC_HUB_URL` and does not bundle any credentials.

This gate creates JS bundles and assets, **not installable APK/IPA files**, and cannot prove native module linking, certificate trust or real-world performance. For production acceptance, create a signed Android/iOS native development or release build with the appropriate secure configuration and exercise device pairing, killing the app mid-submit, 30-minute WAN loss, reconnection and cashier reconciliation on physical phones.
