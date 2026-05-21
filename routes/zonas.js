// Archivo: routes/zonas.js
const express = require('express');
const router = express.Router();
const Zona = require('../models/zonas'); 
const auth = require('../middleware/auth'); 
const upload = require('../middleware/upload');


// --- 1. OBTENER TODAS LAS ZONAS Y SUS CATÁLOGOS ---
router.get('/', auth, async (req, res) => {
  try {
    // BLOQUEO DE SEGURIDAD: Los colaboradores no tienen por qué ver el catálogo raíz
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ 
        mensaje: 'Acceso denegado. Solo los Responsables o Administradores pueden acceder a los catálogos geográficos.' 
      });
    }

    const zonas = await Zona.find();
    res.json(zonas);
    
  } catch (error) {
    console.error("Error al obtener las zonas:", error);
    res.status(500).json({ mensaje: 'Error interno al cargar el catálogo de zonas' });
  }
});

// --- 2. CREAR UNA NUEVA ZONA ---
router.post('/', auth, async (req, res) => {
  try {
    // REGLA DE NEGOCIO: Solo Responsable o Administrador pueden crear Zonas
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'No tienes permisos para crear zonas o catálogos.' });
    }

    const nuevaZona = new Zona(req.body);
    await nuevaZona.save();
    
    res.status(201).json({ mensaje: 'Zona creada exitosamente', zona: nuevaZona });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear la zona' });
  }
});

// --- RUTA PARA AGREGAR UNA FAMILIA A UNA ZONA EXISTENTE (CON IMAGEN) ---
// (Mantenemos esta ruta por si la usas en otra parte de tu sistema con Multer)
router.post('/:zonaId/familia', [auth, upload.single('imagen')], async (req, res) => {
  try {
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'No tienes permisos para modificar catálogos.' });
    }

    const { zonaId } = req.params;
    const { nombre_familia, orden, valor_bmwp, tamano } = req.body;

    if (!req.file) {
      return res.status(400).json({ mensaje: 'Debes incluir una imagen para la familia.' });
    }

    const zona = await Zona.findById(zonaId);
    if (!zona) return res.status(404).json({ mensaje: 'Zona no encontrada' });

    const nuevaFamilia = {
      nombre_familia,
      orden,
      valor_bmwp,
      tamano,
      imagen_url: req.file.path
    };

    zona.catalogo_familias.push(nuevaFamilia);
    await zona.save();

    res.json({ mensaje: 'Familia agregada al catálogo', zona });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al subir familia' });
  }
});

// --- 3. ELIMINAR UNA ZONA ---
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'No tienes permisos para eliminar zonas.' });
    }

    const { id } = req.params;
    const zonaEliminada = await Zona.findByIdAndDelete(id);

    if (!zonaEliminada) {
      return res.status(404).json({ mensaje: 'Zona no encontrada.' });
    }

    res.json({ mensaje: 'Zona eliminada correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar la zona.' });
  }
});

// --- OBTENER UNA ZONA INDIVIDUAL POR ID (Para precarga en el Frontend) ---
router.get('/:id', auth, async (req, res) => {
  try {
    const zona = await Zona.findById(req.params.id);
    if (!zona) return res.status(404).json({ mensaje: 'Zona no encontrada' });
    res.json(zona);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener la zona' });
  }
});

// --- MODIFICAR CONFIGURACIÓN GENERAL DE UNA ZONA EXISTENTE (PUT) ---
// *MODIFICADO*: Ya no actualiza el array de familias, solo los datos generales
router.put('/:id', auth, async (req, res) => {
  try {
    const { nombre, coordenadas, ubicacion, descripcion } = req.body;

    const zonaActualizada = await Zona.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          nombre,
          coordenadas,
          ubicacion,
          descripcion
        }
      },
      { returnDocument: 'after' } 
    );

    if (!zonaActualizada) return res.status(404).json({ mensaje: 'La zona no existe' });
    res.json({ mensaje: 'Zona modificada exitosamente', zona: zonaActualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al actualizar la zona' });
  }
});

// --- ENDPOINT PARA AÑADIR UNA FAMILIA A UNA ZONA SIN BORRAR LAS DEMÁS (POST ATÓMICO) ---
router.post('/:id/familias', auth, async (req, res) => {
  try {
    const { nombre_familia, orden, valor_bmwp, tamano, imagen_url } = req.body;

    const zonaActualizada = await Zona.findOneAndUpdate(
      { 
        _id: req.params.id, 
        'catalogo_familias.nombre_familia': { $ne: nombre_familia } 
      },
      {
        $push: {
          catalogo_familias: { nombre_familia, orden, valor_bmwp, tamano, imagen_url }
        }
      },
      { returnDocument: 'after' }
    );

    if (!zonaActualizada) {
      const zonaExiste = await Zona.findById(req.params.id);
      if (!zonaExiste) return res.status(404).json({ mensaje: 'La zona no existe' });
      
      return res.status(400).json({ mensaje: 'Esta familia ya está registrada en esta zona' });
    }

    res.json({ mensaje: 'Macroinvertebrado registrado con éxito', zona: zonaActualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar la familia en la zona' });
  }
});

// --- ENDPOINT PARA ELIMINAR UNA FAMILIA DE UNA ZONA SIN BORRAR LAS DEMÁS (DELETE ATÓMICO) ---
// *NUEVO*: Permite quitar una familia específica usando el botón "X" del frontend
router.delete('/:id/familias/:nombre', auth, async (req, res) => {
  try {
    const zonaActualizada = await Zona.findByIdAndUpdate(
      req.params.id,
      { 
        $pull: { catalogo_familias: { nombre_familia: req.params.nombre } } 
      },
      { returnDocument: 'after' }
    );
    
    if (!zonaActualizada) return res.status(404).json({ mensaje: 'Zona no encontrada' });
    res.json({ mensaje: 'Familia removida exitosamente', zona: zonaActualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al remover la familia de la zona' });
  }
});

module.exports = router;