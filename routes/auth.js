// Archivo: routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuarios');
const auth = require('../middleware/auth'); 
const estacion = require('../models/estacion');

const router = express.Router();

router.post('/registro', async (req, res) => {
  try {
    const { nombre, institucion, email, password, codigo } = req.body;
    console.log("Iniciando registro para:", email);

    if (!codigo) {
      return res.status(400).json({ mensaje: 'El código de invitación es obligatorio.' });
    }

    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) {
      return res.status(400).json({ mensaje: 'Ese correo ya está registrado.' });
    }

    const codigoLimpio = codigo.trim().toUpperCase();
    let rolAsignado = '';
    let estacionEncontrado = null;

    if (codigoLimpio === (process.env.CODIGO_RESP || 'ADMIN-ENCB')) {
      rolAsignado = 'Responsable';
    } else {
      estacionEncontrado = await estacion.findOne({ codigo_invitacion: codigoLimpio });
      if (estacionEncontrado) {
        rolAsignado = 'Colaborador';
      } else {
        return res.status(400).json({ mensaje: 'Código inválido. No se puede crear la cuenta.' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    const nuevoUsuario = new Usuario({
      nombre,
      institucion,
      email,
      password: passwordEncriptada,
      rol: rolAsignado
    });

    await nuevoUsuario.save();
    console.log("Usuario guardado en BD con rol:", rolAsignado);

    if (estacionEncontrado && rolAsignado === 'Colaborador') {
      estacionEncontrado.colaboradores_id.push(nuevoUsuario._id);
      await estacionEncontrado.save();
      console.log("Vinculado al estacion:", estacionEncontrado.nombre_estacion);
    }

    const secret = process.env.JWT_SECRET || 'llave_temporal_de_emergencia';
    try {
      const token = jwt.sign(
        { id: nuevoUsuario._id, rol: nuevoUsuario.rol }, 
        secret, 
        { expiresIn: '30d' }
      );

      console.log("Token generado con éxito.");
      return res.status(201).json({ 
          mensaje: 'Usuario registrado exitosamente',
          token: token,
          rol: rolAsignado 
      });
    } catch (jwtError) {
      console.error("Error crítico al firmar el token:", jwtError);
      return res.status(500).json({ mensaje: 'Usuario creado pero fallo el inicio de sesión.' });
    }

  } catch (error) {
    console.error("Error general en registro:", error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const usuario = await Usuario.findOne({ email });
    
    if (!usuario) {
      return res.status(400).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    const contraseñaValida = await bcrypt.compare(password, usuario.password);
    if (!contraseñaValida) {
      return res.status(400).json({ mensaje: 'Correo o contraseña incorrectos' });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'super_secreto_para_desarrollo_deep_bug';
    const token = jwt.sign(
      { id: usuario._id, rol: usuario.rol }, 
      JWT_SECRET, 
      { expiresIn: '30d' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token: token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error en el servidor al iniciar sesión' });
  }
});

// --- 3. RUTA DE ONBOARDING ---
router.post('/validar-codigo', auth, async (req, res) => {
    try {
        const { codigo } = req.body;
        const userId = req.usuario.id;

        if (!codigo) {
            return res.status(400).json({ mensaje: 'Código no proporcionado.' });
        }

        const codigoProfesor = process.env.CODIGO_RESP || 'ADMIN-ENCB';
        if (codigo.toUpperCase() === codigoProfesor) {
            await Usuario.findByIdAndUpdate(userId, { rol: 'Responsable' });
            return res.status(200).json({ mensaje: '¡Bienvenido! Rol asignado: Responsable.' });
        }

        const estacionEncontrada = await estacion.findOne({ codigo_invitacion: codigo.toUpperCase() });
        
        if (estacionEncontrada) {
            const colaboradores = estacionEncontrada.colaboradores_id || [];
            
            const esColaborador = colaboradores.some(id => id.toString() === userId.toString());
            
            const responsable = estacionEncontrada.responsable_id;
            const esResponsable = Array.isArray(responsable) 
                ? responsable.some(id => id.toString() === userId.toString())
                : (responsable && responsable.toString() === userId.toString());
            
            const yaEsMiembro = esColaborador || esResponsable;
            
            if (!yaEsMiembro) {
                estacionEncontrada.colaboradores_id.push(userId);
                await estacionEncontrada.save();
                await Usuario.findByIdAndUpdate(userId, { rol: 'Colaborador' });
            }
            return res.status(200).json({ mensaje: `Te has unido a la estación ${estacionEncontrada.nombre_estacion} exitosamente.` });
        }

        return res.status(404).json({ mensaje: 'Código inválido o estación no encontrada.' });

    } catch (error) {
        console.error("ERROR EXACTO EN VALIDAR-CODIGO:", error);
        res.status(500).json({ mensaje: 'Error interno al validar el código.' });
    }
});

router.get('/perfil', auth, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-password');
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el perfil' });
  }
});
router.put('/cambiar-password', auth, async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;


    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    const esValida = await bcrypt.compare(passwordActual, usuario.password);
    if (!esValida) {
      return res.status(400).json({ mensaje: 'La contraseña actual es incorrecta.' });
    }

    const salt = await bcrypt.genSalt(10);
    const nuevaPasswordEncriptada = await bcrypt.hash(nuevaPassword, salt);

    usuario.password = nuevaPasswordEncriptada;
    await usuario.save();

    res.json({ mensaje: 'Contraseña actualizada exitosamente.' });

  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({ mensaje: 'Error interno del servidor al actualizar credenciales.' });
  }
});

router.put('/actualizar-perfil', auth, async (req, res) => {
  try {
    const { nombre, institucion } = req.body;
    const usuarioId = req.usuario.id;

    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    if (nombre) usuario.nombre = nombre;
    if (institucion) usuario.institucion = institucion;

    // 3. Guardamos los cambios
    await usuario.save();

    res.json({ 
      mensaje: 'Perfil actualizado exitosamente.',
      usuario: {
        nombre: usuario.nombre,
        institucion: usuario.institucion
      }
    });

  } catch (error) {
    console.error("Error al actualizar perfil:", error);
    res.status(500).json({ mensaje: 'Error interno al actualizar los datos.' });
  }
});

module.exports = router;