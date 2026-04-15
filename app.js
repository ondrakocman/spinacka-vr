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
let skyboxMesh = null;
let leftSkybox = null;
let rightSkybox = null;

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

    // Create scene with skybox
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    if (stereo && allFaces.length >= 12) {
      // First 6 faces = left eye, next 6 = right eye
      const leftFaces = reorderFaces(allFaces, 0);
      const rightFaces = reorderFaces(allFaces, 6);
      leftCubeTexture = createCubeTextureFromCanvases(leftFaces);
      rightCubeTexture = createCubeTextureFromCanvases(rightFaces);
      
      // For stereo: create two separate skyboxes with render layers
      const skyboxGeometry = new THREE.BoxGeometry(500, 500, 500);
      
      // Left eye skybox (layer 1)
      const leftMaterial = new THREE.MeshBasicMaterial({
        envMap: leftCubeTexture,
        side: THREE.BackSide,
        depthWrite: false
      });
      leftSkybox = new THREE.Mesh(skyboxGeometry, leftMaterial);
      leftSkybox.layers.set(1);
      scene.add(leftSkybox);
      
      // Right eye skybox (layer 2)
      const rightMaterial = new THREE.MeshBasicMaterial({
        envMap: rightCubeTexture,
        side: THREE.BackSide,
        depthWrite: false
      });
      rightSkybox = new THREE.Mesh(skyboxGeometry, rightMaterial);
      rightSkybox.layers.set(2);
      scene.add(rightSkybox);
      
      skyboxMesh = leftSkybox; // For non-VR preview
    } else {
      // Mono: single skybox
      const faces = reorderFaces(allFaces, 0);
      leftCubeTexture = createCubeTextureFromCanvases(faces);
      rightCubeTexture = null;
      
      const skyboxGeometry = new THREE.BoxGeometry(500, 500, 500);
      const skyboxMaterial = new THREE.MeshBasicMaterial({
        envMap: leftCubeTexture,
        side: THREE.BackSide,
        depthWrite: false
      });
      skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
      scene.add(skyboxMesh);
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
    // In non-VR, enable all layers to see the skybox
    camera.layers.enableAll();
    renderer.render(scene, camera);
  } else {
    // In VR: Set up stereo rendering with camera layers
    if (isStereo && leftSkybox && rightSkybox) {
      const xrCamera = renderer.xr.getCamera();
      const cameras = xrCamera.cameras;
      
      if (cameras.length === 2) {
        // Left eye sees layer 1 (left skybox)
        cameras[0].layers.set(1);
        // Right eye sees layer 2 (right skybox)
        cameras[1].layers.set(2);
      }
    }
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
