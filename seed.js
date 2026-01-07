const sequelize = require('./db');
const Admin = require('./models/Admin');
const bcrypt = require('bcryptjs');

async function seed() {
  try {
    await sequelize.sync({ force: true }); // drops & recreates table

    const hashedPassword = await bcrypt.hash('admin123', 10);

    await Admin.create({
      email: 'admin@example.com',
      password: hashedPassword
    });

    console.log('Admin created');
    process.exit();
  } catch (err) {
    console.error(err);
  }
}

seed();
