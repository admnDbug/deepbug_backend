// Archivo: models/Biomonitoreo.js (Puedes renombrarlo a Estacion.js si lo deseas)
const mongoose = require('mongoose');

const estacionSchema = new mongoose.Schema({
  nombre_estacion: { type: String, required: true }, // Antes nombre_proyecto
  fecha_creacion: { type: Date, default: Date.now },
  codigo_invitacion: { type: String, required: true, unique: true },
  
  // Relaciones
  zona_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Zona', required: true },
  responsable_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
  colaboradores_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],

  estado_protocolos: {
    protocolo1: { type: Number, default: 0 },
    protocolo2: { type: Number, default: 0 },
    protocolo3: { type: Number, default: 0 },
    protocolo4: { type: Number, default: 0 },
    protocolo5: { type: Number, default: 0 }
  }
});

module.exports = mongoose.model('Estacion', estacionSchema, 'estaciones');