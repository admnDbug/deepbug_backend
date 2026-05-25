// Archivo: models/Protocolo.js
const mongoose = require('mongoose');

const protocolo5Schema = new mongoose.Schema({
  familias_encontradas: [{
    nombre_familia: String,
    valor_bmwp: Number,
    imagen_url: String,
    cantidad: { type: Number, default: 1 }
  }],
  sumatoria_total_bmwp: { type: Number, default: 0 }
});

const protocoloSchema = new mongoose.Schema({ 
  usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  estacion_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Estacion', required: true },
  fecha_llenado: { type: Date, default: Date.now },
  protocolo_numero: { type: Number, required: true, min: 1, max: 5 },
  
  datos_formulario: { type: mongoose.Schema.Types.Mixed },
  
  datos_protocolo_5: protocolo5Schema,
  
  estado: { type: String, enum: ['aprobado', 'en_conflicto', 'descartado'], default: 'aprobado' }
});

module.exports = mongoose.model('Protocolo', protocoloSchema);