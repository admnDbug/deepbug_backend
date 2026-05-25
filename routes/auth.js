// Archivo: routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuarios');
const auth = require('../middleware/auth'); 
const estacion = require('../models/estacion');

const router = express.Router();

// --- 1. RUTA DE REGISTRO ---
// --- 1. RUTA DE REGISTRO (ESTRICTA CON CÓDIGO) ---
router.post('/registro', async (req, res) => {
  try {
    const { nombre, institucion, email, password, codigo } = req.body;
    console.log("Iniciando registro para:", email);

    // 1. Validar presencia de código
    if (!codigo) {
      return res.status(400).json({ mensaje: 'El código de invitación es obligatorio.' });
    }

    // 2. Verificar que el correo no exista
    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) {
      return res.status(400).json({ mensaje: 'Ese correo ya está registrado.' });
    }

    // 3. Determinar ROL o REBOTAR
    const codigoLimpio = codigo.trim().toUpperCase();
    let rolAsignado = '';
    let proyectoEncontrado = null;

    if (codigoLimpio === (process.env.CODIGO_RESP || 'ADMIN-ENCB')) {
      rolAsignado = 'Responsable';
    } else {
      proyectoEncontrado = await estacion.findOne({ codigo_invitacion: codigoLimpio });
      if (proyectoEncontrado) {
        rolAsignado = 'Colaborador';
      } else {
        return res.status(400).json({ mensaje: 'Código inválido. No se puede crear la cuenta.' });
      }
    }

    // 4. HASHEAR LA CONTRASEÑA
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    // 5. Crear usuario
    const nuevoUsuario = new Usuario({
      nombre,
      institucion,
      email,
      password: passwordEncriptada,
      rol: rolAsignado
    });

    await nuevoUsuario.save();
    console.log("Usuario guardado en BD con rol:", rolAsignado);

    // 6. Vincular a proyecto si es colaborador
    if (proyectoEncontrado && rolAsignado === 'Colaborador') {
      proyectoEncontrado.colaboradores_id.push(nuevoUsuario._id);
      await proyectoEncontrado.save();
      console.log("Vinculado al proyecto:", proyectoEncontrado.nombre_proyecto);
    }

    // 7. Generar el Token
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

// --- 2. RUTA DE LOGIN ---
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

        const codigoProfesor = process.env.CODIGO_RESP || 'ADMIN-ENCB';
        if (codigo.toUpperCase() === codigoProfesor) {
            await Usuario.findByIdAndUpdate(userId, { rol: 'Responsable' });
            return res.status(200).json({ mensaje: '¡Bienvenido! Rol asignado: Responsable.' });
        }

        const proyecto = await estacion.findOne({ codigo_invitacion: codigo.toUpperCase() });
        
        if (proyecto) {
            const yaEsMiembro = proyecto.colaboradores_id.includes(userId) || proyecto.responsable_id.includes(userId);
            
            if (!yaEsMiembro) {
                proyecto.colaboradores_id.push(userId);
                await proyecto.save();
                await Usuario.findByIdAndUpdate(userId, { rol: 'Colaborador' });
            }
            return res.status(200).json({ mensaje: `Te has unido al proyecto ${proyecto.nombre_proyecto} exitosamente.` });
        }

        return res.status(404).json({ mensaje: 'Código inválido o proyecto no encontrado.' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error interno al validar el código.' });
    }
});

// --- 4. RUTA DE PERFIL ---
router.get('/perfil', auth, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select('-password');
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el perfil' });
  }
});
// --- 5. RUTA PARA CAMBIAR CONTRASEÑA ---
router.put('/cambiar-password', auth, async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;
    const usuarioId = req.usuario.id; // Viene del token gracias al middleware 'auth'

    // 1. Buscamos al usuario en la base de datos
    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    // 2. Comparamos la contraseña actual que escribió con la que está en la BD
    const esValida = await bcrypt.compare(passwordActual, usuario.password);
    if (!esValida) {
      return res.status(400).json({ mensaje: 'La contraseña actual es incorrecta.' });
    }

    // 3. Si es válida, encriptamos la NUEVA contraseña
    const salt = await bcrypt.genSalt(10);
    const nuevaPasswordEncriptada = await bcrypt.hash(nuevaPassword, salt);

    // 4. Actualizamos el documento y lo guardamos
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

    // 1. Buscamos al usuario
    const usuario = await Usuario.findById(usuarioId);
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    // 2. Actualizamos solo los campos que nos enviaron
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