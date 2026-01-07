const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Get user statistics - MUST be before /:id route
router.get('/stats', userController.getUserStats);

// Get all users
router.get('/getUsers', userController.getUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Create new user
router.post('/create', userController.createUser);

// Update user
router.put('/update/:id', userController.updateUser);

// Delete user
router.delete('/delete/:id', userController.deleteUser);

// Update user status
router.patch('/status/:id', userController.updateUserStatus);

// Search users
router.get('/search/:query', userController.searchUsers);

module.exports = router;