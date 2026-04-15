# Spínačka VR Viewer

WebXR panorama viewer for Lumion VR renders. View architectural panoramas in VR on Meta Quest 3 or in your browser.

## Features

- **Mono & Stereo Cubemap Support** — handles 6-face and 12-face (stereo) Lumion panorama exports
- **WebXR VR Mode** — immersive viewing with head tracking on Meta Quest 3
- **Desktop Preview** — click & drag to look around before entering VR
- **No Installation** — runs directly in the browser

## How to Use

### On Desktop
1. Visit the [live demo](https://YOUR_USERNAME.github.io/spinacka-vr/)
2. Select a panorama
3. Click and drag to look around

### On Meta Quest 3
1. Open the Quest browser
2. Navigate to the demo URL
3. Select a panorama
4. Tap **"Enter VR"** for immersive viewing

## Technical Details

- Built with **Three.js** and **WebXR API**
- Splits Lumion cubemap strips into individual face textures at runtime
- Supports both mono (6-face) and stereo (12-face) cubemaps
- Face size: 1536×1536 pixels per face

## Credits

VR renders created with Lumion.
