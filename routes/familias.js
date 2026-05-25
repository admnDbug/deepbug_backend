const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const FamiliaGlobal = require('../models/familia');
const auth = require('../middleware/auth');

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'familias_catalog',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage: storage });

router.get('/', auth, async (req, res) => {
  try {
    const familias = await FamiliaGlobal.find().sort({ nombre_familia: 1 });
    res.json(familias);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el catálogo' });
  }
});

router.post('/', [auth, upload.single('imagen')], async (req, res) => {
  try {
    const { nombre_familia, orden, tamano, descripcion } = req.body;

    const existe = await FamiliaGlobal.findOne({ nombre_familia });
    if (existe) return res.status(400).json({ mensaje: 'Esta familia ya existe en el catálogo.' });

    const nuevaFamilia = new FamiliaGlobal({
      nombre_familia,
      orden,
      tamano,
      descripcion,

    });

    await nuevaFamilia.save();
    res.status(201).json(nuevaFamilia);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar la familia en el catálogo.' });
  }
});
router.put('/:id', auth, upload.single('imagen'), async (req, res) => {
  try {
    const { nombre_familia, orden, tamano, descripcion } = req.body;
    
    let updateFields = {
      nombre_familia,
      orden,
      tamano: parseFloat(tamano) || 0,
      descripcion
    };

    if (req.file) {
      updateFields.imagen_url = req.file.path; 
    }

    const familiaModificada = await FamiliaGlobal.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true }
    );

    if (!familiaModificada) {
      return res.status(404).json({ mensaje: 'Familia no encontrada en el catálogo global.' });
    }

    res.json({ mensaje: 'Familia modificada exitosamente', familia: familiaModificada });
  } catch (error) {
    console.error("Error al mutar familia:", error);
    res.status(500).json({ mensaje: 'Error del servidor al modificar la familia.', detalles: error.message });
  }
});
module.exports = router;