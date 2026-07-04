const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// Drone state
let state = {
  status: 'IDLE',
  battery: 85,
  position: { lat: 48.8584, lng: 2.2945, alt: 0 },
  speed: 0,
  heading: 0,
  target: null
};

// Telemetry endpoint
app.get('/api/telemetry', (req, res) => {
  // Simulate slight movement when flying
  if (state.status === 'FLYING') {
    state.position.lat += (Math.random() - 0.5) * 0.0001;
    state.position.lng += (Math.random() - 0.5) * 0.0001;
    state.heading = (state.heading + (Math.random() - 0.5) * 2) % 360;
    state.speed = 2 + Math.random() * 3;
  }
  res.json(state);
});

// Takeoff
app.post('/api/takeoff', (req, res) => {
  const alt = req.body.altitude || 15;
  state.status = 'FLYING';
  state.position.alt = alt;
  state.speed = 0;
  state.target = null;
  res.json({ ok: true, message: 'Taking off' });
});

// Move to waypoint
app.post('/api/move', (req, res) => {
  const { latitude, longitude, altitude, speed } = req.body;
  state.target = { lat: latitude, lng: longitude, alt: altitude };
  state.position.alt = altitude;
  state.speed = speed || 5;
  state.status = 'FLYING';
  res.json({ ok: true, message: 'Moving to waypoint' });
});

// Emergency
app.post('/api/emergency', (req, res) => {
  state.status = 'EMERGENCY';
  state.speed = 0;
  state.target = null;
  res.json({ ok: true, message: 'Emergency hover' });
});

// Land
app.post('/api/land', (req, res) => {
  state.status = 'LANDING';
  state.speed = 0;
  state.target = null;
  setTimeout(() => {
    state.status = 'IDLE';
    state.position.alt = 0;
  }, 3000);
  res.json({ ok: true, message: 'Landing' });
});

app.listen(3000, () => {
  console.log('🚁 Drone API running on http://localhost:3000');
});
