const Site = require('../models/site');
const asyncHandler = require('express-async-handler');

// @desc    Get all sites
// @route   GET /api/sites
// @access  Public
const getSites = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  const sites = await Site.find()
    .sort({ id: 1 })
    .skip(skip)
    .limit(limit);
    
  const total = await Site.countDocuments();
  
  res.json({
    success: true,
    count: sites.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: sites
  });
});

// @desc    Get single site
// @route   GET /api/sites/:id
// @access  Public
const getSite = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ id: req.params.id });
  
  if (!site) {
    res.status(404);
    throw new Error('Site not found');
  }
  
  res.json({
    success: true,
    data: site
  });
});

// @desc    Create new site
// @route   POST /api/sites
// @access  Private
const createSite = asyncHandler(async (req, res) => {
  // Generate next available ID if not provided
  if (!req.body.id) {
    const lastSite = await Site.findOne().sort({ id: -1 });
    req.body.id = lastSite ? lastSite.id + 1 : 1010;
  }
  
  const site = await Site.create(req.body);
  
  res.status(201).json({
    success: true,
    data: site
  });
});

// @desc    Update site
// @route   PUT /api/sites/:id
// @access  Private
const updateSite = asyncHandler(async (req, res) => {
  let site = await Site.findOne({ id: req.params.id });
  
  if (!site) {
    res.status(404);
    throw new Error('Site not found');
  }
  
  // Prevent changing the ID
  if (req.body.id && req.body.id !== site.id) {
    res.status(400);
    throw new Error('Site ID cannot be changed');
  }
  
  site = await Site.findOneAndUpdate(
    { id: req.params.id },
    req.body,
    { new: true, runValidators: true }
  );
  
  res.json({
    success: true,
    data: site
  });
});

// @desc    Delete site
// @route   DELETE /api/sites/:id
// @access  Private
const deleteSite = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ id: req.params.id });
  
  if (!site) {
    res.status(404);
    throw new Error('Site not found');
  }
  
  await site.deleteOne();
  
  res.json({
    success: true,
    data: {}
  });
});

// @desc    Change site status
// @route   PATCH /api/sites/:id/status
// @access  Private
const changeSiteStatus = asyncHandler(async (req, res) => {
  const site = await Site.findOne({ id: req.params.id });
  
  if (!site) {
    res.status(404);
    throw new Error('Site not found');
  }
  
  // Accept normalized statuses from client: active, inactive, maintenance
  const allowed = ['active', 'inactive', 'maintenance'];
  const newStatus = String(req.body.status || '').toLowerCase();
  if (!allowed.includes(newStatus)) {
    res.status(400);
    throw new Error('Invalid status value');
  }

  site.status = newStatus;

  // Update last maintenance date if status changed to active
  if (newStatus === 'active') {
    site.lastMaintenance = new Date();
  }
  
  await site.save();
  
  res.json({
    success: true,
    data: site
  });
});

// @desc    Get sites by status
// @route   GET /api/sites/status/:status
// @access  Public
const getSitesByStatus = asyncHandler(async (req, res) => {
  const sites = await Site.find({ status: req.params.status });
  
  res.json({
    success: true,
    count: sites.length,
    data: sites
  });
});

// @desc    Get sites by coverage type
// @route   GET /api/sites/coverage/:coverage
// @access  Public
const getSitesByCoverage = asyncHandler(async (req, res) => {
  const sites = await Site.find({ coverage: req.params.coverage });
  
  res.json({
    success: true,
    count: sites.length,
    data: sites
  });
});

module.exports = {
  getSites,
  getSite,
  createSite,
  updateSite,
  deleteSite,
  changeSiteStatus,
  getSitesByStatus,
  getSitesByCoverage
};