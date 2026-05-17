// Archivo: models/familia.js

const mongoose = require('mongoose');

const familiaGlobalSchema = new mongoose.Schema({
  nombre_familia: { type: String, required: true, unique: true },
  orden: { type: String },
  tamano: { type: String },
  descripcion: { type: String },
  imagen_url: { type: String } // Aquí guardaremos el link de Cloudinary
});

module.exports = mongoose.model('FamiliaGlobal', familiaGlobalSchema);