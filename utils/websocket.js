const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Box-Muller normal distribution
function randomNormal(mean, std) {
  let u;
  do { u = Math.random(); } while (u === 0);
  const v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const PORTFOLIO_PRESETS = {
  safe_haven: { annualMeanReturn: 0.09, annualStdDev: 0.05, equity: 30, debt: 70 },
  balanced:   { annualMeanReturn: 0.13, annualStdDev: 0.10, equity: 50, debt: 50 },
  growth:     { annualMeanReturn: 0.17, annualStdDev: 0.16, equity: 80, debt: 20 },
  nifty50:    { annualMeanReturn: 0.15, annualStdDev: 0.18, equity: 100, debt: 0 },
  smallcap:   { annualMeanReturn: 0.20, annualStdDev: 0.26, equity: 100, debt: 0 },
};

const MOOD_SHIFTS = { bear: -0.06, neutral: 0, bull: 0.06 };

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    ws.clientId = clientId;
    ws.isAlive = true;

    console.log(`WS client connected: ${clientId}`);

    // Authenticate via token in query string: /ws?token=xxx
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        ws.userId = decoded.id;
      } catch {
        // Unauthenticated — still allow public simulations
      }
    }

    ws.send(JSON.stringify({ type: 'connected', clientId, authenticated: !!ws.userId }));

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData);
        handleMessage(ws, msg);
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON message.' }));
      }
    });

    ws.on('close', () => {
      console.log(`WS client disconnected: ${clientId}`);
    });

    ws.on('error', (err) => {
      console.error(`WS error (${clientId}):`, err.message);
    });
  });

  // Heartbeat — ping every 30s, close dead connections
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    case 'stream_simulation':
      streamSimulation(ws, msg.payload);
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
  }
}

// Stream simulation results in batches (feels live to the user)
async function streamSimulation(ws, payload) {
  const {
    portfolioType,
    equityPct = 50,
    annualMeanReturn = 0.13,
    annualStdDev = 0.10,
    amount = 10000,
    years = 1,
    marketMood = 'neutral',
    simCount = 1000,
    requestId,
  } = payload || {};

  const config = PORTFOLIO_PRESETS[portfolioType] || {
    equity: equityPct,
    debt: 100 - equityPct,
    annualMeanReturn,
    annualStdDev,
  };

  const moodShift = MOOD_SHIFTS[marketMood] ?? 0;
  const total = Math.min(Math.max(simCount, 100), 2000);
  const batchSize = 100;
  const buckets = [0, 0, 0, 0, 0, 0];

  ws.send(JSON.stringify({ type: 'simulation_start', requestId, total }));

  // Run in async batches so we don't block the event loop
  for (let done = 0; done < total; done += batchSize) {
    const thisBatch = Math.min(batchSize, total - done);

    for (let i = 0; i < thisBatch; i++) {
      let value = amount;
      for (let y = 0; y < years; y++) {
        const er = randomNormal(config.annualMeanReturn + moodShift, config.annualStdDev);
        const dr = randomNormal(0.065, 0.01);
        value *= (1 + (config.equity / 100) * er + (config.debt / 100) * dr);
      }
      const ret = (value - amount) / amount;
      if (ret < -0.20) buckets[0]++;
      else if (ret < -0.10) buckets[1]++;
      else if (ret < 0) buckets[2]++;
      else if (ret < 0.10) buckets[3]++;
      else if (ret < 0.20) buckets[4]++;
      else buckets[5]++;
    }

    const completed = done + thisBatch;
    const pctBuckets = buckets.map((b) => Math.round((b / completed) * 100));

    ws.send(JSON.stringify({
      type: 'simulation_progress',
      requestId,
      completed,
      total,
      progress: Math.round((completed / total) * 100),
      buckets: pctBuckets,
    }));

    // Yield to event loop between batches
    await new Promise((r) => setTimeout(r, 0));
  }

  const gained = buckets[3] + buckets[4] + buckets[5];

  ws.send(JSON.stringify({
    type: 'simulation_complete',
    requestId,
    result: {
      buckets: buckets.map((b) => Math.round((b / total) * 100)),
      gainProbability: Math.round((gained / total) * 100),
      lossProbability: Math.round(((total - gained) / total) * 100),
      simulationCount: total,
    },
  }));
}

module.exports = { setupWebSocket };
