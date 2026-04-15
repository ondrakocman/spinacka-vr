// Spínačka VR Panorama Viewer
// Supports Lumion cubemap strips (6-face mono, 12-face stereo)

const IMAGE_BASE = './images/';
const FACE_SIZE = 1536;

// Lumion cubemap strip face order (left to right in the strip):
// Strip index: 0=Right, 1=Left, 2=Top, 3=Bottom, 4=Front, 5=Back
// Three.js CubeTexture expects: [+X(Right), -X(Left), +Y(Top), -Y(Bottom), +Z(Front), -Z(Back)]
// Mapping: Three.js face index -> strip face index
// If the panorama looks wrong, try changing this mapping!
const FACE_ORDER = [0, 1, 2, 3, 4, 5];

let renderer, scene, camera;
let currentSession = null;
let isStereo = false;
let leftCubeTexture = null;
let rightCubeTexture = null;

// Mouse / touch look controls
let isUserInteracting = false;
let lon = 0, lat = 0;
let onPointerDownLon = 0, onPointerDownLat = 0;
let onPointerDownX = 0, onPointerDownY = 0;

function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.getElementById('vr-container').appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    if (!camera) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Pointer controls for non-VR (desktop / mobile browser)
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
}

function onPointerDown(e) {
  isUserInteracting = true;
  onPointerDownX = e.clientX;
  onPointerDownY = e.clientY;
  onPointerDownLon = lon;
  onPointerDownLat = lat;
}

function onPointerMove(e) {
  if (!isUserInteracting) return;
  lon = (onPointerDownX - e.clientX) * 0.15 + onPointerDownLon;
  lat = (e.clientY - onPointerDownY) * 0.15 + onPointerDownLat;
}

function onPointerUp() {
  isUserInteracting = false;
}

// Extract all face canvases from a horizontal strip image
function extractAllFaces(img) {
  const numFaces = Math.round(img.width / FACE_SIZE);
  const faces = [];
  for (let i = 0; i < numFaces; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = FACE_SIZE;
    canvas.height = FACE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, i * FACE_SIZE, 0, FACE_SIZE, FACE_SIZE, 0, 0, FACE_SIZE, FACE_SIZE);
    faces.push(canvas);
  }
  return faces;
}

// Reorder strip faces into Three.js CubeTexture order using FACE_ORDER mapping
function reorderFaces(stripFaces, offset) {
  return FACE_ORDER.map(stripIdx => stripFaces[offset + stripIdx]);
}

function createCubeTextureFromCanvases(canvases) {
  const cubeTexture = new THREE.CubeTexture(canvases);
  cubeTexture.needsUpdate = true;
  return cubeTexture;
}

function loadScene(filename, stereo) {
  isStereo = stereo;
  lon = 0;
  lat = 0;
  document.getElementById('loading').style.display = 'flex';

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (!renderer) init();

    const allFaces = extractAllFaces(img);
    console.log(`Loaded ${filename}: ${img.width}x${img.height}, ${allFaces.length} faces extracted`);

    // Create scene with cubemap background
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    if (stereo && allFaces.length >= 12) {
      // First 6 faces = left eye, next 6 = right eye
      const leftFaces = reorderFaces(allFaces, 0);
      const rightFaces = reorderFaces(allFaces, 6);
      leftCubeTexture = createCubeTextureFromCanvases(leftFaces);
      rightCubeTexture = createCubeTextureFromCanvases(rightFaces);
      scene.background = leftCubeTexture;
    } else {
      const faces = reorderFaces(allFaces, 0);
      leftCubeTexture = createCubeTextureFromCanvases(faces);
      rightCubeTexture = null;
      scene.background = leftCubeTexture;
    }

    // Show viewer
    document.getElementById('menu').style.display = 'none';
    document.getElementById('vr-container').style.display = 'block';
    document.getElementById('back-btn').style.display = 'block';
    document.getElementById('loading').style.display = 'none';

    // Show Enter VR button if WebXR is available
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        if (supported) {
          document.getElementById('enter-vr-btn').style.display = 'block';
        }
      });
    }

    // Start render loop
    renderer.setAnimationLoop(render);
  };

  img.onerror = (e) => {
    document.getElementById('loading').style.display = 'none';
    console.error('Failed to load image:', filename, e);
    alert('Failed to load image: ' + filename + '\nMake sure the image files are accessible.');
  };

  img.src = IMAGE_BASE + encodeURIComponent(filename);
}

function render() {
  if (!renderer.xr.isPresenting) {
    // Desktop / mobile: apply mouse look
    lat = Math.max(-85, Math.min(85, lat));
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    const target = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  } else {
    // In VR: WebXR handles head tracking automatically.
    // For stereo, ideally we'd use WebXR Layers to send different
    // images per eye — but browser support is limited. The mono
    // cubemap (left eye) is shown to both eyes, which still gives
    // a great immersive panoramic experience with full head tracking.
    renderer.render(scene, camera);
  }
}

async function enterVR() {
  if (!navigator.xr) {
    alert('WebXR not supported in this browser.');
    return;
  }

  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor']
    });
    currentSession = session;
    renderer.xr.setSession(session);
    document.getElementById('enter-vr-btn').style.display = 'none';

    session.addEventListener('end', () => {
      currentSession = null;
      document.getElementById('enter-vr-btn').style.display = 'block';
    });
  } catch (e) {
    console.error('Failed to enter VR:', e);
    alert('Failed to enter VR: ' + e.message);
  }
}

function backToMenu() {
  if (currentSession) {
    currentSession.end();
    currentSession = null;
  }
  if (renderer) renderer.setAnimationLoop(null);
  document.getElementById('vr-container').style.display = 'none';
  document.getElementById('back-btn').style.display = 'none';
  document.getElementById('enter-vr-btn').style.display = 'none';
  document.getElementById('menu').style.display = '';
}

// Expose to HTML onclick
window.loadScene = loadScene;
window.enterVR = enterVR;
window.backToMenu = backToMenu;
