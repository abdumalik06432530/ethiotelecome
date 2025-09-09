const mongoose = require('mongoose');

const powerSourceDetailsSchema = new mongoose.Schema({
  generator: {
    type: {
      type: String,
      enum: ['perkins', 'cummins', 'cat', 'fgt', 'doosan', 'mtu', 'volvo', 
             'john_deere', 'yanmar', 'kirloskar', 'mitsubishi', 'honda', 
             'kohler', 'mecc_alte', 'premec', 'niroc', 'other']
    },
    capacity: Number, // kVA
    load: Number,     // kW
    autonomy: Number, // hours
    fuelTank: Number  // litres
  },
  battery: {
    type: {
      type: String,
      enum: ['li_ion', 'lead_acid', 'flow', 'lithium_iron']
    },
    capacity: Number,   // kWh
    voltage: Number,    // V
    depth: Number,      // %
    quantity: Number    // number of packs
  },
  solar: {
    type: {
      type: String,
      enum: ['mono', 'poly', 'thin', 'bifacial']
    },
    capacity: Number,     // kW
    tilt: Number,         // degrees
    inverterSize: Number, // kW
    autonomy: Number      // kWh
  }
  ,
  grid: {
    connectionType: String,
    voltage: Number,
    load: Number
  },
  other: {
    type: String,
    capacity: Number,
    description: String
  }
});

const siteSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  uptime: {
    type: String,
    default: '0%'
  },
  height: {
    type: String,
    required: true
  },
  powerSources: [{
    type: String,
    enum: ['Generator', 'Battery', 'Solar', 'Grid', 'Other']
  }],
  powerSourceDetails: powerSourceDetailsSchema,
  capacity: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium'
  },
  tags: [String],
  location: {
    lat: {
      type: Number,
      required: true
    },
    lng: {
      type: Number,
      required: true
    }
  },
  installationDate: Date,
  lastMaintenance: Date,
  technician: {
    name: String,
    phone: String
  },
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
siteSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Site', siteSchema);