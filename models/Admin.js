const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: { // hashed password
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'admins',
  timestamps: false
});

module.exports = Admin;
