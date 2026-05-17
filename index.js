// Archivo: index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth'); // Rutas de autenticación (registro y login)
const zonasRoutes = require('./routes/zonas'); 
const biomonitoreosRoutes = require('./routes/biomonitoreos');
const protocolosRoutes = require('./routes/protocolos');
const familiasRoutes = require('./routes/familias');


const app = express();

// --- MIDDLEWARES ---
// cors() permite que el frontend web (React) se conecte sin bloqueos de seguridad
app.use(cors()); 
// Permite que el servidor entienda los JSON que le mande la app de Flutter o la Web
app.use(express.json({ limit: '50mb' })); // Límite alto por si mandamos fotos en base64
// Para guardar las familias
app.use('/api/familias', familiasRoutes);

// --- CONEXIÓN A LA BASE DE DATOS (MONGODB) ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deep_bug_db';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Conectado a la Base de Datos MongoDB exitosamente'))
  .catch((err) => console.error('Error conectando a MongoDB:', err));

// --- RUTAS DE PRUEBA ---
app.get('/', (req, res) => {
  res.send('¡El servidor de Deep Bug está vivo!');
});

// --- RUTAS DE LA API ---
app.use('/api/auth', authRoutes);
app.use('/api/zonas', zonasRoutes); 
app.use('/api/biomonitoreos', biomonitoreosRoutes);
app.use('/api/protocolos', protocolosRoutes);

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});