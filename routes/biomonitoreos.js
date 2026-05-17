// Archivo: routes/biomonitoreos.js
const express = require('express');
const router = express.Router();
const Biomonitoreo = require('../models/biomonitoreo');
const auth = require('../middleware/auth');

// Función auxiliar para generar un código alfanumérico aleatorio (Ej. LERM-X9)
function generarCodigo() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// --- 1. CREAR UN NUEVO BIOMONITOREO ---
// URL: POST http://localhost:3000/api/biomonitoreos
router.post('/', auth, async (req, res) => {
  try {
    // REGLA: Solo Administradores o Responsables pueden crear
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'Los colaboradores no pueden crear proyectos.' });
    }

    const { nombre_proyecto, zona_id } = req.body;

    // Generamos el código único de invitación
    const codigo_invitacion = generarCodigo();

    const nuevoProyecto = new Biomonitoreo({
      nombre_proyecto,
      zona_id,
      codigo_invitacion,
      responsable_id: [req.usuario.id] // El creador se vuelve el responsable automáticamente
    });

    await nuevoProyecto.save();
    
    res.status(201).json({ 
      mensaje: 'Proyecto creado exitosamente', 
      proyecto: nuevoProyecto 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear el biomonitoreo' });
  }
});

// --- 2. UNIRSE A UN PROYECTO CON CÓDIGO ---
// URL: POST http://localhost:3000/api/biomonitoreos/unirse
router.post('/unirse', auth, async (req, res) => {
  try {
    const { codigo_invitacion } = req.body;

    // Buscamos si existe un proyecto con ese código
    const proyecto = await Biomonitoreo.findOne({ codigo_invitacion });

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Código de invitación inválido o no existe.' });
    }

    // APLICAMOS TOSTRING() PARA COMPARAR DE FORMA SEGURA
    const userIdText = req.usuario.id.toString();
    
    // Verificamos en el arreglo de colaboradores usando .some()
    const yaEsColaborador = proyecto.colaboradores_id.some(id => id.toString() === userIdText);
    
    // Verificamos al responsable directamente
    const yaEsResponsable = proyecto.responsable_id.toString() === userIdText;

    if (yaEsColaborador || yaEsResponsable) {
      return res.status(400).json({ mensaje: 'Ya eres miembro de este proyecto.' });
    }

    // Si todo está bien, agregamos su ID a la lista de colaboradores
    proyecto.colaboradores_id.push(req.usuario.id);
    await proyecto.save();

    res.json({ mensaje: 'Te has unido al proyecto exitosamente', proyecto });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al unirse al proyecto' });
  }
});

// --- 3. OBTENER MIS PROYECTOS (DASHBOARD) ---
// URL: GET http://localhost:3000/api/biomonitoreos
router.get('/', auth, async (req, res) => {
  try {
    // Buscamos los proyectos donde el usuario sea responsable O colaborador
    const misProyectos = await Biomonitoreo.find({
      $or: [
        { responsable_id: req.usuario.id },
        { colaboradores_id: req.usuario.id }
      ]
    })
    .populate('zona_id', 'nombre') // Populate nos trae el nombre de la zona, no solo su ID
    .populate('responsable_id', 'nombre') // Trae los nombres de los responsables
    .populate('colaboradores_id', 'nombre') // Trae los nombres de los colaboradores
    .sort({ fecha_creacion: -1 });

    res.json(misProyectos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los proyectos' });
  }
});

// --- 4. REMOVER COLABORADOR ---
// URL: PUT http://localhost:3000/api/biomonitoreos/:id/remover-colaborador
router.put('/:id/remover-colaborador', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { colaborador_id } = req.body;

    const biomonitoreo = await Biomonitoreo.findById(id);
    if (!biomonitoreo) return res.status(404).json({ mensaje: 'Proyecto no encontrado' });

    // Verificar que el que hace la petición es el Responsable
    if (biomonitoreo.responsable_id.toString() !== req.usuario.id) {
      return res.status(403).json({ mensaje: 'Solo el Responsable puede eliminar colaboradores' });
    }

    // Filtramos el arreglo para quitar al colaborador (usamos toString para comparar bien los ObjectIds)
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
// URL: GET http://localhost:3000/api/biomonitoreos/:id
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

// --- 6. OBTENER TODOS LOS PROYECTOS PARA CONSULTAS (INCLUYENDO PROPIOS) ---
// URL: GET http://localhost:3000/api/biomonitoreos/consultas/todos
router.get('/consultas/todos', auth, async (req, res) => {
  try {
    // REMOVEMOS EL FILTRO para traer absolutamente TODOS los proyectos de la base de datos
    const todosLosProyectos = await Biomonitoreo.find({})
    .populate('zona_id', 'nombre ubicacion coordenadas') // Traemos las coordenadas y datos de la zona
    .populate('responsable_id', 'nombre'); // Para mostrar el responsable en la tabla

    const Protocolo = require('../models/protocolo');

    // Buscamos el BMWP (Protocolo 5) para cada uno de los proyectos
    const proyectosConBMWP = await Promise.all(todosLosProyectos.map(async (proyecto) => {
      let proyectoObj = proyecto.toObject();
      proyectoObj.bmwp_total = null; // Por defecto null si no se ha evaluado el protocolo 5

      if (proyecto.estado_protocolos.protocolo5 > 0) {
        const proto5 = await Protocolo.findOne({ 
            biomonitoreo_id: proyecto._id, 
            protocolo_numero: 5 
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

// --- 7. ELIMINAR UN PROYECTO COMPLETO ---
// URL: DELETE http://localhost:3000/api/biomonitoreos/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const proyecto = await Biomonitoreo.findById(id);

    if (!proyecto) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }

    // Seguridad: Verificamos que el que pide eliminar sea el responsable
    const userIdText = req.usuario.id.toString();
    const esResponsable = proyecto.responsable_id.some(respId => respId.toString() === userIdText);

    if (!esResponsable) {
      return res.status(403).json({ mensaje: 'Solo el responsable puede eliminar este proyecto.' });
    }

    // 1. Eliminamos el proyecto
    await Biomonitoreo.findByIdAndDelete(id);
    
    // 2. Eliminamos todos los protocolos asociados a este proyecto (Limpieza)
    const Protocolo = require('../models/protocolo'); // Importamos el modelo
    await Protocolo.deleteMany({ biomonitoreo_id: id });

    res.json({ mensaje: 'Proyecto y protocolos eliminados correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar el proyecto' });
  }
});
// --- 8. SALIR DE UN PROYECTO (VOLUNTARIAMENTE) ---
// URL: PUT http://localhost:3000/api/biomonitoreos/:id/salir
router.put('/:id/salir', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const biomonitoreo = await Biomonitoreo.findById(id);

    if (!biomonitoreo) {
      return res.status(404).json({ mensaje: 'Proyecto no encontrado' });
    }

    const userIdText = req.usuario.id.toString();

    // Verificamos si realmente es un colaborador
    const esColaborador = biomonitoreo.colaboradores_id.some(
      colab => colab.toString() === userIdText
    );

    if (!esColaborador) {
      return res.status(400).json({ mensaje: 'No eres colaborador de este proyecto o ya saliste.' });
    }

    // Lo filtramos de la lista de colaboradores
    biomonitoreo.colaboradores_id = biomonitoreo.colaboradores_id.filter(
      colab => colab.toString() !== userIdText
    );

    await biomonitoreo.save();
    
    res.json({ mensaje: 'Has salido del proyecto exitosamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al intentar salir del proyecto.' });
  }
});
module.exports = router;