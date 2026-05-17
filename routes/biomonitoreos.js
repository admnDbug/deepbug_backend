// Archivo: routes/biomonitoreos.js
const express = require('express');
const router = express.Router();
const Biomonitoreo = require('../models/biomonitoreo');
const auth = require('../middleware/auth');
const Protocolo = require('../models/protocolo'); // Asegura la importación del modelo de protocolos

// ====================================================================
// 🔓 CORRECCIÓN: CONFIGURACIÓN DE CLOUDINARY PARA LIMPIEZA EN CASCADA
// ====================================================================
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Función auxiliar para generar un código alfanumérico aleatorio (Ej. LERM-X9)
function generarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- 1. CREAR UN NUEVO BIOMONITOREO ---
router.post('/', auth, async (req, res) => {
  try {
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'Los colaboradores no pueden crear proyectos.' });
    }
    const { nombre_proyecto, zona_id } = req.body;
    const codigo_invitacion = generarCodigo();

    const nuevoProyecto = new Biomonitoreo({
      nombre_proyecto,
      zona_id,
      codigo_invitacion,
      responsable_id: [req.usuario.id]
    });

    await nuevoProyecto.save();
    res.status(201).json({ mensaje: 'Proyecto creado exitosamente', proyecto: nuevoProyecto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el biomonitoreo' });
  }
});

// --- 2. UNIRSE A UN PROYECTO CON CÓDIGO ---
router.post('/unirse', auth, async (req, res) => {
  try {
    const { codigo_invitacion } = req.body;
    const proyecto = await Biomonitoreo.findOne({ codigo_invitacion });

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Código de invitación inválido o no existe.' });
    }

    const userIdText = req.usuario.id.toString();
    const yaEsColaborador = proyecto.colaboradores_id.some(id => id.toString() === userIdText);
    const yaEsResponsable = proyecto.responsable_id.some(id => id.toString() === userIdText);

    if (yaEsColaborador || yaEsResponsable) {
      return res.status(400).json({ mensaje: 'Ya eres miembro de este proyecto.' });
    }

    proyecto.colaboradores_id.push(req.usuario.id);
    await proyecto.save();
    res.json({ mensaje: 'Te has unido al proyecto exitosamente', proyecto });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al unirse al proyecto' });
  }
});

// --- 3. OBTENER MIS PROYECTOS (DASHBOARD) ---
router.get('/', auth, async (req, res) => {
  try {
    const misProyectos = await Biomonitoreo.find({
      $or: [
        { responsable_id: req.usuario.id },
        { colaboradores_id: req.usuario.id }
      ]
    })
    .populate('zona_id', 'nombre')
    .populate('responsable_id', 'nombre')
    .populate('colaboradores_id', 'nombre')
    .sort({ fecha_creacion: -1 });

    res.json(misProyectos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los proyectos' });
  }
});

// --- 4. REMOVER COLABORADOR ---
router.put('/:id/remover-colaborador', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { colaborador_id } = req.body;

    const biomonitoreo = await Biomonitoreo.findById(id);
    if (!biomonitoreo) return res.status(404).json({ mensaje: 'Proyecto no encontrado' });

    if (!biomonitoreo.responsable_id.some(id => id.toString() === req.usuario.id.toString())) {
      return res.status(403).json({ mensaje: 'Solo el Responsable puede eliminar colaboradores' });
    }

    biomonitoreo.colaboradores_id = biomonitoreo.colaboradores_id.filter(
      colab => colab.toString() !== colaborador_id
    );

    await biomonitoreo.save();
    res.json({ mensaje: 'Colaborador removido exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al remover colaborador' });
  }
});

// --- 5. OBTENER UN SOLO PROYECTO POR ID ---
router.get('/:id', auth, async (req, res) => {
  try {
    const proyecto = await Biomonitoreo.findById(req.params.id)
      .populate('zona_id', 'nombre catalogo_familias')
      .populate('responsable_id', 'nombre email')
      .populate('colaboradores_id', 'nombre email');

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }
    res.json(proyecto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener el proyecto' });
  }
});

