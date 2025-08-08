// 3D Car Game Logic - Smooth Free Movement with Advanced Collision Detection
let scene, camera, renderer, playerCar, engineSound;
const roadSegments = [], obstacles = [];
const roadLength = 50;
let score = 0, gameOver = false, obstacleTimer = 0, obstacleInterval = 120;
const keys = { 
    ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false,
    KeyA: false, KeyD: false, KeyW: false, KeyS: false
};

// Smooth movement variables (similar to C++ physics)
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
class CollisionDetector {
    constructor() {
        this.boundingBoxes = new Map();
    }

    // Axis-Aligned Bounding Box (AABB) collision detection
    checkAABBCollision(obj1, obj2, tolerance = 0.3) {
        const box1 = this.getBoundingBox(obj1);
        const box2 = this.getBoundingBox(obj2);
        
        return (box1.minX < box2.maxX + tolerance &&
                box1.maxX > box2.minX - tolerance &&
                box1.minY < box2.maxY + tolerance &&
                box1.maxY > box2.minY - tolerance &&
                box1.minZ < box2.maxZ + tolerance &&
                box1.maxZ > box2.minZ - tolerance);
    }

    // Sphere collision detection for more precise collision
    checkSphereCollision(obj1, obj2, radius1 = 0.3, radius2 = 0.3) {
        const dx = obj1.position.x - obj2.position.x;
        const dy = obj1.position.y - obj2.position.y;
        const dz = obj1.position.z - obj2.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance < (radius1 + radius2);
    }

    // Separating Axis Theorem (SAT) for oriented bounding boxes
    checkSATCollision(obj1, obj2) {
        // Simplified SAT implementation
        const axes = [
            [1, 0, 0], [0, 1, 0], [0, 0, 1] // Main axes
        ];
        
        for (let axis of axes) {
            const proj1 = this.projectOnAxis(obj1, axis);
            const proj2 = this.projectOnAxis(obj2, axis);
            
            if (proj1.max < proj2.min || proj2.max < proj1.min) {
                return false; // Separating axis found
            }
        }
        return true; // Collision detected
    }

    projectOnAxis(obj, axis) {
        // Simplified projection calculation
        const center = obj.position;
        const size = 0.5; // Assuming uniform size
        const dot = center.x * axis[0] + center.y * axis[1] + center.z * axis[2];
        return { min: dot - size, max: dot + size };
    }

    getBoundingBox(obj) {
        const pos = obj.position;
        const size = 0.4; // Reduced half-width/height/depth for more precise collision
        return {
            minX: pos.x - size,
            maxX: pos.x + size,
            minY: pos.y - size,
            maxY: pos.y + size,
            minZ: pos.z - size,
            maxZ: pos.z + size
        };
    }

    // Continuous collision detection (CCD) for fast-moving objects
    checkCCDCollision(obj1, obj2, prevPos1, prevPos2) {
        // Linear interpolation for collision detection
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const interpPos1 = this.interpolatePosition(prevPos1, obj1.position, t);
            const interpPos2 = this.interpolatePosition(prevPos2, obj2.position, t);
            
            const dx = interpPos1.x - interpPos2.x;
            const dy = interpPos1.y - interpPos2.y;
            const dz = interpPos1.z - interpPos2.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < 0.6) { // Reduced collision distance for CCD
                return true;
            }
        }
        return false;
    }

    interpolatePosition(start, end, t) {
        return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
            z: start.z + (end.z - start.z) * t
        };
    }
}

