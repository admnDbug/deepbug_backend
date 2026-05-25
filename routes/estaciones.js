// Archivo: routes/estaciones.js
const express = require('express');
const router = express.Router();
// 1. CORRECCIÓN: El modelo SIEMPRE se importa con Mayúscula inicial
const Estacion = require('../models/estacion'); 
const auth = require('../middleware/auth');
const Protocolo = require('../models/protocolo'); 

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function generarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- 1. CREAR UNA NUEVA ESTACIÓN ---
router.post('/', auth, async (req, res) => {
  try {
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'Los colaboradores no pueden crear estaciones.' });
    }
    // 2. CORRECCIÓN: Ahora recibimos nombre_estacion
    const { nombre_estacion, zona_id } = req.body; 
    const codigo_invitacion = generarCodigo();

    const nuevaEstacion = new Estacion({
      nombre_estacion,
      zona_id,
      codigo_invitacion,
      responsable_id: [req.usuario.id]
    });

    await nuevaEstacion.save();
    res.status(201).json({ mensaje: 'Estación creada exitosamente', estacion: nuevaEstacion });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear la estación' });
  }
});

// --- 2. UNIRSE A UNA ESTACIÓN CON CÓDIGO ---
router.post('/unirse', auth, async (req, res) => {
  try {
    const { codigo_invitacion } = req.body;
    const estacionDoc = await Estacion.findOne({ codigo_invitacion });

    if (!estacionDoc) {
      return res.status(404).json({ mensaje: 'Código de invitación inválido o no existe.' });
    }

    const userIdText = req.usuario.id.toString();
    const yaEsColaborador = estacionDoc.colaboradores_id.some(id => id.toString() === userIdText);
    const yaEsResponsable = estacionDoc.responsable_id.some(id => id.toString() === userIdText);

    if (yaEsColaborador || yaEsResponsable) {
      return res.status(400).json({ mensaje: 'Ya eres miembro de esta estación.' });
    }

    estacionDoc.colaboradores_id.push(req.usuario.id);
    await estacionDoc.save();
    res.json({ mensaje: 'Te has unido a la estación exitosamente', estacion: estacionDoc });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al unirse a la estación' });
  }
});

// --- 3. OBTENER MIS ESTACIONES (DASHBOARD) ---
router.get('/', auth, async (req, res) => {
  try {
    const misEstaciones = await Estacion.find({
      $or: [
        { responsable_id: req.usuario.id },
        { colaboradores_id: req.usuario.id }
      ]
    })
    .populate('zona_id', 'nombre ubicacion')
    .populate('responsable_id', 'nombre')
    .populate('colaboradores_id', 'nombre')
    .sort({ fecha_creacion: -1 });

    res.json(misEstaciones);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener las estaciones' });
  }
});

// --- 4. OBTENER DATOS PARA EL MAPA DEL DASHBOARD (COORDS P2 + BMWP P5) ---
router.get('/mapa-datos', auth, async (req, res) => {
  try {
    const estaciones = await Estacion.find({})
      .populate('zona_id', 'nombre')
      .populate('responsable_id', 'nombre');

    const estacionesParaMapa = await Promise.all(estaciones.map(async (estacionDoc) => {
      let obj = estacionDoc.toObject();
      obj.bmwp_total = null;
      obj.latitud = null;
      obj.longitud = null;

      const p2 = await Protocolo.findOne({ 
        estacion_id: estacionDoc._id, 
        protocolo_numero: 2 
      });
      
      if (p2 && p2.datos_formulario && p2.datos_formulario.textos) {
        obj.latitud = parseFloat(p2.datos_formulario.textos.latitud);
        obj.longitud = parseFloat(p2.datos_formulario.textos.longitud);
      }

      if (estacionDoc.estado_protocolos && estacionDoc.estado_protocolos.protocolo5 > 0) {
        const p5 = await Protocolo.findOne({ 
            estacion_id: estacionDoc._id, 
            protocolo_numero: 5,
            //estado: 'aprobado'
        });
        if (p5 && p5.datos_protocolo_5) {
             obj.bmwp_total = p5.datos_protocolo_5.sumatoria_total_bmwp;
        }
      }
      return obj;
    }));

    res.json(estacionesParaMapa);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener datos para el mapa geográfico' });
  }
});

