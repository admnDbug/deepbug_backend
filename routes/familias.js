const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const FamiliaGlobal = require('../models/familia');
const auth = require('../middleware/auth');

const router = express.Router();

// 1. Configuración de Cloudinary (Usa tus credenciales del .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configuración de Multer para subir a la carpeta "familias" en Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'familias_catalog',
    allowed_formats: ['jpg', 'png', 'jpeg'],
  },
});

const upload = multer({ storage: storage });

// --- RUTA: OBTENER TODAS LAS FAMILIAS ---
router.get('/', auth, async (req, res) => {
  try {
    const familias = await FamiliaGlobal.find().sort({ nombre_familia: 1 });
    res.json(familias);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el catálogo' });
  }
});

// --- RUTA: CREAR FAMILIA (CON IMAGEN) ---
// El campo 'imagen' debe coincidir con el name que pusimos en el FormData de la web
router.post('/', [auth, upload.single('imagen')], async (req, res) => {
  try {
    const { nombre_familia, orden, tamano, descripcion } = req.body;

    // Verificamos si ya existe
    const existe = await FamiliaGlobal.findOne({ nombre_familia });
    if (existe) return res.status(400).json({ mensaje: 'Esta familia ya existe en el catálogo.' });

    const nuevaFamilia = new FamiliaGlobal({
      nombre_familia,
      orden,
      tamano,
      descripcion,
      imagen_url: req.file ? req.file.path : '' // Multer nos da la URL de Cloudinary en req.file.path
    });

    await nuevaFamilia.save();
    res.status(201).json(nuevaFamilia);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al registrar la familia en el catálogo.' });
  }
});

module.exports = router;