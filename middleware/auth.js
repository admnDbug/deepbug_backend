// Archivo: middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // 1. El cliente (App o Web) debe mandar su gafete en el "Header" de la petición
  const token = req.header('Authorization');

  // Si no trae gafete, lo rebotamos
  if (!token) {
    return res.status(401).json({ mensaje: 'Acceso denegado. No hay token de autenticación.' });
  }

  try {
    // 2. Le quitamos la palabra "Bearer " que normalmente se pone por estándar
    const tokenLimpio = token.replace('Bearer ', '');

    // 3. Revisamos que el gafete sea original y no esté falsificado
    const JWT_SECRET = process.env.JWT_SECRET;
    const verificado = jwt.verify(tokenLimpio, JWT_SECRET);

    // 4. Si es válido, guardamos los datos del usuario (su ID y su Rol) en la petición
    req.usuario = verificado;
    
    // 5. Le decimos al servidor: "Todo en orden, déjalo pasar a la ruta que pidió"
    next(); 
  } catch (error) {
    res.status(400).json({ mensaje: 'El token no es válido o ya expiró.' });
  }
};