// --- 5. REMOVER COLABORADOR ---
router.put('/:id/remover-colaborador', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { colaborador_id } = req.body;

    const estacionDoc = await Estacion.findById(id);
    if (!estacionDoc) return res.status(404).json({ mensaje: 'Estación no encontrada' });

    if (!estacionDoc.responsable_id.some(id => id.toString() === req.usuario.id.toString())) {
      return res.status(403).json({ mensaje: 'Solo el Responsable puede eliminar colaboradores' });
    }

    estacionDoc.colaboradores_id = estacionDoc.colaboradores_id.filter(
      colab => colab.toString() !== colaborador_id
    );

    await estacionDoc.save();
    res.json({ mensaje: 'Colaborador removido exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al remover colaborador' });
  }
});

// --- 6. OBTENER UNA SOLA ESTACIÓN POR ID ---
router.get('/:id', auth, async (req, res) => {
  try {
    const estacionDoc = await Estacion.findById(req.params.id)
      .populate('zona_id', 'nombre catalogo_familias')
      .populate('responsable_id', 'nombre email')
      .populate('colaboradores_id', 'nombre email');

    if (!estacionDoc) {
      return res.status(404).json({ mensaje: 'Estación no encontrada' });
    }
    res.json(estacionDoc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener la estación' });
  }
});

// --- 7. ELIMINAR UNA ESTACIÓN COMPLETA (CON PURGA EN CASCADA COMPLETA DE IMÁGENES) ---
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const estacionDoc = await Estacion.findById(id);

    if (!estacionDoc) {
      return res.status(404).json({ mensaje: 'Estación no encontrada' });
    }

    const userIdText = req.usuario.id.toString();
    const esResponsable = estacionDoc.responsable_id.some(respId => respId.toString() === userIdText);

    if (!esResponsable) {
      return res.status(403).json({ mensaje: 'Solo el responsable puede eliminar esta estación.' });
    }

    const protocolosAsociados = await Protocolo.find({ estacion_id: id });
    console.log(`[Purga Global] Iniciando limpieza de imágenes para la estación: ${id}`);
    
    for (const protocolo of protocolosAsociados) { 
      const urlsAELiminar = [];
      
      if (protocolo.datos_formulario) {
        if (protocolo.datos_formulario.foto_url) urlsAELiminar.push(protocolo.datos_formulario.foto_url);
        if (protocolo.datos_formulario.imagen_url) urlsAELiminar.push(protocolo.datos_formulario.imagen_url);
      }
      
      if (protocolo.datos_protocolo_5 && protocolo.datos_protocolo_5.familias_encontradas) {
        protocolo.datos_protocolo_5.familias_encontradas.forEach(f => {
          if (f.imagen_url) urlsAELiminar.push(f.imagen_url);
        });
      }

      for (const url of urlsAELiminar) {
        const parts = url.split('/upload/');
        if (parts.length >= 2) {
          const publicIdWithExt = parts[1].replace(/^v\d+\//, '');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error(`Error borrando ${publicId} de Cloudinary:`, err);
          }
        }
      }
    }

    await Protocolo.deleteMany({ estacion_id: id });
    await Estacion.findByIdAndDelete(id);

    res.json({ mensaje: '¡Éxito! La estación, todos sus protocolos y sus respectivas imágenes han sido eliminados de raíz.' });
  } catch (error) {
    console.error("Error en borrado en cascada:", error);
    res.status(500).json({ mensaje: 'Error al eliminar la estación' });
  }
});

// --- 8. SALIR DE UNA ESTACIÓN (VOLUNTARIAMENTE) ---
router.put('/:id/salir', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const estacionDoc = await Estacion.findById(id);

    if (!estacionDoc) {
      return res.status(404).json({ mensaje: 'Estación no encontrada' });
    }

    const userIdText = req.usuario.id.toString();
    const esColaborador = estacionDoc.colaboradores_id.some(colab => colab.toString() === userIdText);

    if (!esColaborador) {
      return res.status(400).json({ mensaje: 'No eres colaborador de esta estación o ya saliste.' });
    }

    estacionDoc.colaboradores_id = estacionDoc.colaboradores_id.filter(colab => colab.toString() !== userIdText);
    await estacionDoc.save();
    
    res.json({ mensaje: 'Has salido de la estación exitosamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al intentar salir de la estación.' });
  }
});

module.exports = router;