// --- 6. OBTENER TODOS LOS PROYECTOS PARA CONSULTAS ---
router.get('/consultas/todos', auth, async (req, res) => {
  try {
    const todosLosProyectos = await Biomonitoreo.find({})
    .populate('zona_id', 'nombre ubicacion coordenadas')
    .populate('responsable_id', 'nombre');

    const proyectosConBMWP = await Promise.all(todosLosProyectos.map(async (proyecto) => {
      let proyectoObj = proyecto.toObject();
      proyectoObj.bmwp_total = null;

      if (proyecto.estado_protocolos && proyecto.estado_protocolos.protocolo5 > 0) {
        const proto5 = await Protocolo.findOne({ 
            biomonitoreo_id: proyecto._id, 
            protocolo_numero: 5,
            estado: 'aprobado'
        });

        if (proto5 && proto5.datos_protocolo_5) {
             proyectoObj.bmwp_total = proto5.datos_protocolo_5.sumatoria_total_bmwp;
        }
      }
      return proyectoObj;
    }));

    res.json(proyectosConBMWP);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener todos los proyectos para consulta' });
  }
});

// --- 7. ELIMINAR UN PROYECTO COMPLETO (CON PURGA EN CASCADA COMPLETA DE IMÁGENES) ---
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const proyecto = await Biomonitoreo.findById(id);

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }

    // 🔒 Seguridad: Verificamos que el que pide eliminar sea legalmente responsable
    const userIdText = req.usuario.id.toString();
    const esResponsable = proyecto.responsable_id.some(respId => respId.toString() === userIdText);

    if (!esResponsable) {
      return res.status(403).json({ mensaje: 'Solo el responsable puede eliminar este proyecto.' });
    }

    // A) Encontrar todos los protocolos vinculados a este proyecto para raspar sus fotos
    const protocolosAsociados = await Protocolo.find({ biomonitoreo_id: id });
    console.log(`[Purga Global] Iniciando limpieza de imágenes para el proyecto: ${id}`);
    
    // B) Iteramos cada protocolo para destruir las evidencias en Cloudinary
    for (const protocolo of protocolosAsociados) { // <-- CORREGIDO: Cambiado de CleanProtos a protocolosAsociados
      const urlsAELiminar = [];
      
      // Fotos de Protocolos del 1 al 4
      if (protocolo.datos_formulario) {
        if (protocolo.datos_formulario.foto_url) urlsAELiminar.push(protocolo.datos_formulario.foto_url);
        if (protocolo.datos_formulario.imagen_url) urlsAELiminar.push(protocolo.datos_formulario.imagen_url);
      }
      
      // Fotos de las muestras del Protocolo 5
      if (protocolo.datos_protocolo_5 && protocolo.datos_protocolo_5.familias_encontradas) {
        protocolo.datos_protocolo_5.familias_encontradas.forEach(f => {
          if (f.imagen_url) urlsAELiminar.push(f.imagen_url);
        });
      }

      // Proceso físico de demolición de archivos en la nube
      for (const url of urlsAELiminar) {
        const parts = url.split('/upload/');
        if (parts.length >= 2) {
          const publicIdWithExt = parts[1].replace(/^v\d+\//, '');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));
          try {
            console.log(`[Cloudinary Cascading] Destruyendo: ${publicId}`);
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error(`Error borrando ${publicId} de Cloudinary:`, err);
          }
        }
      }
    }

    // C) Borramos de raíz los registros lógicos en MongoDB
    await Protocolo.deleteMany({ biomonitoreo_id: id });
    await Biomonitoreo.findByIdAndDelete(id);

    res.json({ mensaje: '¡Éxito! El biomonitoreo, todos sus protocolos y sus respectivas imágenes en Cloudinary han sido eliminados de raíz de forma segura.' });
  } catch (error) {
    console.error("Error en borrado en cascada:", error);
    res.status(500).json({ mensaje: 'Error al eliminar el proyecto' });
  }
});

// --- 8. SALIR DE UN PROYECTO (VOLUNTARIAMENTE) ---
router.put('/:id/salir', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const biomonitoreo = await Biomonitoreo.findById(id);

    if (!biomonitoreo) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }

    const userIdText = req.usuario.id.toString();
    const esColaborador = biomonitoreo.colaboradores_id.some(colab => colab.toString() === userIdText);

    if (!esColaborador) {
      return res.status(400).json({ mensaje: 'No eres colaborador de este proyecto o ya saliste.' });
    }

    biomonitoreo.colaboradores_id = biomonitoreo.colaboradores_id.filter(colab => colab.toString() !== userIdText);
    await biomonitoreo.save();
    
    res.json({ mensaje: 'Has salido del proyecto exitosamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al intentar salir del proyecto.' });
  }
});

module.exports = router;