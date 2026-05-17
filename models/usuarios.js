// Archivo: models/usuarios.js
const mongoose = require('mongoose');

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  institucion: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rol: { 
    type: String, 
    enum: ['Administrador', 'Responsable', 'Colaborador'], 
    required: true
  }
});

module.exports = mongoose.model('Usuario', usuarioSchema);