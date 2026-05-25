// Archivo: models/zonas.js
const mongoose = require('mongoose');

const familiaSchema = new mongoose.Schema({
  nombre_familia: { type: String, required: true },
  orden: { type: String },
  valor_bmwp: { type: Number, required: true },
  tamano: { type: Number },
  imagen_url: { type: String }
});

const zonaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  coordenadas: { type: String }, 
  ubicacion: { type: String },   
  catalogo_familias: [familiaSchema] 
});

module.exports = mongoose.model('Zona', zonaSchema);