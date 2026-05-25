// Archivo: routes/protocolos.js
const express = require('express');
const router = express.Router();
const Protocolo = require('../models/protocolo');
const auth = require('../middleware/auth');
const estacion = require('../models/estacion');

require('dotenv').config(); 

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function eliminarImagenesDeProtocolo(protocolo) {
  if (!protocolo) return;
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
        console.log(`[Cloudinary Cleanup] Eliminando recurso: ${publicId}`);
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error(`❌ Error al destruir ${publicId} en Cloudinary:`, err);
      }
    }
  }
}

router.post('/sincronizar', auth, async (req, res) => {
  try {
    const { protocolos } = req.body; 
    if (!Array.isArray(protocolos) || protocolos.length === 0) {
      return res.status(400).json({ mensaje: 'No se enviaron protocolos' });
    }

    const resultados = [];

    for (const prot of protocolos) {
      let { estacion_id, protocolo_numero, datos_formulario, datos_protocolo_5 } = prot;

      if (datos_formulario && datos_formulario.foto_base64) {
        try {
          console.log(`[Protocolo ${protocolo_numero}] Subiendo imagen general a Cloudinary...`);
          const base64ParaCloudinary = `data:image/jpeg;base64,${datos_formulario.foto_base64}`;
          
          const uploadRes = await cloudinary.uploader.upload(base64ParaCloudinary, {
            folder: 'deepbug_fotos_campo' 
          });

          datos_formulario.foto_url = uploadRes.secure_url;
          delete datos_formulario.foto_base64; 
          
          console.log("✅ Imagen general subida con éxito");
        } catch (error) {
          console.error("❌ Error subiendo la foto general:", error);
        }
      }
      if (datos_protocolo_5 && datos_protocolo_5.familias_encontradas && Array.isArray(datos_protocolo_5.familias_encontradas)) {
        for (let item of datos_protocolo_5.familias_encontradas) {
          if (item.foto_base64) {
            try {
              console.log(`[Protocolo 5] Subiendo evidencia de ${item.nombre_familia} a Cloudinary...`);
              
              const base64ParaCloudinary = item.foto_base64.startsWith('data:image')
                ? item.foto_base64
                : `data:image/jpeg;base64,${item.foto_base64}`;
              
              const uploadRes = await cloudinary.uploader.upload(base64ParaCloudinary, {
                folder: 'deepbug_macroinvertebrados' 
              });

              item.imagen_url = uploadRes.secure_url;
              delete item.foto_base64; 
              
              console.log(`Foto de ${item.nombre_familia} subida con éxito: ${uploadRes.secure_url}`);
            } catch (error) {
              console.error(`❌ Error subiendo foto de ${item.nombre_familia}:`, error);
            }
          }
        }
      }

      let miProtocolo = await Protocolo.findOne({
        estacion_id,
        protocolo_numero,
        usuario_id: req.usuario.id
      });

      if (miProtocolo) {
        miProtocolo.datos_formulario = datos_formulario;
        if(datos_protocolo_5) miProtocolo.datos_protocolo_5 = datos_protocolo_5;
        miProtocolo.fecha_llenado = Date.now();
        await miProtocolo.save();

        if (protocolo_numero === 1) {
          const inSitu = datos_formulario.parametros_in_situ || {};
          const inSituLleno = Object.values(inSitu).some(valor => valor === true);
          const estadoCalculado = inSituLleno ? 2 : 1; 

          await estacion.findByIdAndUpdate(estacion_id, {
            $set: { 'estado_protocolos.protocolo1': estadoCalculado }
          });
        }

        if (protocolo_numero === 5) {
            await estacion.findByIdAndUpdate(estacion_id, {
                $set: { 'estado_protocolos.protocolo5': 2 } 
            });
        }
        
        resultados.push({ protocolo_numero, estado_asignado: miProtocolo.estado, mensaje: 'Actualizado correctamente' });
      } else {
        const protocoloAprobado = await Protocolo.findOne({
          estacion_id,
          protocolo_numero,
          estado: 'aprobado'
        });

        let estadoFinal = protocoloAprobado ? 'en_conflicto' : 'aprobado';

        const nuevoProtocolo = new Protocolo({
          usuario_id: req.usuario.id,
          estacion_id,
          protocolo_numero,
          datos_formulario,
          datos_protocolo_5,
          estado: estadoFinal
        });

        await nuevoProtocolo.save();

        if (protocolo_numero === 1) {
          const inSitu = datos_formulario.parametros_in_situ || {};
          const inSituLleno = Object.values(inSitu).some(valor => valor === true);
          const estadoCalculado = inSituLleno ? 2 : 1; 

          await estacion.findByIdAndUpdate(estacion_id, {
            $set: { 'estado_protocolos.protocolo1': estadoCalculado }
          });
        }
      
        resultados.push({ protocolo_numero, estado_asignado: estadoFinal, mensaje: 'Creado correctamente' });
      }
    }

    res.status(201).json({ mensaje: 'Sincronización completada', detalles: resultados });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al sincronizar protocolos' });
  }
});

router.get('/:estacion_id', auth, async (req, res) => {
  try {
    const { estacion_id } = req.params;
    const protocolos = await Protocolo.find({ estacion_id })
                                      .populate('usuario_id', 'nombre email');
    res.json(protocolos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los protocolos' });
  }
});

router.put('/resolver/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { accion } = req.body;

    const protocolo = await Protocolo.findById(id);
    if (!protocolo) {
      return res.status(404).json({ mensaje: 'Protocolo no encontrado' });
    }

    if (accion === 'aprobar') {
      const antiguoAprobado = await Protocolo.findOne({ 
        estacion_id: protocolo.estacion_id, 
        protocolo_numero: protocolo.protocolo_numero, 
        estado: 'aprobado' 
      });
      
      if (antiguoAprobado) {
        antiguoAprobado.estado = 'descartado';
        await antiguoAprobado.save();
        await eliminarImagenesDeProtocolo(antiguoAprobado);
      }

      protocolo.estado = 'aprobado';
      await protocolo.save();
      
      return res.json({ mensaje: 'Protocolo aprobado exitosamente y fotos obsoletas limpiadas', protocolo });
      
    } else if (accion === 'descartar') {
      protocolo.estado = 'descartado';
      await protocolo.save();
      
      await eliminarImagenesDeProtocolo(protocolo);
      
      return res.json({ mensaje: 'Protocolo descartado y evidencias eliminadas de Cloudinary', protocolo });
    } else {
      return res.status(400).json({ mensaje: 'Acción no válida. Usa "aprobar" o "descartar".' });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al resolver el conflicto' });
  }
});

router.get('/mi-borrador/:estacion_id/:protocolo_numero', auth, async (req, res) => {
  try {
    const { estacion_id, protocolo_numero } = req.params;
    const protocolo = await Protocolo.findOne({
      estacion_id,
      protocolo_numero,
      usuario_id: req.usuario.id
    });
    
    if (!protocolo) return res.status(404).json({ mensaje: 'No hay borrador' });
    
    res.json(protocolo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener borrador' });
  }
});

module.exports = router;