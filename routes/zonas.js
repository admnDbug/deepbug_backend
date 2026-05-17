// Archivo: routes/zonas.js
const express = require('express');
const router = express.Router();
const Zona = require('../models/zonas'); // <-- Ojo aquí con el nombre de tu modelo
const auth = require('../middleware/auth'); // Importamos a nuestro Guardia
const upload = require('../middleware/upload');


// --- 1. OBTENER TODAS LAS ZONAS Y SUS CATÁLOGOS ---
// URL: GET http://localhost:3000/api/zonas
// Nota: Pusimos 'auth' a la mitad. Esto obliga a que pase por el guardia primero.
// Archivo: routes/zonas.js (o donde tengas tus endpoints de zonas)
router.get('/', auth, async (req, res) => {
  try {
    // BLOQUEO DE SEGURIDAD: Los colaboradores no tienen por qué ver el catálogo raíz
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ 
        mensaje: 'Acceso denegado. Solo los Responsables o Administradores pueden acceder a los catálogos geográficos.' 
      });
    }

    // Si pasa el filtro (es Responsable o Admin), le devolvemos la lista
    const zonas = await Zona.find();
    res.json(zonas);
    
  } catch (error) {
    console.error("Error al obtener las zonas:", error);
    res.status(500).json({ mensaje: 'Error interno al cargar el catálogo de zonas' });
  }
});

// --- 2. CREAR UNA NUEVA ZONA ---
// URL: POST http://localhost:3000/api/zonas
router.post('/', auth, async (req, res) => {
  try {
    // REGLA DE NEGOCIO: Solo Responsable o Administrador pueden crear Zonas
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'No tienes permisos para crear zonas o catálogos.' });
    }

    // Si tiene permiso, creamos la zona con lo que nos manden en el JSON
    const nuevaZona = new Zona(req.body);
    await nuevaZona.save();
    
    res.status(201).json({ mensaje: 'Zona creada exitosamente', zona: nuevaZona });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear la zona' });
  }
});

// RUTA PARA AGREGAR UNA FAMILIA A UNA ZONA EXISTENTE
// URL: POST http://localhost:3000/api/zonas/:zonaId/familia
router.post('/:zonaId/familia', [auth, upload.single('imagen')], async (req, res) => {
  try {
    // REGLA RN13: Candado de seguridad para el rol
    if (req.usuario.rol === 'Colaborador') {
      return res.status(403).json({ mensaje: 'No tienes permisos para modificar catálogos.' });
    }

    const { zonaId } = req.params;
    const { nombre_familia, orden, valor_bmwp, tamano } = req.body;

    console.log("Archivo atrapado por Multer:", req.file);
    // Validación por si el frontend no envió la imagen
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
      imagen_url: req.file.path // <-- El link que nos dio Cloudinary
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
// URL: DELETE http://localhost:3000/api/zonas/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    // Candado de seguridad: Solo Responsables o Administradores pueden eliminar
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

// --- MODIFICAR CONFIGURACIÓN DE UNA ZONA EXISTENTE (PUT) ---
router.put('/:id', auth, async (req, res) => {
  try {
    const { nombre, coordenadas, ubicacion, descripcion, catalogo_familias } = req.body;

    const zonaActualizada = await Zona.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          nombre,
          coordenadas,
          ubicacion,
          descripcion,
          catalogo_familias // Se reemplaza con la nueva lista modificada
        }
      },
      { new: true } // Nos devuelve el documento modificado
    );

    if (!zonaActualizada) return res.status(404).json({ mensaje: 'La zona no existe' });
    res.json({ mensaje: 'Zona modificada exitosamente', zona: zonaActualizada });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al actualizar la zona' });
  }
});
module.exports = router;