const collisionDetector = new CollisionDetector();

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
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    // Sun (bright directional light) - optimized shadows
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024; // Reduced shadow map size
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 200; // Reduced far distance
    sunLight.shadow.camera.left = -50;
    sunLight.shadow.camera.right = 50;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0001;
    scene.add(sunLight);

    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0x87CEEB, 0.4);
    scene.add(ambientLight);

    // Sun sphere (visible sun in the sky) - reduced polygons
    const sunGeometry = new THREE.SphereGeometry(10, 8, 8);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 0.5
    });
    const sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(50, 80, 50);
    scene.add(sun);

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

    // Add initial clouds
    createInitialClouds();

    // Add initial distant mountains/hills
    createInitialMountains();
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
    loader.load('../assets/cartoon_car.glb', function (gltf) {
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

    // Audio
    engineSound = new Audio('../assets/sound.mp3');
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
    else keys[e.key] = false;
    e.preventDefault();
}

function createRoadSegment(zPosition) {
    const roadGeometry = new THREE.PlaneGeometry(10, roadLength);
    const roadTexture = new THREE.TextureLoader().load('../assets/road2.jpg');
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
    // Create a car-like obstacle using basic Three.js geometries
    const carGroup = new THREE.Group();
    
    // Car body (main rectangle)
    const bodyGeometry = new THREE.BoxGeometry(1.2, 0.4, 2);
    const bodyMaterial = obstacleMaterials[Math.floor(Math.random() * obstacleMaterials.length)];
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.2;
    carGroup.add(body);
    
    // Car roof (smaller rectangle on top)
    const roofGeometry = new THREE.BoxGeometry(0.8, 0.3, 1.2);
    const roofMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x333333
    });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 0.55;
    roof.position.z = -0.2;
    carGroup.add(roof);
    
    // Wheels (4 cylinders) - reduced polygons
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6);
    const wheelMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x222222
    });
    
    const wheelPositions = [
        { x: -0.6, y: 0.2, z: 0.6 },   // Front left
        { x: 0.6, y: 0.2, z: 0.6 },    // Front right
        { x: -0.6, y: 0.2, z: -0.6 },  // Back left
        { x: 0.6, y: 0.2, z: -0.6 }    // Back right
    ];
    
    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2; // Rotate to stand upright
        wheel.position.set(pos.x, pos.y, pos.z);
        carGroup.add(wheel);
    });
    
    // Headlights (small spheres) - reduced polygons
    const headlightGeometry = new THREE.SphereGeometry(0.1, 6, 4);
    const headlightMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffff00, 
        emissive: 0xffff00, 
        emissiveIntensity: 0.3
    });
    
    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(-0.4, 0.3, 1.1);
    carGroup.add(leftHeadlight);
    
    const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlight.position.set(0.4, 0.3, 1.1);
    carGroup.add(rightHeadlight);
    
    // Random position within road bounds
    const randomX = (Math.random() - 0.5) * 8;
    carGroup.position.set(randomX, 0, zOffset);
    carGroup.rotation.y = Math.PI; // Face towards the player
    carGroup.castShadow = true;
    carGroup.receiveShadow = true;
    
    // Add movement properties - move straight towards player (no horizontal movement)
    carGroup.movementSpeed = 0.03 + Math.random() * 0.04; // Random speed between 0.03-0.07
    carGroup.initialX = randomX;
    
    obstacles.push(carGroup);
    scene.add(carGroup);
}

function spawnObstacles() {
    if (!playerCar) return;
    const zOffset = playerCar.position.z - roadLength * 3;
    const numObstacles = Math.floor(Math.random() * 3) + 1; // 1-3 obstacles
    for (let i = 0; i < numObstacles; i++) {
        createObstacle(zOffset - i * 15);
    }
}

function updateScore() {
    if (gameOver) return;
    if (velocityZ > 0) {
        score += Math.floor(velocityZ * 15);
        document.getElementById('score-text').textContent = `Score: ${score}`;
    }
}

// Advanced collision detection using multiple algorithms
function checkCollision() {
    if (!playerCar) return;
    
    const prevPlayerPos = { x: positionX, y: 0.25, z: positionZ };
    
    obstacles.forEach((obstacle, index) => {
        const prevObstaclePos = { 
            x: obstacle.position.x, 
            y: obstacle.position.y, 
            z: obstacle.position.z 
        };
        
        // Move obstacle forward (cars coming towards player)
        obstacle.position.z += obstacle.movementSpeed;
        
        // Update obstacle movement (currently no horizontal movement)
        updateObstacleMovement(obstacle);
        
        // Multiple collision detection methods
        let collision = false;
        
        // Method 1: AABB collision
        if (collisionDetector.checkAABBCollision(playerCar, obstacle, 0.2)) {
            collision = true;
        }
        
        // Method 2: Sphere collision (more precise)
        if (collisionDetector.checkSphereCollision(playerCar, obstacle, 0.4, 0.4)) {
            collision = true;
        }
        
        // Method 3: Continuous collision detection for fast movement
        if (Math.abs(velocityZ) > 0.3) {
            if (collisionDetector.checkCCDCollision(playerCar, obstacle, prevPlayerPos, prevObstaclePos)) {
                collision = true;
            }
        }
        
        if (collision) {
            gameOver = true;
            // Show game over screen with enhanced UI
            document.getElementById('game-over-overlay').style.display = 'block';
            document.getElementById('game-over-text').style.display = 'block';
            document.getElementById('final-score').textContent = `Final Score: ${score}`;
            document.getElementById('final-score').style.display = 'block';
            document.getElementById('restart-btn').style.display = 'block';
            document.getElementById('instructions').style.display = 'none';
            if (!engineSound.paused) engineSound.pause();
        }
        
        // Remove obstacles that are out of view
        if (obstacle.position.z > playerCar.position.z + 15) {
            scene.remove(obstacle);
            obstacles.splice(index, 1);
        }
    });
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
    if (gameOver) return;
    requestAnimationFrame(animate);
    
    updateMovement();
    
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
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.restartGame = function() {
    // Hide all game over elements
    document.getElementById('game-over-overlay').style.display = 'none';
    document.getElementById('game-over-text').style.display = 'none';
    document.getElementById('final-score').style.display = 'none';
    document.getElementById('restart-btn').style.display = 'none';
    document.getElementById('instructions').style.display = 'block';
    
    // Reload the game
    location.reload();
};

document.addEventListener('DOMContentLoaded', init);
