const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    // Support an environment-driven admin user (set ADMIN_USERNAME and ADMIN_PASSWORD in .env)
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN;
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    if (ADMIN_USERNAME && ADMIN_PASSWORD && username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Sign a JWT for the env admin
      const secret = process.env.JWT_SECRET || 'dev-secret';
      const token = jwt.sign({ username: ADMIN_USERNAME, role: 'admin', envAdmin: true }, secret, { expiresIn: '7d' });
      return res.json({
        token,
        user: {
          username: ADMIN_USERNAME,
          role: 'admin'
        }
      });
    }
    
    // Find user in database
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// POST /api/auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const { username, password, role = 'user' } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    
    // Password validation
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    
    if (!password.match(/([0-9])/)) {
      return res.status(400).json({ message: 'Password must contain at least one number' });
    }
    
    if (!password.match(/([a-z].*[A-Z])|([A-Z].*[a-z])/)) {
      return res.status(400).json({ message: 'Password must contain both uppercase and lowercase letters' });
    }
    
    // Create new user
    const user = new User({ username, password, role });
    await user.save();
    
    // Create JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      token,
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// GET /api/auth/verify - Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }
    // Verify JWT token
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, secret);

    // If token is from env admin (no DB id), return env admin user
    if (decoded && decoded.envAdmin) {
      return res.json({ user: { username: decoded.username, role: 'admin' } });
    }

    // Find user to get latest data
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
});

module.exports = router;