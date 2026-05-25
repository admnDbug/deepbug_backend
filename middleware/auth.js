// Archivo: middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.header('Authorization');

  if (!token) {
    return res.status(401).json({ mensaje: 'Acceso denegado. No hay token de autenticación.' });
  }

  try {
    const tokenLimpio = token.replace('Bearer ', '');

    const JWT_SECRET = process.env.JWT_SECRET;
    const verificado = jwt.verify(tokenLimpio, JWT_SECRET);

    req.usuario = verificado;
    
    next(); 
  } catch (error) {
    res.status(400).json({ mensaje: 'El token no es válido o ya expiró.' });
  }
};
