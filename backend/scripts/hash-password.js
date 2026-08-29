const bcrypt = require('bcryptjs');

const password = process.env.INITIAL_PASSWORD;
if (!password || password.length < 8) {
  console.error('Define INITIAL_PASSWORD con al menos 8 caracteres.');
  process.exit(1);
}

bcrypt
  .hash(password, 12)
  .then((hash) => process.stdout.write(`${hash}\n`))
  .catch(() => {
    console.error('No se pudo generar el hash.');
    process.exit(1);
  });
