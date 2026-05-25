// Archivo: models/familia.js

const mongoose = require('mongoose');

const familiaGlobalSchema = new mongoose.Schema({
  nombre_familia: { type: String, required: true, unique: true },
  orden: { type: String },
  tamano: { type: String },
  descripcion: { type: String },
  imagen_url: { type: String }
});

module.exports = mongoose.model('FamiliaGlobal', familiaGlobalSchema);