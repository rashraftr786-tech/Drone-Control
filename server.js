/**
 * Fake Drone Server with Camera & Gimbal Simulation
 * Run: node server.js
 * Dependencies: express, cors
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// Drone state (including camera/gimbal)
// ------------------------------------------------------------------
const drone = {
  id: 'drone-001',
  status: 'IDLE',            // IDLE, FLYING, LANDING, EMERGENCY
  battery: 85.0,
  position: { lat: 48.8584, lng: 2.2945, alt: 0.0 },
  speed: 0.0,
  heading: 0.0,
  target: null,
  moveSpeed: 0.0,
  isArmed: false,
  lastUpdate: Date.now(),

  // Camera & gimbal
  camera: {
    isRecording: false,
    photoCount: 0,
    videoCount: 0,
    gimbalPitch: 0      // degrees, 0 = horizontal, negative = down
  }
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// ------------------------------------------------------------------
// Telemetry update (every second)
// ------------------------------------------------------------------
function updateTelemetry() {
  const now = Date.now();
  const dt = (now - drone.lastUpdate) / 1000;
  drone.lastUpdate = now;

  // Movement logic (same as before)
  if (drone.status === 'FLYING' && drone.target) {
    const { lat: tLat, lng: tLng, alt: tAlt } = drone.target;
    const { lat, lng, alt } = drone.position;
    const latDiff = tLat - lat;
    const lngDiff = tLng - lng;
    const altDiff = tAlt - alt;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff + altDiff * altDiff);
    if (distance > 0.0001) {
      const step = drone.moveSpeed * dt * 0.00001;
      const ratio = Math.min(step / distance, 1.0);
      drone.position.lat += latDiff * ratio;
      drone.position.lng += lngDiff * ratio;
      drone.position.alt += altDiff * ratio;
    } else {
      drone.target = null;
      drone.moveSpeed = 0;
      drone.speed = 0;
    }
    // Update heading
    if (Math.abs(latDiff) > 0.00001 || Math.abs(lngDiff) > 0.00001) {
      drone.heading = Math.atan2(lngDiff, latDiff) * (180 / Math.PI);
      if (drone.heading < 0) drone.heading += 360;
    }
    // drift
    drone.position.lat += (Math.random() - 0.5) * 0.000005;
    drone.position.lng += (Math.random() - 0.5) * 0.000005;
  } else if (drone.status === 'FLYING') {
    drone.position.lat += (Math.random() - 0.5) * 0.000002;
    drone.position.lng += (Math.random() - 0.5) * 0.000002;
    drone.position.alt += (Math.random() - 0.5) * 0.02;
    drone.position.alt = Math.max(0, drone.position.alt);
  }

  // Battery drain
  if (drone.status === 'FLYING') {
    drone.battery -= 0.002 * dt;
  } else {
    drone.battery -= 0.0005 * dt;
  }
  drone.battery = clamp(drone.battery, 0, 100);
  drone.speed = (drone.status === 'FLYING' && drone.target) ? drone.moveSpeed : 0;
}

setInterval(updateTelemetry, 1000);

// ------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------

// GET /telemetry – full state
app.get('/api/telemetry', (req, res) => {
  res.json({
    id: drone.id,
    status: drone.status,
    battery: Math.round(drone.battery * 10) / 10,
    position: drone.position,
    speed: drone.speed,
    heading: Math.round(drone.heading * 10) / 10,
    isArmed: drone.isArmed,
    target: drone.target,
    camera: drone.camera,
    timestamp: new Date().toISOString()
  });
});

// GET /battery
app.get('/api/battery', (req, res) => {
  res.json({
    battery: Math.round(drone.battery * 10) / 10,
    voltage: 16.2 + randomBetween(-0.3, 0.3),
    current: 2.0 + randomBetween(0, 1.0)
  });
});

// POST /takeoff
app.post('/api/takeoff', (req, res) => {
  if (drone.status === 'FLYING') {
    return res.status(409).json({ error: 'Already flying' });
  }
  const altitude = req.body.altitude || 10;
  if (altitude < 1) return res.status(400).json({ error: 'Altitude must be >=1m' });
  drone.status = 'FLYING';
  drone.isArmed = true;
  drone.position.alt = altitude;
  drone.target = null;
  drone.speed = 0;
  drone.moveSpeed = 0;
  res.json({ status: 'success', message: `Taking off to ${altitude}m` });
});

// POST /land
app.post('/api/land', (req, res) => {
  if (drone.status === 'IDLE') return res.status(409).json({ error: 'Already on ground' });
  drone.status = 'IDLE';
  drone.isArmed = false;
  drone.position.alt = 0;
  drone.target = null;
  drone.speed = 0;
  drone.moveSpeed = 0;
  // Stop recording if active
  if (drone.camera.isRecording) {
    drone.camera.isRecording = false;
    drone.camera.videoCount++;
  }
  res.json({ status: 'success', message: 'Landing' });
});

// POST /move
app.post('/api/move', (req, res) => {
  const { latitude, longitude, altitude, speed } = req.body;
  if (drone.status !== 'FLYING') return res.status(409).json({ error: 'Not flying' });
  if (latitude === undefined || longitude === undefined || altitude === undefined) {
    return res.status(400).json({ error: 'Missing lat/lng/alt' });
  }
  const moveSpeed = speed || 5;
  if (moveSpeed <= 0) return res.status(400).json({ error: 'Speed must be >0' });
  drone.target = { lat: latitude, lng: longitude, alt: altitude };
  drone.moveSpeed = moveSpeed;
  res.json({ status: 'success', message: `Moving to (${latitude}, ${longitude}, ${altitude}m)` });
});

// POST /emergency
app.post('/api/emergency', (req, res) => {
  if (drone.status === 'IDLE') return res.status(409).json({ error: 'Already idle' });
  drone.status = 'EMERGENCY';
  drone.target = null;
  drone.moveSpeed = 0;
  drone.speed = 0;
  if (drone.camera.isRecording) {
    drone.camera.isRecording = false;
    drone.camera.videoCount++;
  }
  res.json({ status: 'success', message: 'Emergency hover' });
});

// ------------------------------------------------------------------
// Camera & Gimbal Endpoints
// ------------------------------------------------------------------

// POST /camera/photo – take a photo
app.post('/api/camera/photo', (req, res) => {
  if (drone.status === 'IDLE') {
    return res.status(409).json({ error: 'Drone not flying' });
  }
  drone.camera.photoCount++;
  const photoId = `photo_${Date.now()}`;
  res.json({
    status: 'success',
    message: 'Photo captured',
    photoId,
    url: `/media/${photoId}.jpg` // dummy
  });
});

// POST /camera/video/start – start recording
app.post('/api/camera/video/start', (req, res) => {
  if (drone.status === 'IDLE') {
    return res.status(409).json({ error: 'Drone not flying' });
  }
  if (drone.camera.isRecording) {
    return res.status(409).json({ error: 'Already recording' });
  }
  drone.camera.isRecording = true;
  res.json({ status: 'success', message: 'Video recording started' });
});

// POST /camera/video/stop – stop recording
app.post('/api/camera/video/stop', (req, res) => {
  if (!drone.camera.isRecording) {
    return res.status(409).json({ error: 'Not recording' });
  }
  drone.camera.isRecording = false;
  drone.camera.videoCount++;
  const videoId = `video_${Date.now()}`;
  res.json({
    status: 'success',
    message: 'Recording stopped',
    videoId,
    url: `/media/${videoId}.mp4`
  });
});

// GET /gimbal/status – current gimbal pitch
app.get('/api/gimbal/status', (req, res) => {
  res.json({
    pitch: drone.camera.gimbalPitch,
    range: { min: -90, max: 90 }
  });
});

// POST /gimbal/pitch – set gimbal pitch angle (degrees)
app.post('/api/gimbal/pitch', (req, res) => {
  const { angle } = req.body;
  if (angle === undefined) return res.status(400).json({ error: 'Missing angle' });
  const pitch = clamp(parseFloat(angle), -90, 90);
  drone.camera.gimbalPitch = pitch;
  res.json({
    status: 'success',
    message: `Gimbal pitch set to ${pitch}°`,
    pitch
  });
});

// ------------------------------------------------------------------
// Start server
// ------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚁 Fake Drone Server running on http://localhost:${PORT}`);
  console.log(`   Camera & Gimbal controls available.`);
});
