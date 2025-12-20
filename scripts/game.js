// 3D Car Game Logic - Smooth Free Movement with Advanced Collision Detection
let scene, camera, renderer, playerCar, engineSound;
const roadSegments = [], obstacles = [], obstaclePool = [];
const powerUps = [], powerUpPool = [];
const roadLength = 50;
let score = 0, gameOver = false, isPaused = false, obstacleTimer = 0, obstacleInterval = 120, powerUpTimer = 0;

// Day-Night Transition Variables
let worldTime = 0; // 0.0 to 1.0 (0=Midday, 0.5=Sunset/Sunrise, etc.)
let dayCycleSpeed = 0.0005;
let skyMesh, sunLight, ambientLight, sunMesh;

// Game State Effects
const gameState = {
    shieldActive: false,
    boostActive: false,
    shieldTimeout: null,
    boostTimeout: null
};
const keys = {
    ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
    KeyA: false, KeyD: false, KeyW: false, KeyS: false
};

// --- NATIVE OPTIMIZED ENGINE (HIGH-PERFORMANCE) ---
let velocityX = 0;
let velocityZ = 0;
let positionX = 0;
let positionZ = 2;
const maxSpeedX = 0.2; // Reduced from 0.3
const maxSpeedZ = 0.5; // Reduced from 0.8
const accelerationX = 0.015; // Reduced from 0.02
const accelerationZ = 0.01; // Reduced from 0.015
const frictionX = 0.95;
const frictionZ = 0.98;
const dragX = 0.85;
const dragZ = 0.99;

// Advanced collision detection (C++-style algorithms)
const collisionEngine = {
    checkAABB: function (obj1, obj2, tolerance = 0.3) {
        const p1 = obj1.position, p2 = obj2.position;
        const s = 0.4;
        return (p1.x - s < p2.x + s + tolerance && p1.x + s > p2.x - s - tolerance &&
            p1.y - s < p2.y + s + tolerance && p1.y + s > p2.y - s - tolerance &&
            p1.z - s < p2.z + s + tolerance && p1.z + s > p2.z - s - tolerance);
    },
    checkSphere: function (obj1, obj2, r1 = 0.4, r2 = 0.4) {
        const dx = obj1.position.x - obj2.position.x;
        const dy = obj1.position.y - obj2.position.y;
        const dz = obj1.position.z - obj2.position.z;
        return (dx * dx + dy * dy + dz * dz) < (r1 + r2) * (r1 + r2);
    }
};

// Native optimization objects for pooling and math
// (collisionDetector removed in favor of collisionEngine)

// Global arrays to track environmental objects
const clouds = [];
const mountains = [];
let lastCloudSpawnZ = 0;
let lastMountainSpawnZ = -200;

