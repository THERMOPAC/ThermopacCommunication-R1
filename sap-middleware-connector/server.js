// server.js
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.send('OK');
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ SAP Middleware Connector is running on port ${PORT}`);
});