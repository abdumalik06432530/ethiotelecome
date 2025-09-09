const express = require('express');
const router = express.Router();
const Site = require('../models/site');
const { changeSiteStatus } = require('../controllers/siteController');

/**
 * GET /api/sites
 * Return all sites
 */
router.get('/', async (req, res) => {
  try {
    // Optional status filter: ?status=active|inactive|maintenance
    const allowed = ['active', 'inactive', 'maintenance'];
    const query = {};
    if (req.query.status) {
      const status = String(req.query.status).toLowerCase();
      if (allowed.includes(status)) {
        query.status = status;
      } else {
        return res.status(400).json({ message: 'Invalid status filter' });
      }
    }

    const sites = await Site.find(query).sort({ createdAt: -1 });
    res.json(sites);
  } catch (err) {
    console.error('Error fetching sites:', err);
    res.status(500).json({ message: 'Server error while fetching sites' });
  }
});

/**
 * GET /api/sites/:id
 * Return single site by numeric id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const site = await Site.findOne({ id });
    if (!site) return res.status(404).json({ message: 'Site not found' });
    res.json(site);
  } catch (err) {
    console.error('Error fetching site:', err);
    res.status(500).json({ message: 'Server error while fetching site' });
  }
});

/**
 * POST /api/sites
 * Create a new site
 */
router.post('/', async (req, res) => {
  try {
    const { id } = req.body;
    if (id == null) return res.status(400).json({ message: 'Site id is required' });

    const exists = await Site.findOne({ id });
    if (exists) return res.status(400).json({ message: 'Site with this ID already exists' });

    const site = new Site(req.body);
    await site.save();
    res.status(201).json(site);
  } catch (err) {
    console.error('Error creating site:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', details: err.errors });
    }
    res.status(500).json({ message: 'Server error while creating site' });
  }
});

/**
 * PUT /api/sites/:id
 * Update site by id (partial updates supported)
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const update = { ...req.body, updatedAt: Date.now() };
    const site = await Site.findOneAndUpdate({ id }, update, { new: true, runValidators: true });
    if (!site) return res.status(404).json({ message: 'Site not found' });
    res.json(site);
  } catch (err) {
    console.error('Error updating site:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Validation error', details: err.errors });
    }
    res.status(500).json({ message: 'Server error while updating site' });
  }
});

/**
 * DELETE /api/sites/:id
 * Delete site by id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await Site.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ message: 'Site not found' });
    res.json({ message: 'Site deleted successfully', site: deleted });
  } catch (err) {
    console.error('Error deleting site:', err);
    res.status(500).json({ message: 'Server error while deleting site' });
  }
});

/**
 * PATCH /api/sites/:id/status
 * Change site status (accessible to logged-in users)
 */
router.patch('/:id/status', async (req, res) => {
  try {
    await changeSiteStatus(req, res);
  } catch (err) {
    console.error('Error changing site status:', err);
    res.status(500).json({ message: 'Server error while updating status' });
  }
});

module.exports = router;