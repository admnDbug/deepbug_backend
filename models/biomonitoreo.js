// Archivo: models/Biomonitoreo.js
const mongoose = require('mongoose');

const biomonitoreoSchema = new mongoose.Schema({
  nombre_proyecto: { type: String, required: true },
  fecha_creacion: { type: Date, default: Date.now },
  codigo_invitacion: { type: String, required: true, unique: true },
  
  // Relaciones
  zona_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Zona', required: true },
  responsable_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],
  colaboradores_id: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],

  // --- AHORA ESTO VIVE AQUÍ ---
  estado_protocolos: {
    protocolo1: { type: Number, default: 0 }, // 0=Vacío, 1=Proceso, 2=Completo
    protocolo2: { type: Number, default: 0 },
    protocolo3: { type: Number, default: 0 },
    protocolo4: { type: Number, default: 0 },
    protocolo5: { type: Number, default: 0 }
  }
});

module.exports = mongoose.model('Biomonitoreo', biomonitoreoSchema);