// Day environment creation
function createDayEnvironment() {
    // Sky gradient (day sky) - reduced polygon count
    const skyGeometry = new THREE.SphereGeometry(500, 16, 16);
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x87CEEB) }, // Sky blue
            bottomColor: { value: new THREE.Color(0xE0F6FF) }, // Light blue
            offset: { value: 33 },
            exponent: { value: 0.6 }
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition + offset).y;
                gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
            }
        `,
        side: THREE.BackSide
    });
    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyMesh);

    // Sun (bright directional light) - optimized shadows
    sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);

    // Ambient light for overall illumination
    ambientLight = new THREE.AmbientLight(0x87CEEB, 0.4);
    scene.add(ambientLight);

    // Sun sphere (visible sun in the sky) - reduced polygons
    const sunGeometry = new THREE.SphereGeometry(10, 8, 8);
    const sunMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
    });
    sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
    sunMesh.position.set(50, 80, 50);
    scene.add(sunMesh);

    // Ground plane (grass/terrain)
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshLambertMaterial({
        color: 0x90EE90, // Light green
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    createInitialClouds();
    createInitialMountains();
}

function updateDayNightCycle() {
    worldTime += dayCycleSpeed;
    if (worldTime > 1.0) worldTime = 0;

    // smooth oscillation (0 at start/end, 1 in middle)
    const cycle = Math.sin(worldTime * Math.PI * 2);
    const isNight = (worldTime > 0.4 && worldTime < 0.9);

    // Intensity Logic
    let dayIntensity = Math.max(0.1, Math.cos(worldTime * Math.PI * 2));
    sunLight.intensity = Math.max(0.1, dayIntensity * 1.5);
    ambientLight.intensity = Math.max(0.1, dayIntensity * 0.6);

    // Sun/Moon Orbit
    sunMesh.position.x = Math.sin(worldTime * Math.PI * 2) * 200;
    sunMesh.position.y = Math.cos(worldTime * Math.PI * 2) * 100;
    sunLight.position.copy(sunMesh.position);

    // Sky Colors Transition
    const dayTop = new THREE.Color(0x87CEEB);
    const dayBottom = new THREE.Color(0xE0F6FF);
    const nightTop = new THREE.Color(0x0a0a2a);
    const nightBottom = new THREE.Color(0x1a1a4a);
    const sunsetTop = new THREE.Color(0xff5e62);
    const sunsetBottom = new THREE.Color(0xff9966);

    let currentTop, currentBottom;

    if (worldTime < 0.25 || worldTime > 0.75) { // Daytime
        currentTop = dayTop;
        currentBottom = dayBottom;
        sunMesh.material.color.set(0xffff00);
    } else if (worldTime >= 0.25 && worldTime < 0.4) { // Sunset
        const t = (worldTime - 0.25) / 0.15;
        currentTop = dayTop.clone().lerp(sunsetTop, t);
        currentBottom = dayBottom.clone().lerp(sunsetBottom, t);
        sunMesh.material.color.set(0xff4500);
    } else if (worldTime >= 0.4 && worldTime < 0.6) { // To Night
        const t = (worldTime - 0.4) / 0.2;
        currentTop = sunsetTop.clone().lerp(nightTop, t);
        currentBottom = sunsetBottom.clone().lerp(nightBottom, t);
        sunMesh.material.color.set(0xcccccc);
    } else { // To Sunrise
        const t = (worldTime - 0.6) / 0.15;
        currentTop = nightTop.clone().lerp(sunsetTop, t);
        currentBottom = nightBottom.clone().lerp(sunsetBottom, t);
        sunMesh.material.color.set(0xff9966);
    }

    skyMesh.material.uniforms.topColor.value.copy(currentTop);
    skyMesh.material.uniforms.bottomColor.value.copy(currentBottom);
}

// Create initial floating clouds
function createInitialClouds() {
    const cloudGeometry = new THREE.SphereGeometry(5, 6, 6); // Reduced polygons
    const cloudMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });

    for (let i = 0; i < 6; i++) { // Reduced number of clouds
        const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloud.position.set(
            (Math.random() - 0.5) * 200,
            30 + Math.random() * 20,
            (Math.random() - 0.5) * 200
        );
        cloud.scale.set(
            1 + Math.random() * 0.5,
            0.5 + Math.random() * 0.3,
            1 + Math.random() * 0.5
        );
        clouds.push(cloud);
        scene.add(cloud);
    }
    lastCloudSpawnZ = 0;
}

// Create initial distant mountains
function createInitialMountains() {
    const mountainGeometry = new THREE.ConeGeometry(20, 40, 6); // Reduced polygons
    const mountainMaterial = new THREE.MeshLambertMaterial({
        color: 0x8B4513, // Brown
        transparent: true,
        opacity: 0.7
    });

    for (let i = 0; i < 3; i++) { // Reduced number of mountains
        const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
        mountain.position.set(
            (Math.random() - 0.5) * 300,
            20,
            -200 - Math.random() * 100
        );
        mountain.scale.set(
            1 + Math.random() * 0.5,
            1 + Math.random() * 0.5,
            1 + Math.random() * 0.5
        );
        mountain.receiveShadow = true;
        mountains.push(mountain);
        scene.add(mountain);
    }
    lastMountainSpawnZ = -200;
}

// Create a single cloud at specific position
function createCloud(zPosition) {
    const cloudGeometry = new THREE.SphereGeometry(5, 6, 6); // Reduced polygons
    const cloudMaterial = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });

    const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    cloud.position.set(
        (Math.random() - 0.5) * 200,
        30 + Math.random() * 20,
        zPosition
    );
    cloud.scale.set(
        1 + Math.random() * 0.5,
        0.5 + Math.random() * 0.3,
        1 + Math.random() * 0.5
    );
    clouds.push(cloud);
    scene.add(cloud);
}

// Create a single mountain at specific position
function createMountain(zPosition) {
    const mountainGeometry = new THREE.ConeGeometry(20, 40, 6); // Reduced polygons
    const mountainMaterial = new THREE.MeshLambertMaterial({
        color: 0x8B4513, // Brown
        transparent: true,
        opacity: 0.7
    });

    const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
    mountain.position.set(
        (Math.random() - 0.5) * 300,
        20,
        zPosition
    );
    mountain.scale.set(
        1 + Math.random() * 0.5,
        1 + Math.random() * 0.5,
        1 + Math.random() * 0.5
    );
    mountain.receiveShadow = true;
    mountains.push(mountain);
    scene.add(mountain);
}

// Update environment - spawn new elements and remove old ones
function updateEnvironment() {
    if (!playerCar) return;

    const playerZ = playerCar.position.z;

    // Spawn new clouds ahead - reduced frequency
    if (playerZ - lastCloudSpawnZ < -150) {
        createCloud(playerZ - 200);
        lastCloudSpawnZ = playerZ - 150;
    }

    // Spawn new mountains ahead - reduced frequency
    if (playerZ - lastMountainSpawnZ < -200) {
        createMountain(playerZ - 250);
        lastMountainSpawnZ = playerZ - 200;
    }

    // Remove clouds that are too far behind - more aggressive cleanup
    for (let i = clouds.length - 1; i >= 0; i--) {
        if (clouds[i].position.z > playerZ + 80) {
            scene.remove(clouds[i]);
            clouds.splice(i, 1);
        }
    }

    // Remove mountains that are too far behind - more aggressive cleanup
    for (let i = mountains.length - 1; i >= 0; i--) {
        if (mountains[i].position.z > playerZ + 120) {
            scene.remove(mountains[i]);
            mountains.splice(i, 1);
        }
    }
}

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap; // Lighter shadow mapping
    renderer.toneMapping = THREE.LinearToneMapping; // Simpler tone mapping
    renderer.toneMappingExposure = 1.0;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    // Create day environment
    createDayEnvironment();

    // Road segments
    for (let i = 0; i < 3; i++) {
        roadSegments.push(createRoadSegment(-i * roadLength));
    }

    // Car model
    const loader = new THREE.GLTFLoader();
    loader.load('assets/cartoon_car.glb', function (gltf) {
        playerCar = gltf.scene;
        playerCar.scale.set(0.17, 0.17, 0.17);
        playerCar.position.set(positionX, 0.25, positionZ);
        playerCar.rotation.y = Math.PI;
        playerCar.castShadow = true;
        scene.add(playerCar);
    });

    // Camera setup
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, -50);

    // Event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', onWindowResize);
    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('pause-overlay').addEventListener('click', togglePause);
    initMobileControls();

    // Audio
    engineSound = new Audio('assets/sound.mp3');
    engineSound.loop = true;

    // Score update
    setInterval(updateScore, 100);

    animate();
}

function handleKeyDown(e) {
    // Support both arrow keys and WASD
    if (e.key === 'a' || e.key === 'A') keys.KeyA = true;
    else if (e.key === 'd' || e.key === 'D') keys.KeyD = true;
    else if (e.key === 'w' || e.key === 'W') keys.KeyW = true;
    else if (e.key === 's' || e.key === 'S') keys.KeyS = true;
    else keys[e.key] = true;
    e.preventDefault();
}

function handleKeyUp(e) {
    // Support both arrow keys and WASD
    if (e.key === 'a' || e.key === 'A') keys.KeyA = false;
    else if (e.key === 'd' || e.key === 'D') keys.KeyD = false;
    else if (e.key === 'w' || e.key === 'W') keys.KeyW = false;
    else if (e.key === 's' || e.key === 'S') keys.KeyS = false;
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else keys[e.key] = false;
    e.preventDefault();
}

function togglePause() {
    if (gameOver) return;
    isPaused = !isPaused;
    document.getElementById('pause-btn').textContent = isPaused ? '▶' : '⏸';
    document.getElementById('pause-overlay').style.display = isPaused ? 'flex' : 'none';

    if (isPaused) {
        if (!engineSound.paused) engineSound.pause();
    } else {
        if (keys.KeyW && engineSound.paused) engineSound.play();
        requestAnimationFrame(animate);
    }
}

function initMobileControls() {
    const btns = [
        { id: 'btn-left', key: 'KeyA' },
        { id: 'btn-right', key: 'KeyD' },
        { id: 'btn-up', key: 'KeyW' },
        { id: 'btn-down', key: 'KeyS' }
    ];

    btns.forEach(btn => {
        const element = document.getElementById(btn.id);
        if (!element) return;

        const setKey = (val) => {
            keys[btn.key] = val;
            // Also map to arrow keys for compatibility
            if (btn.key === 'KeyA') keys.ArrowLeft = val;
            if (btn.key === 'KeyD') keys.ArrowRight = val;
            if (btn.key === 'KeyW') keys.ArrowUp = val;
            if (btn.key === 'KeyS') keys.ArrowDown = val;
        };

        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            setKey(true);
            if (btn.key === 'KeyW' && engineSound.paused) engineSound.play();
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            setKey(false);
        }, { passive: false });
    });
}

function createRoadSegment(zPosition) {
    const roadGeometry = new THREE.PlaneGeometry(10, roadLength);
    const roadTexture = new THREE.TextureLoader().load('assets/road2.jpg');
    roadTexture.wrapS = THREE.RepeatWrapping;
    roadTexture.wrapT = THREE.RepeatWrapping;
    roadTexture.repeat.set(1, 5);
    const roadMaterial = new THREE.MeshLambertMaterial({
        map: roadTexture
    });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.z = zPosition;
    road.position.y = 0.01; // Slightly above ground to prevent z-fighting
    road.receiveShadow = true;
    scene.add(road);
    return road;
}

// Simplified obstacle materials for better performance
const obstacleMaterials = [
    new THREE.MeshLambertMaterial({ color: 0xff0000 }),
    new THREE.MeshLambertMaterial({ color: 0xff6600 }),
    new THREE.MeshLambertMaterial({ color: 0xcc0000 }),
    new THREE.MeshLambertMaterial({ color: 0x990000 }),
    new THREE.MeshLambertMaterial({ color: 0xff3300 }),
    new THREE.MeshLambertMaterial({ color: 0x0066cc }),
    new THREE.MeshLambertMaterial({ color: 0x00cc66 }),
    new THREE.MeshLambertMaterial({ color: 0xcc6600 })
];

function createObstacle(zOffset) {
    let carGroup;

    // Object Pooling: Reuse old obstacles if available
    if (obstaclePool.length > 0) {
        carGroup = obstaclePool.pop();
    } else {
        carGroup = new THREE.Group();

        // Body
        const bodyGeometry = new THREE.BoxGeometry(1.2, 0.4, 2);
        const bodyMaterial = obstacleMaterials[0].clone();
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.2;
        carGroup.add(body);

        // Roof
        const roofGeometry = new THREE.BoxGeometry(0.8, 0.3, 1.2);
        const roof = new THREE.Mesh(roofGeometry, new THREE.MeshLambertMaterial({ color: 0x333333 }));
        roof.position.y = 0.55;
        roof.position.z = -0.2;
        carGroup.add(roof);

        // Optimized Wheels
        const wheelGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6);
        const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
        const w1 = new THREE.Mesh(wheelGeom, wheelMat); w1.position.set(-0.6, 0.2, 0.6); w1.rotation.z = Math.PI / 2; carGroup.add(w1);
        const w2 = new THREE.Mesh(wheelGeom, wheelMat); w2.position.set(0.6, 0.2, 0.6); w2.rotation.z = Math.PI / 2; carGroup.add(w2);
        const w3 = new THREE.Mesh(wheelGeom, wheelMat); w3.position.set(-0.6, 0.2, -0.6); w3.rotation.z = Math.PI / 2; carGroup.add(w3);
        const w4 = new THREE.Mesh(wheelGeom, wheelMat); w4.position.set(0.6, 0.2, -0.6); w4.rotation.z = Math.PI / 2; carGroup.add(w4);
    }

    // Randomize for variety
    const bodyMesh = carGroup.children[0];
    bodyMesh.material.color.set(obstacleMaterials[Math.floor(Math.random() * obstacleMaterials.length)].color);

    const randomX = (Math.random() - 0.5) * 8;
    carGroup.position.set(randomX, 0, zOffset);
    carGroup.rotation.y = Math.PI;
    carGroup.movementSpeed = 0.03 + Math.random() * 0.04;

    // AI Robot Intelligence
    carGroup.aiMode = Math.random() > 0.8 ? 'agressive' : 'passive';
    carGroup.laneTimer = 0;
    carGroup.targetX = randomX;

    obstacles.push(carGroup);
    scene.add(carGroup);
}

function spawnObstacles() {
    if (!playerCar) return;
    const zOffset = playerCar.position.z - roadLength * 3;

    // Spawn Power-up (Rare)
    if (++powerUpTimer > 300) { // Every ~5 seconds
        if (Math.random() > 0.7) {
            spawnPowerUp(zOffset);
            powerUpTimer = 0;
        }
    }

    const numObstacles = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < numObstacles; i++) {
        createObstacle(zOffset - i * 18);
    }
}

function spawnPowerUp(zOffset) {
    let pUp;
    const type = Math.random() > 0.5 ? 'shield' : 'boost';

    if (powerUpPool.length > 0) {
        pUp = powerUpPool.pop();
    } else {
        const geom = new THREE.IcosahedronGeometry(0.5, 0);
        const mat = new THREE.MeshPhongMaterial({ shininess: 100 });
        pUp = new THREE.Mesh(geom, mat);
    }

    pUp.powerType = type;
    pUp.material.color.set(type === 'shield' ? 0x00ffff : 0xffff00);
    pUp.position.set((Math.random() - 0.5) * 8, 0.5, zOffset);

    powerUps.push(pUp);
    scene.add(pUp);
}

function updateScore() {
    if (gameOver) return;
    if (velocityZ > 0) {
        let multiplier = gameState.boostActive ? 3 : 1;
        score += Math.floor(velocityZ * 15 * multiplier);
        document.getElementById('score-text').textContent = `Score: ${score} ${multiplier > 1 ? ' (3x BOOST!)' : ''}`;
    }
}

// Advanced collision detection using multiple algorithms
function checkCollision() {
    if (!playerCar) return;

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const obstacle = obstacles[i];
        obstacle.position.z += obstacle.movementSpeed;

        // --- IMPROVED BOT AI ---
        // Periodically attempt to change lanes if aggressive
        obstacle.laneTimer++;
        if (obstacle.laneTimer > (obstacle.aiMode === 'agressive' ? 60 : 200)) {
            if (Math.random() > 0.5) {
                obstacle.targetX = (Math.random() - 0.5) * 8.5;
            }
            obstacle.laneTimer = 0;
        }

        // Smoothly steer towards target X
        if (Math.abs(obstacle.position.x - obstacle.targetX) > 0.1) {
            const steerSpeed = obstacle.aiMode === 'agressive' ? 0.05 : 0.02;
            obstacle.position.x += (obstacle.targetX - obstacle.position.x) * steerSpeed;
        }

        let collision = false;
        if (collisionEngine.checkAABB(playerCar, obstacle, 0.2)) collision = true;
        else if (collisionEngine.checkSphere(playerCar, obstacle, 0.4, 0.4)) collision = true;

        if (collision) {
            if (gameState.shieldActive) {
                // Consume shield
                gameState.shieldActive = false;
                if (gameState.shieldTimeout) clearTimeout(gameState.shieldTimeout);
                scene.remove(obstacle);
                obstaclePool.push(obstacle);
                obstacles.splice(i, 1);
                return;
            }

            triggerGameOver();
            return;
        }

        if (obstacle.position.z > playerCar.position.z + 15) {
            scene.remove(obstacle);
            obstaclePool.push(obstacle);
            obstacles.splice(i, 1);
        }
    }

    // Process Power-ups collection
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pUp = powerUps[i];
        pUp.rotation.y += 0.05;
        pUp.rotation.x += 0.02;

        if (collisionEngine.checkSphere(playerCar, pUp, 0.6, 0.6)) {
            activatePowerUp(pUp.powerType);
            scene.remove(pUp);
            powerUpPool.push(pUp);
            powerUps.splice(i, 1);
            continue;
        }

        if (pUp.position.z > playerCar.position.z + 15) {
            scene.remove(pUp);
            powerUpPool.push(pUp);
            powerUps.splice(i, 1);
        }
    }
}

function activatePowerUp(type) {
    if (type === 'shield') {
        gameState.shieldActive = true;
        if (gameState.shieldTimeout) clearTimeout(gameState.shieldTimeout);
        gameState.shieldTimeout = setTimeout(() => gameState.shieldActive = false, 5000);
    } else if (type === 'boost') {
        gameState.boostActive = true;
        if (gameState.boostTimeout) clearTimeout(gameState.boostTimeout);
        gameState.boostTimeout = setTimeout(() => gameState.boostActive = false, 5000);
    }
}

function triggerGameOver() {
    gameOver = true;
    document.getElementById('game-over-overlay').style.display = 'block';
    document.getElementById('game-over-text').style.display = 'block';
    document.getElementById('final-score').textContent = `Final Score: ${score}`;
    document.getElementById('final-score').style.display = 'block';
    document.getElementById('restart-btn').style.display = 'block';
    document.getElementById('instructions').style.display = 'none';
    if (!engineSound.paused) engineSound.pause();
}

// Update obstacle movement - cars move straight towards player
function updateObstacleMovement(obstacle) {
    // Cars move straight towards the player (no horizontal movement)
    // The forward movement is handled in checkCollision() with obstacle.movementSpeed
    // Each obstacle has its own speed for variety
}

function updateRoad() {
    roadSegments.forEach((segment) => {
        if (playerCar && playerCar.position.z - segment.position.z < -roadLength) {
            segment.position.z -= roadLength * roadSegments.length;
            spawnObstacles();
        }
    });
}

// Smooth physics-based movement (C++-style)
function updateMovement() {
    if (!playerCar) return;

    // Horizontal movement (left/right) - Support both arrow keys and WASD
    if (keys.ArrowLeft || keys.KeyA) {
        velocityX -= accelerationX;
    } else if (keys.ArrowRight || keys.KeyD) {
        velocityX += accelerationX;
    } else {
        velocityX *= frictionX;
    }

    // Apply drag and limits
    velocityX = Math.max(Math.min(velocityX, maxSpeedX), -maxSpeedX);
    velocityX *= dragX;

    // Vertical movement (forward/backward) - Support both arrow keys and WASD
    if (keys.ArrowUp || keys.KeyW) {
        velocityZ += accelerationZ;
        if (engineSound.paused) engineSound.play();
    } else if (keys.ArrowDown || keys.KeyS) {
        velocityZ -= accelerationZ * 2;
    } else {
        velocityZ *= frictionZ;
    }

    // Apply drag and limits
    velocityZ = Math.max(Math.min(velocityZ, maxSpeedZ + score * 0.0001), 0);
    velocityZ *= dragZ;

    // Update positions
    positionX += velocityX;
    positionZ -= velocityZ;

    // Boundary checking
    positionX = Math.max(Math.min(positionX, 4.5), -4.5);

    // Apply to car model
    playerCar.position.x = positionX;
    playerCar.position.z = positionZ;

    // Smooth camera following
    camera.position.x += (positionX - camera.position.x) * 0.1;
    camera.position.z = positionZ + 8;
}

function animate() {
    if (gameOver || isPaused) return;
    requestAnimationFrame(animate);

    updateMovement();

    // Day-Night Transition Logic
    if (typeof updateDayNightCycle === 'function') updateDayNightCycle();

    // Progressive difficulty
    obstacleTimer++;
    let minInterval = 40; // Increased from 30 to make it slightly easier
    let dynamicInterval = Math.max(obstacleInterval - Math.floor(score / 100) * 3, minInterval); // Slower difficulty increase
    if (obstacleTimer > dynamicInterval) {
        spawnObstacles();
        obstacleTimer = 0;
    }

    updateRoad();
    updateEnvironment();
    checkCollision();

    // Add visual feedback for power-ups (Native Glow)
    if (playerCar) {
        if (gameState.shieldActive) {
            playerCar.traverse(n => { if (n.isMesh) n.material.emissive?.set(0x00ffff); });
        } else if (gameState.boostActive) {
            playerCar.traverse(n => { if (n.isMesh) n.material.emissive?.set(0xffff00); });
        } else {
            playerCar.traverse(n => { if (n.isMesh) n.material.emissive?.set(0x000000); });
        }
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.restartGame = function () {
    // High-performance reset
    gameOver = false;
    isPaused = false;
    score = 0;
    document.getElementById('pause-btn').textContent = '⏸';
    obstacleTimer = 0;
    obstacleInterval = 120;
    velocityX = 0;
    velocityZ = 0;
    positionX = 0;
    positionZ = 2;

    if (playerCar) playerCar.position.set(0, 0.25, 2);
    camera.position.set(0, 3, 10);
    camera.lookAt(0, 0, -50);

    obstacles.forEach(obs => {
        scene.remove(obs);
        obstaclePool.push(obs);
    });
    obstacles.length = 0;

    powerUps.forEach(pUp => {
        scene.remove(pUp);
        powerUpPool.push(pUp);
    });
    powerUps.length = 0;

    // Reset status effects
    gameState.shieldActive = false;
    gameState.boostActive = false;
    if (gameState.shieldTimeout) clearTimeout(gameState.shieldTimeout);
    if (gameState.boostTimeout) clearTimeout(gameState.boostTimeout);

    roadSegments.forEach((seg, i) => seg.position.z = -i * roadLength);

    document.getElementById('score-text').textContent = "Score: 0";
    document.getElementById('game-over-overlay').style.display = 'none';
    document.getElementById('game-over-text').style.display = 'none';
    document.getElementById('final-score').style.display = 'none';
    document.getElementById('restart-btn').style.display = 'none';
    document.getElementById('instructions').style.display = 'block';

    if (engineSound) engineSound.currentTime = 0;
    requestAnimationFrame(animate);
};

document.addEventListener('DOMContentLoaded', init);
// Basic loading screen logic
function showLoadingScreen() {
    const toast = document.getElementById('loading-toast');
    if (toast) {
        toast.style.display = 'flex';
        window.loadingScreenTimeout = setTimeout(() => {
            window.loadingScreenTimeout = null;
            hideLoadingScreen();
        }, 5000);
    }
}

function hideLoadingScreen() {
    if (window.loadingScreenTimeout) {
        return;
    }
    const toast = document.getElementById('loading-toast');
    if (toast) toast.style.display = 'none';
}

// Show toast loading message on page load
document.addEventListener('DOMContentLoaded', showLoadingScreen);

