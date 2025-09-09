// Base URL for API endpoints — read from window.__ENV injected via config.js
// dotenv cannot be used in browser code. Use `npm run gen-config` to generate
// `config.js` from `frontend/.env`, or ensure `config.js` is served with the
// correct BASE_URL.
const API_BASE_URL = (window.__ENV && window.__ENV.BASE_URL) || (window.location.origin + '/api');
let authToken = null;

// App state variables
let currentUser = null; // Stores the currently logged-in user
const sitesPerPage = 10; // Number of sites to display per page
let currentPage = 1; // Current page number for pagination
let filteredSites = []; // Array of sites filtered by search criteria
let selectedSiteId = null; // ID of the currently selected site
const markers = new Map(); // Map to store Leaflet markers for sites
let currentMapLayer = 'street'; // Current map layer (street, satellite, terrain)

// DOM Elements
const loginPage = document.getElementById('loginPage');
const registerPage = document.getElementById('registerPage');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const addSiteBtn = document.getElementById('addSiteBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');
const sitesList = document.getElementById('sitesList');
const prevBtn = document.getElementById('prevPageBtn');
const nextBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');
const detailSiteContent = document.getElementById('detailSiteContent');
const noSiteSelected = document.getElementById('noSiteSelected');
const addSiteModal = document.getElementById('addSiteModal');
const editSiteModal = document.getElementById('editSiteModal');
const siteForm = document.getElementById('siteForm');
const editSiteForm = document.getElementById('editSiteForm');
const userRoleBadge = document.getElementById('userRoleBadge');
const userAvatar = document.getElementById('userAvatar');
const notification = document.getElementById('notification');

// Initialize Leaflet map with default view centered on coordinates [9.03, 38.74]
const map = L.map('map', {
  preferCanvas: true,
  zoomControl: false
}).setView([9.03, 38.74], 13);

// Add zoom control to the top-right of the map
L.control.zoom({
  position: 'topright'
}).addTo(map);

// Define base map layers with retina support
const baseMaps = {
  "street": L.tileLayer.provider('OpenStreetMap.Mapnik', { detectRetina: true }),
  "satellite": L.tileLayer.provider('Esri.WorldImagery', { detectRetina: true }),
  "terrain": L.tileLayer.provider('OpenTopoMap', { detectRetina: true })
};

// Set default map layer to street view
baseMaps["street"].addTo(map);

// Ensure map redraws correctly when the window resizes or when its container becomes visible
window.addEventListener('resize', () => {
  try {
    map.invalidateSize();
  } catch (e) {
    // map may not be initialized yet
  }
});

// Helper Functions

// Displays a notification message with a specified type (success or error)
function showNotification(message, type = 'success') {
  notification.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
    ${message}
  `;
  notification.className = `notification ${type} show`;
  setTimeout(() => {
    notification.classList.remove('show');
  }, 5000); // Hide after 5 seconds
}

// Normalizes an ID to a number if possible
function normalizeId(id) {
  if (id == null) return id;
  if (typeof id === 'number') return id;
  const n = parseInt(id, 10);
  return Number.isNaN(n) ? id : n;
}

// Shows a loading state on a button with a spinner
function showLoading(button, buttonTextElement, text = '') {
  button.disabled = true;
  buttonTextElement.innerHTML = `<span class="spinner"></span> ${text}`;
}

// Hides the loading state on a button
function hideLoading(button, buttonTextElement, text = '') {
  button.disabled = false;
  buttonTextElement.textContent = text;
}

// Shows the specified page (login, register, or main app) and hides others
function showPage(pageId) {
  loginPage.style.display = 'none';
  registerPage.style.display = 'none';
  mainApp.style.display = 'none';
  
  if (pageId === 'loginPage') {
    loginPage.style.display = 'flex';
    document.getElementById('loginUsername').focus();
  } else if (pageId === 'registerPage') {
    registerPage.style.display = 'flex';
    document.getElementById('registerUsername').focus();
  } else if (pageId === 'mainApp') {
    mainApp.style.display = 'block';
    initializeApp();
    searchInput.focus();
  }
}

// Formats a date string to a readable format
function formatDate(dateString) {
  if (!dateString) return 'Not specified';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Checks password strength and updates UI with feedback
function checkPasswordStrength(password) {
  const strengthBar = document.getElementById('passwordStrength');
  const feedback = document.getElementById('passwordFeedback');
  
  if (!password) {
    strengthBar.className = 'password-strength';
    feedback.textContent = '';
    return;
  }
  
  let strength = 0;
  let feedbackText = '';
  
  if (password.length >= 8) strength++;
  if (password.match(/([a-z].*[A-Z])|([A-Z].*[a-z])/)) strength++;
  if (password.match(/([0-9])/)) strength++;
  if (password.match(/([!,@,#,$,%,^,&,*,?,_,~])/)) strength++;
  
  switch(strength) {
    case 0:
    case 1:
      strengthBar.className = 'password-strength strength-weak';
      feedbackText = 'Weak password';
      break;
    case 2:
      strengthBar.className = 'password-strength strength-medium';
      feedbackText = 'Medium strength password';
      break;
    case 3:
    case 4:
      strengthBar.className = 'password-strength strength-strong';
      feedbackText = 'Strong password';
      break;
  }
  
  if (password.length < 8) {
    feedbackText = 'Password should be at least 8 characters';
  } else if (!password.match(/([0-9])/)) {
    feedbackText = 'Add numbers to strengthen your password';
  } else if (!password.match(/([!,@,#,$,%,^,&,*,?,_,~])/)) {
    feedbackText = 'Add special characters to strengthen your password';
  }
  
  feedback.textContent = feedbackText;
}

// Checks if the current user has the required role
function checkAccessControl(requiredRole) {
  if (!currentUser) return false;
  return currentUser.role === requiredRole;
}

// Helper functions to format power source types
function formatConnectionType(type) {
  const types = {
    'single_phase': 'Single-phase',
    'three_phase': 'Three-phase'
  };
  return types[type] || type;
}

function formatGeneratorType(type) {
  const types = {
    'perkins': 'Perkins',
    'cummins': 'Cummins',
    'cat': 'CAT',
    'fgt': 'FGT',
    'doosan': 'Doosan',
    'mtu': 'MTU',
    'volvo': 'Volvo',
    'john_deere': 'John Deere',
    'yanmar': 'Yanmar',
    'kirloskar': 'Kirloskar',
    'mitsubishi': 'Mitsubishi',
    'honda': 'Honda',
    'kohler': 'Kohler',
    'mecc_alte': 'Mecc Alte',
    'premec': 'Premec',
    'niroc': 'Niroc',
    'other': 'Other'
  };
  return types[type] || type;
}

function formatBatteryType(type) {
  const types = {
    'li_ion': 'Lithium-Ion',
    'lead_acid': 'Lead-Acid',
    'flow': 'Flow',
    'lithium_iron': 'Lithium-Iron'
  };
  return types[type] || type;
}

function formatSolarType(type) {
  const types = {
    'mono': 'Monocrystalline',
    'poly': 'Polycrystalline',
    'thin': 'Thin-Film',
    'bifacial': 'Bifacial'
  };
  return types[type] || type;
}

// JavaScript to handle displaying power source details
function displayPowerSourceDetails(powerSources, powerSourceDetails) {
  const container = document.getElementById('detailPowerDetails');
  container.innerHTML = '';
  
  if (!powerSources || powerSources.length === 0) {
    container.innerHTML = '<div class="detail-empty">No power sources configured</div>';
    return;
  }
  
  powerSources.forEach(source => {
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'power-detail-group';
    
    const sourceTitle = document.createElement('div');
    sourceTitle.className = 'power-detail-label';
    sourceTitle.textContent = source;
    sourceDiv.appendChild(sourceTitle);
    
    if (source === 'Grid' && powerSourceDetails && powerSourceDetails.grid) {
      const gridDetails = powerSourceDetails.grid;
      sourceDiv.innerHTML += `
        <div class="power-detail-value">
          ${gridDetails.connectionType ? `Connection: ${formatConnectionType(gridDetails.connectionType)}<br>` : ''}
          ${gridDetails.voltage ? `Voltage: ${gridDetails.voltage}V<br>` : ''}
          ${gridDetails.load ? `Load: ${gridDetails.load}kW` : ''}
        </div>
      `;
    }
    else if (source === 'Generator' && powerSourceDetails && powerSourceDetails.generator) {
      const genDetails = powerSourceDetails.generator;
      sourceDiv.innerHTML += `
        <div class="power-detail-value">
          ${genDetails.type ? `Type: ${formatGeneratorType(genDetails.type)}<br>` : ''}
          ${genDetails.capacity ? `Capacity: ${genDetails.capacity}kVA<br>` : ''}
          ${genDetails.load ? `Load: ${genDetails.load}kW<br>` : ''}
          ${genDetails.autonomy ? `Autonomy: ${genDetails.autonomy} hours<br>` : ''}
          ${genDetails.fuelTank ? `Fuel Tank: ${genDetails.fuelTank}L` : ''}
        </div>
      `;
    }
    else if (source === 'Battery' && powerSourceDetails && powerSourceDetails.battery) {
      const batteryDetails = powerSourceDetails.battery;
      sourceDiv.innerHTML += `
        <div class="power-detail-value">
          ${batteryDetails.type ? `Type: ${formatBatteryType(batteryDetails.type)}<br>` : ''}
          ${batteryDetails.capacity ? `Capacity: ${batteryDetails.capacity}kWh<br>` : ''}
          ${batteryDetails.voltage ? `Voltage: ${batteryDetails.voltage}V<br>` : ''}
          ${batteryDetails.depth ? `DoD: ${batteryDetails.depth}%<br>` : ''}
          ${batteryDetails.quantity ? `Quantity: ${batteryDetails.quantity} packs` : ''}
        </div>
      `;
    }
    else if (source === 'Solar' && powerSourceDetails && powerSourceDetails.solar) {
      const solarDetails = powerSourceDetails.solar;
      sourceDiv.innerHTML += `
        <div class="power-detail-value">
          ${solarDetails.type ? `Type: ${formatSolarType(solarDetails.type)}<br>` : ''}
          ${solarDetails.capacity ? `Capacity: ${solarDetails.capacity}kW<br>` : ''}
          ${solarDetails.tilt ? `Tilt: ${solarDetails.tilt}°<br>` : ''}
          ${solarDetails.inverterSize ? `Inverter: ${solarDetails.inverterSize}kW<br>` : ''}
          ${solarDetails.autonomy ? `Autonomy: ${solarDetails.autonomy}kWh` : ''}
        </div>
      `;
    }
    else if (source === 'Other' && powerSourceDetails && powerSourceDetails.other) {
      const otherDetails = powerSourceDetails.other;
      sourceDiv.innerHTML += `
        <div class="power-detail-value">
          ${otherDetails.type ? `Type: ${otherDetails.type}<br>` : ''}
          ${otherDetails.capacity ? `Capacity: ${otherDetails.capacity}kW<br>` : ''}
          ${otherDetails.description ? `Description: ${otherDetails.description}` : ''}
        </div>
      `;
    } else {
      sourceDiv.innerHTML += '<div class="power-detail-value">No details available</div>';
    }
    
    // If admin, add Edit and Delete buttons for this specific power source
    if (checkAccessControl('admin')) {
      const btnWrap = document.createElement('div');
      btnWrap.className = 'power-detail-actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'power-edit-btn';
      editBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
      editBtn.dataset.siteId = String(selectedSiteId);
      editBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        const sid = this.dataset.siteId || selectedSiteId;
        openPowerSourceModal(sid, source);
      });
      btnWrap.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'power-delete-btn';
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
      deleteBtn.dataset.siteId = String(selectedSiteId);
      deleteBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        const sid = this.dataset.siteId || selectedSiteId;
        deletePowerSource(sid, source);
      });
      btnWrap.appendChild(deleteBtn);

      sourceDiv.appendChild(btnWrap);
    }

    container.appendChild(sourceDiv);
  });

  // quick-edit wrapper removed; per-source edit/delete buttons remain
}

// Function to display site details (call this when a site is selected)
function displaySiteDetails(site) {
  // Update basic site information
  document.getElementById('detailSiteName').textContent = site.name;
  document.getElementById('detailSiteId').textContent = `ID: ${site.id}`;
  document.getElementById('detailSiteAddress').textContent = site.address;
  const detailSiteStatus = document.getElementById('detailSiteStatus');
  // If user is logged in, render editable select for status; otherwise render text
  if (currentUser) {
    detailSiteStatus.innerHTML = '';
    const select = document.createElement('select');
    select.className = 'form-input detail-status-select';
    ['active', 'inactive', 'maintenance'].forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if (s === site.status) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', async function() {
      const newStatus = this.value;
      if (!confirm(`Change site status to ${newStatus}?`)) {
        // revert selection
        this.value = site.status;
        return;
      }
      try {
        // Call dedicated status endpoint so regular users can update only status
        await makeApiCall(`/sites/${site.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus })
        });
        showNotification('Site status updated');
        // update local copy and UI
        filteredSites = await fetchSites(true);
        const updated = filteredSites.find(s => s.id === site.id) || site;
        displaySiteDetails(updated);
        renderSitesPage(currentPage);
      } catch (err) {
        console.error('Failed to update status', err);
        showNotification('Failed to update status', 'error');
        this.value = site.status;
      }
    });
    detailSiteStatus.appendChild(select);
  } else {
    detailSiteStatus.textContent = site.status;
  }
  document.getElementById('detailSiteHeight').textContent = `${site.height}m`;
  document.getElementById('detailSiteUptime').textContent = site.uptime || 'N/A';
  document.getElementById('detailSiteCoords').textContent = `${site.location.lat}, ${site.location.lng}`;
  document.getElementById('detailSiteCapacity').textContent = site.capacity;
  document.getElementById('detailSiteInstallationDate').textContent = site.installationDate || 'N/A';
  document.getElementById('detailSiteLastMaintenance').textContent = site.lastMaintenance || 'N/A';
  const detailTechName = document.getElementById('detailTechName');
  const detailTechPhone = document.getElementById('detailTechPhone');
  if (site.technician) {
    detailTechName.textContent = site.technician.name || '';
    if (site.technician.phone) {
      const sanitized = (site.technician.phone + '').replace(/[^+0-9]/g, '');
      detailTechPhone.innerHTML = ` <a class="detail-phone" href="tel:${sanitized}">${site.technician.phone}</a>`;
    } else {
      detailTechPhone.textContent = '';
    }
  } else {
    detailTechName.textContent = 'N/A';
    detailTechPhone.textContent = '';
  }
  document.getElementById('detailSiteNotes').textContent = site.notes || 'No notes available';
  
  // Update power sources
  const powerSources = site.powerSources || [];
  document.getElementById('detailSitePowerSources').textContent = powerSources.join(', ');
  
  // Display power source details
  displayPowerSourceDetails(powerSources, site.powerSourceDetails);
  
  // Update tags
  const tagsContainer = document.getElementById('detailSiteTags');
  tagsContainer.innerHTML = '';
  if (site.tags && site.tags.length > 0) {
    site.tags.forEach(tag => {
      const tagElement = document.createElement('span');
      tagElement.className = 'site-tag';
      tagElement.textContent = tag;
      tagsContainer.appendChild(tagElement);
    });
  } else {
    tagsContainer.innerHTML = '<span class="no-tags">No tags</span>';
  }
  
  // Show the details content and hide the no selection message
  document.getElementById('noSiteSelected').style.display = 'none';
  document.getElementById('detailSiteContent').style.display = 'grid';
  
  // Show edit and delete buttons for admins
  const userRole = checkAccessControl('admin') ? 'admin' : 'user';
  if (userRole === 'admin') {
    document.getElementById('editSiteBtn').style.display = 'inline-block';
    document.getElementById('deleteSiteBtn').style.display = 'inline-block';
  }
}

// Exports site data to an Excel file (admin only)
function exportToExcel() {
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can export data', 'error');
    return;
  }
  
  try {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(prepareSiteDataForExport());
    
    const colWidths = [
      {wch: 10}, // ID
      {wch: 20}, // Name
      {wch: 30}, // Address
      {wch: 15}, // Status
      {wch: 10}, // Height
      {wch: 10}, // Uptime
      {wch: 15}, // Latitude
      {wch: 15}, // Longitude
      {wch: 20}, // Power Sources
      {wch: 15}, // Capacity
      {wch: 15}, // Installation Date
      {wch: 15}, // Last Maintenance
      {wch: 20}, // Technician Name
      {wch: 15}, // Technician Phone
      {wch: 20}, // Tags
      {wch: 30}, // Notes
      {wch: 20}, // Generator Type
      {wch: 15}, // Generator Capacity
      {wch: 15}, // Generator Load
      {wch: 15}, // Generator Autonomy
      {wch: 15}, // Generator Fuel Tank
      {wch: 20}, // Battery Type
      {wch: 15}, // Battery Capacity
      {wch: 15}, // Battery Voltage
      {wch: 15}, // Battery Depth
      {wch: 15}, // Battery Quantity
      {wch: 20}, // Solar Type
      {wch: 15}, // Solar Capacity
      {wch: 15}, // Solar Tilt
      {wch: 15}, // Solar Inverter Size
      {wch: 15}, // Solar Autonomy
      {wch: 20}, // Grid Connection Type
      {wch: 15}, // Grid Voltage
      {wch: 15}  // Grid Load
    ];
    worksheet['!cols'] = colWidths;
    
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sites");
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    const userType = currentUser && currentUser.role === 'admin' ? 'admin' : 'user';
    a.download = `sites_export_${userType}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    showNotification('Excel file downloaded successfully!');
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    showNotification('Failed to export Excel file', 'error');
  }
}

// Prepares site data for Excel export
function prepareSiteDataForExport() {
  return filteredSites.map(site => ({
    'ID': site.id,
    'Name': site.name,
    'Address': site.address,
    'Status': site.status,
    'Height': site.height,
    'Uptime': site.uptime,
    'Latitude': site.location.lat,
    'Longitude': site.location.lng,
    'Power Sources': site.powerSources ? site.powerSources.join(', ') : '',
    'Capacity': site.capacity || '',
    'Installation Date': site.installationDate ? formatDate(site.installationDate) : '',
    'Last Maintenance': site.lastMaintenance ? formatDate(site.lastMaintenance) : '',
    'Technician Name': site.technician?.name || '',
    'Technician Phone': site.technician?.phone || '',
    'Tags': site.tags ? site.tags.join(', ') : '',
    'Notes': site.notes || '',
    'Generator Type': site.powerSourceDetails?.generator?.type || '',
    'Generator Capacity (kVA)': site.powerSourceDetails?.generator?.capacity || '',
    'Generator Load (kW)': site.powerSourceDetails?.generator?.load || '',
    'Generator Autonomy (hours)': site.powerSourceDetails?.generator?.autonomy || '',
    'Generator Fuel Tank (litres)': site.powerSourceDetails?.generator?.fuelTank || '',
    'Battery Type': site.powerSourceDetails?.battery?.type || '',
    'Battery Capacity (kWh)': site.powerSourceDetails?.battery?.capacity || '',
    'Battery Voltage (V)': site.powerSourceDetails?.battery?.voltage || '',
    'Battery Depth (%)': site.powerSourceDetails?.battery?.depth || '',
    'Battery Quantity (packs)': site.powerSourceDetails?.battery?.quantity || '',
    'Solar Type': site.powerSourceDetails?.solar?.type || '',
    'Solar Capacity (kW)': site.powerSourceDetails?.solar?.capacity || '',
    'Solar Tilt (degrees)': site.powerSourceDetails?.solar?.tilt || '',
    'Solar Inverter Size (kW)': site.powerSourceDetails?.solar?.inverterSize || '',
    'Solar Autonomy (kWh)': site.powerSourceDetails?.solar?.autonomy || '',
    'Grid Connection Type': site.powerSourceDetails?.grid?.connectionType || '',
    'Grid Voltage (V)': site.powerSourceDetails?.grid?.voltage || '',
    'Grid Load (kW)': site.powerSourceDetails?.grid?.load || ''
  }));
}

// API Functions

// Makes an API call to the specified endpoint
async function makeApiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : '',
        ...options.headers
      },
      ...options
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// Fetches all sites from the API
async function fetchSites(forceRefresh = false) {
  try {
    const data = await makeApiCall('/sites');
    return data;
  } catch (error) {
    console.error('Error fetching sites:', error);
    showNotification(error.message || 'Failed to load sites', 'error');
    return [];
  }
}

// Logs in a user with provided credentials
async function loginUser(username, password) {
  try {
    const data = await makeApiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

// Registers a new user with provided credentials
async function registerUser(username, password) {
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  if (!password.match(/([0-9])/)) {
    throw new Error('Password must contain at least one number');
  }
  
  if (!password.match(/([a-z].*[A-Z])|([A-Z].*[a-z])/)) {
    throw new Error('Password must contain both uppercase and lowercase letters');
  }
  
  try {
    const data = await makeApiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role: 'user' })
    });
    return data;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
}

// Adds a new site (admin only)
async function addSite(siteData) {
  if (!checkAccessControl('admin')) {
    throw new Error('Only admins can add sites');
  }
  
  try {
    const data = await makeApiCall('/sites', {
      method: 'POST',
      body: JSON.stringify(siteData)
    });
    return data;
  } catch (error) {
    console.error('Error adding site:', error);
    throw error;
  }
}

// Updates an existing site (admin only)
async function updateSite(siteId, siteData) {
  if (!checkAccessControl('admin')) {
    throw new Error('Only admins can update sites');
  }
  
  try {
    const data = await makeApiCall(`/sites/${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(siteData)
    });
    return data;
  } catch (error) {
    console.error('Error updating site:', error);
    throw error;
  }
}

// Deletes a site (admin only)
async function deleteSite(siteId) {
  if (!checkAccessControl('admin')) {
    throw new Error('Only admins can delete sites');
  }
  
  try {
    await makeApiCall(`/sites/${siteId}`, {
      method: 'DELETE'
    });
    return true;
  } catch (error) {
    console.error('Error deleting site:', error);
    throw error;
  }
}

// Validates form inputs for power source details
function validateSiteForm(formData, powerSources, formId) {
  // Only validate fields for power sources that are selected (present in powerSources array)
  const errors = [];
  const powerSourceConfig = {
    Grid: ['connectionType', 'voltage', 'load'],
    Generator: ['type', 'capacity'],
    Battery: ['type', 'capacity'],
    Solar: ['type', 'capacity']
  };

  // If powerSources is not provided or empty, derive selected powerSources from the form
  if (!Array.isArray(powerSources) || powerSources.length === 0) {
    if (formId) {
      const formEl = document.getElementById(formId);
      if (formEl) {
        powerSources = Array.from(formEl.querySelectorAll(`input[name="powerSources"]:checked`)).map(el => el.value);
      }
    }
    // If still empty, nothing to validate for power sources
    if (!Array.isArray(powerSources) || powerSources.length === 0) return true;
  }

  powerSources.forEach(source => {
    const fields = powerSourceConfig[source];
    if (!fields) return; // unknown source

    fields.forEach(field => {
      const key = `powerSourceDetails.${source.toLowerCase()}.${field}`;
      const value = formData.get(key);

      // treat undefined/null/empty string as missing
      if (value === null || value === undefined || String(value).trim() === '') {
        errors.push(`${source} ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is required`);
        return;
      }

      // Numeric checks for fields that should be numbers
      const numericFields = ['capacity', 'voltage', 'load', 'autonomy', 'fuelTank', 'depth', 'quantity', 'tilt', 'inverterSize'];
      if (numericFields.includes(field)) {
        const numValue = Number(value);
        if (isNaN(numValue) || numValue <= 0) {
          errors.push(`${source} ${field.replace(/([A-Z])/g, ' $1').toLowerCase()} must be a positive number`);
        }
      }
    });
  });

  if (errors.length > 0) {
    showNotification(errors.join(', '), 'error');
    return false;
  }

  return true;
}

// Validates form inputs in real-time
function validateFormInputs(formId) {
  const form = document.getElementById(formId);
  const powerSources = Array.from(form.querySelectorAll(`input[name="powerSources"]:checked`)).map(el => el.value);
  const powerSourceConfig = {
    Grid: ['connectionType', 'voltage', 'load'],
    Generator: ['type', 'capacity', 'load', 'autonomy', 'fuelTank'],
    Battery: ['type', 'capacity', 'voltage', 'depth', 'quantity'],
    Solar: ['type', 'capacity', 'tilt', 'inverterSize', 'autonomy']
  };

  let isValid = true;

  powerSources.forEach(source => {
    const fields = powerSourceConfig[source];
    if (fields) {
      fields.forEach(field => {
        const input = form.querySelector(`[name="powerSourceDetails.${source.toLowerCase()}.${field}"]`);
        if (input) {
          if (!input.value.trim()) {
            input.classList.add('error');
            isValid = false;
          } else if (['capacity', 'voltage', 'load', 'autonomy', 'fuelTank', 'depth', 'quantity', 'tilt', 'inverterSize'].includes(field)) {
            const numValue = Number(input.value);
            if (isNaN(numValue) || numValue <= 0) {
              input.classList.add('error');
              isValid = false;
            } else {
              input.classList.remove('error');
            }
          } else {
            input.classList.remove('error');
          }
        }
      });
    }
  });

  return isValid;
}

// App Functions

// Initializes the application by loading sites and setting up the UI
async function initializeApp() {
  try {
    sitesList.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Loading sites...</div>';
    
    const sites = await fetchSites();
    filteredSites = sites;
    
    // Configure UI based on user role
    if (currentUser && currentUser.role === 'admin') {
      addSiteBtn.style.display = 'flex';
      if (exportExcelBtn) exportExcelBtn.style.display = 'flex';
      userRoleBadge.innerHTML = '<i class="fas fa-shield-alt"></i> Admin';
      document.getElementById('editSiteBtn').style.display = 'inline-block';
      document.getElementById('deleteSiteBtn').style.display = 'inline-block';
    } else {
      addSiteBtn.style.display = 'none';
      if (exportExcelBtn) exportExcelBtn.style.display = 'none';
      userRoleBadge.innerHTML = '<i class="fas fa-user"></i> User';
      document.getElementById('editSiteBtn').style.display = 'none';
      document.getElementById('deleteSiteBtn').style.display = 'none';
    }
    
    // Set user avatar and title
    if (currentUser) {
      userAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
      userAvatar.title = currentUser.username;
    } else {
      userAvatar.textContent = 'G';
      userAvatar.title = 'Guest';
    }
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers.clear();
    
    // Add markers for each site
    sites.forEach(site => {
      if (!markers.has(site.id)) {
        const markerIcon = L.divIcon({
          className: `custom-marker ${site.status}`,
          html: `<div class="tower-icon ${site.status}"><i class="fas fa-tower-cell"></i></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        
        const marker = L.marker([site.location.lat, site.location.lng], {
          icon: markerIcon,
          riseOnHover: true
        }).addTo(map);
        
        marker.bindPopup(createSitePopupContent(site), {
          className: 'custom-popup',
          maxWidth: 300,
          minWidth: 200,
          autoClose: false,
          closeOnClick: false
        });
         
        marker.on('mouseover', () => {
          marker.openPopup();
          document.querySelectorAll('.site-item').forEach(item => {
            item.classList.toggle('highlighted', item.dataset.siteId === site.id.toString());
          });
        });
        
        marker.on('mouseout', () => {
          document.querySelectorAll('.site-item').forEach(item => {
            item.classList.remove('highlighted');
          });
        });
        
        marker.on('click', () => {
          focusOnSite(site.id);
        });
        
        markers.set(site.id, marker);
      }
    });
    
    renderSitesPage(currentPage);
    
    if (filteredSites.length > 0) {
      focusOnSite(filteredSites[0].id);
    }
    // In some cases the map container was hidden when Leaflet initialized.
    // Invalidate size after a short delay to force a redraw and proper centering.
    setTimeout(() => {
      try { map.invalidateSize(); } catch (e) { /* ignore */ }
    }, 250);
  } catch (error) {
    console.error('Initialization error:', error);
    showNotification('Failed to initialize application', 'error');
  }
}

// Creates HTML content for a site's map popup
function createSitePopupContent(site) {
  const actions = checkAccessControl('admin') ? `
    <div class="popup-actions">
      <button class="popup-btn" onclick="focusOnSite('${site.id}')">
        <i class="fas fa-info-circle"></i> Details
      </button>
      <button class="popup-btn" onclick="window.open('https://www.google.com/maps?q=${site.location && site.location.lat},${site.location && site.location.lng}', '_blank')">
        <i class="fas fa-external-link-alt"></i> Open in Maps
      </button>
    </div>
  ` : `
    <div class="popup-actions">
      <button class="popup-btn" onclick="focusOnSite('${site.id}')">
        <i class="fas fa-info-circle"></i> Details
      </button>
    </div>
  `;

  const techName = site.technician && site.technician.name ? site.technician.name : '';
  const techPhone = site.technician && site.technician.phone ? site.technician.phone : '';
  const telHref = techPhone ? 'tel:' + (techPhone + '').replace(/[^+0-9]/g, '') : '';

  return `
    <div class="custom-popup minimal-popup">
      <div class="popup-header">${site.name || 'Unnamed Site'}</div>
      <div class="popup-id"><strong>ID:</strong> ${site.id || 'N/A'}</div>
      <div class="popup-address"><strong>Address:</strong> ${site.address || 'N/A'}</div>

      <div class="popup-meta">
        <div class="popup-meta-item">
          <i class="fas fa-ruler-vertical"></i>
          <span><strong>Height:</strong> ${site.height || 'N/A'}</span>
        </div>
        <div class="popup-meta-item">
          <i class="fas fa-bolt"></i>
          <span><strong>Capacity:</strong> ${site.capacity || 'N/A'}</span>
        </div>
      </div>

  <div class="popup-tech">${ techPhone ? '<a class="popup-phone" href="' + telHref + '">' + techPhone + '</a>' + '<a class="popup-call-btn" href="' + telHref + '" title="Call"><i class="fas fa-phone"></i></a>' : '' }</div>

      ${actions}
    </div>
  `;
}

// Renders the sites list for the specified page
function renderSitesPage(page) {
  const totalPages = Math.ceil(filteredSites.length / sitesPerPage);
  if (page < 1) page = 1;
  if (page > totalPages && totalPages > 0) page = totalPages;

  currentPage = page;
  const startIndex = (page - 1) * sitesPerPage;
  const endIndex = startIndex + sitesPerPage;
  const pageSites = filteredSites.slice(startIndex, endIndex);

  const fragment = document.createDocumentFragment();

  if (pageSites.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.innerHTML = `
      <i class="fas fa-search"></i>
      <p>No sites found matching your search</p>
      <button class="btn clear-search" onclick="clearSearch()">
        <i class="fas fa-times"></i> Clear search
      </button>
    `;
    fragment.appendChild(noResults);
  } else {
    pageSites.forEach(site => {
      const siteItem = document.createElement('div');
      siteItem.className = `site-item ${site.id === selectedSiteId ? 'selected' : ''}`;
      siteItem.dataset.siteId = site.id;
      
      const actions = checkAccessControl('admin') ? `
        <div class="action-btns">
          <button class="action-btn view-btn" onclick="event.stopPropagation(); focusOnSite('${site.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn map-btn" onclick="event.stopPropagation(); zoomToCoordinates(${site.location.lat}, ${site.location.lng})">
            <i class="fas fa-map-marked-alt"></i>
          </button>
          <button class="action-btn edit-btn" onclick="event.stopPropagation(); openEditModal('${site.id}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteSite('${site.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      ` : `
        <div class="action-btns">
          <button class="action-btn view-btn" onclick="event.stopPropagation(); focusOnSite('${site.id}')">
            <i class="fas fa-eye"></i>
          </button>
          <button class="action-btn map-btn" onclick="event.stopPropagation(); zoomToCoordinates(${site.location.lat}, ${site.location.lng})">
            <i class="fas fa-map-marked-alt"></i>
          </button>
        </div>
      `;

      siteItem.innerHTML = `
        <div class="site-status ${site.status}"></div>
        <div class="site-info">
          <h3 class="site-name">${site.name}</h3>
          <div class="site-id-small">ID: ${site.id}</div>
          <div class="site-address">${site.address}</div>
          <div class="site-meta">
            <div class="meta-item">
              <i class="fas fa-clock"></i>
              <span>${site.uptime}</span>
            </div>
            <div class="meta-item">
              <i class="fas fa-ruler-vertical"></i>
              <span>${site.height}</span>
            </div>
          </div>
        </div>
        ${actions}
      `;

      siteItem.addEventListener('click', () => focusOnSite(site.id));
      fragment.appendChild(siteItem);
    });
  }

  sitesList.innerHTML = '';
  sitesList.appendChild(fragment);

  pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage === 1;
  nextBtn.disabled = currentPage === totalPages || totalPages === 0;
}

// Clears the search input and triggers a new search
function clearSearch() {
  searchInput.value = '';
  searchSite();
}

// Focuses on a specific site, updating the UI and map
function focusOnSite(siteId) {
  siteId = normalizeId(siteId);
  const site = filteredSites.find(s => s.id === siteId);
  if (!site) return;

  selectedSiteId = siteId;
  
  renderSitesPage(currentPage);
  
  displaySiteDetails(site);

  if (site.location) {
    map.setView([site.location.lat, site.location.lng], 15);
    const marker = markers.get(siteId);
    if (marker) {
      marker.openPopup();
      
      marker.setIcon(
        L.divIcon({
          className: `custom-marker ${site.status} highlighted`,
          html: `<div class="tower-icon ${site.status}"><i class="fas fa-tower-cell"></i></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      );
      
      setTimeout(() => {
        marker.setIcon(
          L.divIcon({
            className: `custom-marker ${site.status}`,
            html: `<div class="tower-icon ${site.status}"><i class="fas fa-tower-cell"></i></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        );
      }, 2000);
    }
  }
}

// Copies text to the clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showNotification('Coordinates copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy: ', err);
    showNotification('Failed to copy coordinates', 'error');
  });
}

// Initiates a phone call to the specified numbers
function initiateCall(phoneNumber) {
  if (phoneNumber && confirm(`Call technician at ${phoneNumber}?`)) {
    window.open(`tel:${phoneNumber}`);
  }
}

// Zooms the map to the specified coordinates
function zoomToCoordinates(lat, lng) {
  map.setView([lat, lng], 16);
  
  const highlight = L.circle([lat, lng], {
    radius: 50,
    color: '#3388ff',
    fillColor: '#3388ff',
    fillOpacity: 0.3
  }).addTo(map);
  
  setTimeout(() => {
    map.removeLayer(highlight);
  }, 3000);
}

// Searches for sites based on the search input
async function searchSite() {
  const input = searchInput.value.trim().toLowerCase();
  try {
    const sites = await fetchSites();
    
    if (!input) {
      filteredSites = sites;
    } else {
      filteredSites = sites.filter(site => {
        return (
          site.id.toString() === input ||
          site.name.toLowerCase().includes(input) ||
          site.address.toLowerCase().includes(input) ||
          (site.tags && site.tags.some(tag => tag.toLowerCase().includes(input))) ||
          (site.powerSources && site.powerSources.some(source => source.toLowerCase().includes(input))) ||
          (site.capacity && site.capacity.toLowerCase().includes(input))
        );
      });
    }

    currentPage = 1;
    renderSitesPage(currentPage);
    
    if (filteredSites.length > 0) {
      focusOnSite(filteredSites[0].id);
    } else {
      if (detailSiteContent) detailSiteContent.style.display = 'none';
      if (noSiteSelected) noSiteSelected.style.display = 'block';
    }
  } catch (error) {
    console.error('Search error:', error);
    showNotification('Failed to search sites', 'error');
  }
}

// Toggles power source details visibility based on checkbox selection
function togglePowerSourceDetails(formId = 'siteForm') {
  const powerSourceConfig = {
    Grid: ['connectionType', 'voltage', 'load'],
    Generator: ['type', 'capacity', 'load', 'autonomy', 'fuelTank'],
    Battery: ['type', 'capacity', 'voltage', 'depth', 'quantity'],
    Solar: ['type', 'capacity', 'tilt', 'inverterSize', 'autonomy']
  };

  Object.keys(powerSourceConfig).forEach(source => {
    const checkbox = document.querySelector(`#${formId} input[name="powerSources"][value="${source}"]`);
    // add form uses ids like 'gridDetails', edit form uses 'editGridDetails'
    const detailsId = formId === 'siteForm' ? `${source.toLowerCase()}Details` : `edit${source}Details`;
    const detailsDiv = document.getElementById(detailsId);
    if (checkbox && detailsDiv) {
      detailsDiv.style.display = checkbox.checked ? 'block' : 'none';
      powerSourceConfig[source].forEach(field => {
        const selector = `#${formId} input[name="powerSourceDetails.${source.toLowerCase()}.${field}"], #${formId} select[name="powerSourceDetails.${source.toLowerCase()}.${field}"]`;
        const input = document.querySelector(selector);
        if (input) {
          if (!checkbox.checked) {
            input.value = '';
            input.disabled = true;
          } else {
            input.disabled = false;
          }
        }
      });
    }
  });
}

// Opens the modal for adding a new site (admin only)
function openModal() {
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can add sites', 'error');
    return;
  }
  
  if (addSiteModal) addSiteModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  const siteNameInput = document.getElementById('siteName');
  if (siteNameInput) siteNameInput.focus();
  if (siteForm) siteForm.reset();
  togglePowerSourceDetails('siteForm');
}

// Closes the add site modal
function closeModal() {
  if (addSiteModal) addSiteModal.style.display = 'none';
  document.body.style.overflow = 'auto';
  if (siteForm) siteForm.reset();
  togglePowerSourceDetails('siteForm');
}

// Opens the modal for editing a site (admin only). If focusSource is provided (e.g. 'Grid'),
// the edit form will show only that power source's details (power-only edit).
function openEditModal(siteId, focusSource) {
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can edit sites', 'error');
    return;
  }
  
  siteId = normalizeId(siteId);
  const site = filteredSites.find(s => s.id === siteId);
  if (!site) return;

  const editSiteId = document.getElementById('editSiteId');
  const editName = document.getElementById('editName');
  const editAddress = document.getElementById('editAddress');
  const editLat = document.getElementById('editLat');
  const editLng = document.getElementById('editLng');
  const editStatus = document.getElementById('editStatus');
  const editHeight = document.getElementById('editHeight');
  const editCapacity = document.getElementById('editCapacity');
  const editTags = document.getElementById('editTags');
  const editInstallationDate = document.getElementById('editInstallationDate');
  const editLastMaintenance = document.getElementById('editLastMaintenance');
  const editTechnicianName = document.getElementById('editTechnicianName');
  const editTechnicianPhone = document.getElementById('editTechnicianPhone');
  const editNotes = document.getElementById('editNotes');
  const editGridConnectionType = document.getElementById('editGridConnectionType');
  const editGridVoltage = document.getElementById('editGridVoltage');
  const editGridLoad = document.getElementById('editGridLoad');
  const editGeneratorType = document.getElementById('editGeneratorType');
  const editGeneratorCapacity = document.getElementById('editGeneratorCapacity');
  const editGeneratorLoad = document.getElementById('editGeneratorLoad');
  const editGeneratorAutonomy = document.getElementById('editGeneratorAutonomy');
  const editGeneratorFuelTank = document.getElementById('editGeneratorFuelTank');
  const editBatteryType = document.getElementById('editBatteryType');
  const editBatteryCapacity = document.getElementById('editBatteryCapacity');
  const editBatteryVoltage = document.getElementById('editBatteryVoltage');
  const editBatteryDepth = document.getElementById('editBatteryDepth');
  const editBatteryQuantity = document.getElementById('editBatteryQuantity');
  const editSolarType = document.getElementById('editSolarType');
  const editSolarCapacity = document.getElementById('editSolarCapacity');
  const editSolarTilt = document.getElementById('editSolarTilt');
  const editSolarInverterSize = document.getElementById('editSolarInverterSize');
  const editSolarAutonomy = document.getElementById('editSolarAutonomy');
  const editOtherType = document.getElementById('editOtherType');
  const editOtherCapacity = document.getElementById('editOtherCapacity');
  const editOtherDescription = document.getElementById('editOtherDescription');

  if (editSiteId) editSiteId.value = site.id;
  if (editName) editName.value = site.name;
  if (editAddress) editAddress.value = site.address;
  if (editLat) editLat.value = site.location.lat;
  if (editLng) editLng.value = site.location.lng;
  if (editStatus) editStatus.value = site.status;
  if (editHeight) editHeight.value = site.height;
  if (editCapacity) editCapacity.value = site.capacity || 'Medium';
  if (editTags) editTags.value = site.tags ? site.tags.join(', ') : '';
  if (editInstallationDate) editInstallationDate.value = site.installationDate ? new Date(site.installationDate).toISOString().split('T')[0] : '';
  if (editLastMaintenance) editLastMaintenance.value = site.lastMaintenance ? new Date(site.lastMaintenance).toISOString().split('T')[0] : '';
  if (editTechnicianName) editTechnicianName.value = site.technician?.name || '';
  if (editTechnicianPhone) editTechnicianPhone.value = site.technician?.phone || '';
  if (editNotes) editNotes.value = site.notes || '';
  if (editGridConnectionType) editGridConnectionType.value = site.powerSourceDetails?.grid?.connectionType || '';
  if (editGridVoltage) editGridVoltage.value = site.powerSourceDetails?.grid?.voltage || '';
  if (editGridLoad) editGridLoad.value = site.powerSourceDetails?.grid?.load || '';
  if (editGeneratorType) editGeneratorType.value = site.powerSourceDetails?.generator?.type || '';
  if (editGeneratorCapacity) editGeneratorCapacity.value = site.powerSourceDetails?.generator?.capacity || '';
  if (editGeneratorLoad) editGeneratorLoad.value = site.powerSourceDetails?.generator?.load || '';
  if (editGeneratorAutonomy) editGeneratorAutonomy.value = site.powerSourceDetails?.generator?.autonomy || '';
  if (editGeneratorFuelTank) editGeneratorFuelTank.value = site.powerSourceDetails?.generator?.fuelTank || '';
  if (editBatteryType) editBatteryType.value = site.powerSourceDetails?.battery?.type || '';
  if (editBatteryCapacity) editBatteryCapacity.value = site.powerSourceDetails?.battery?.capacity || '';
  if (editBatteryVoltage) editBatteryVoltage.value = site.powerSourceDetails?.battery?.voltage || '';
  if (editBatteryDepth) editBatteryDepth.value = site.powerSourceDetails?.battery?.depth || '';
  if (editBatteryQuantity) editBatteryQuantity.value = site.powerSourceDetails?.battery?.quantity || '';
  if (editSolarType) editSolarType.value = site.powerSourceDetails?.solar?.type || '';
  if (editSolarCapacity) editSolarCapacity.value = site.powerSourceDetails?.solar?.capacity || '';
  if (editSolarTilt) editSolarTilt.value = site.powerSourceDetails?.solar?.tilt || '';
  if (editSolarInverterSize) editSolarInverterSize.value = site.powerSourceDetails?.solar?.inverterSize || '';
  if (editSolarAutonomy) editSolarAutonomy.value = site.powerSourceDetails?.solar?.autonomy || '';
  if (editOtherType) editOtherType.value = site.powerSourceDetails?.other?.type || '';
  if (editOtherCapacity) editOtherCapacity.value = site.powerSourceDetails?.other?.capacity || '';
  if (editOtherDescription) editOtherDescription.value = site.powerSourceDetails?.other?.description || '';

  // Set power source checkboxes in edit form based on site.powerSources
  const editCheckboxes = document.querySelectorAll('#editSiteForm input[name="powerSources"]');
  if (editCheckboxes) {
    editCheckboxes.forEach(cb => {
      // If a specific source is requested, enable only that checkbox to allow power-only editing.
      if (focusSource) {
        cb.checked = cb.value === focusSource;
      } else {
        cb.checked = Array.isArray(site.powerSources) && site.powerSources.includes(cb.value);
      }
    });
  }

  // If focusSource specified, update modal title (if present) and ensure only that source details are visible
  if (focusSource) {
    const editModalTitle = document.getElementById('editModalTitle');
    if (editModalTitle) editModalTitle.textContent = `Edit ${focusSource} (power-only)`;
  }

  if (editSiteModal) editSiteModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (editName) editName.focus();
  // Set power-only edit focus so submit logic knows to merge only power details
  currentEditFocus = focusSource || null;

  // If in power-only mode, disable non-power inputs to avoid accidental edits and validation
  if (currentEditFocus) {
    // disable general site fields
    ['editName','editAddress','editLat','editLng','editStatus','editHeight','editCapacity','editTags','editInstallationDate','editLastMaintenance','editTechnicianName','editTechnicianPhone','editNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
  }
  togglePowerSourceDetails('editSiteForm');
}

// Closes the edit site modal
function closeEditModal() {
  if (editSiteModal) editSiteModal.style.display = 'none';
  document.body.style.overflow = 'auto';
  if (editSiteForm) editSiteForm.reset();
  togglePowerSourceDetails('editSiteForm');
  // Clear power-only edit mode and re-enable inputs
  if (currentEditFocus) {
    ['editName','editAddress','editLat','editLng','editStatus','editHeight','editCapacity','editTags','editInstallationDate','editLastMaintenance','editTechnicianName','editTechnicianPhone','editNotes'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
    currentEditFocus = null;
    const editModalTitle = document.getElementById('editModalTitle');
    if (editModalTitle) editModalTitle.textContent = 'Edit Site';
  }
}

// Compact power-source modal handlers (power-only edits)
function openPowerSourceModal(siteId, source) {
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can edit power sources', 'error');
    return;
  }

  const modal = document.getElementById('powerSourceModal');
  const title = document.getElementById('powerSourceModalTitle');
  const site = filteredSites.find(s => s.id === normalizeId(siteId));
  if (!site) return;

  // populate hidden site id
  const psSiteId = document.getElementById('psSiteId');
  if (psSiteId) psSiteId.value = site.id;

  // hide all groups then show the selected one
  ['psGridGroup','psGeneratorGroup','psBatteryGroup','psSolarGroup','psOtherGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const groupId = `ps${source}Group`;
  const groupEl = document.getElementById(groupId);
  if (groupEl) groupEl.style.display = 'block';

  // set title
  if (title) title.textContent = `Edit ${source} (power-only)`;

  // populate fields with existing values if any
  const details = site.powerSourceDetails && site.powerSourceDetails[source.toLowerCase()];
  if (source === 'Grid') {
    const c = document.getElementById('psGridConnectionType');
    const v = document.getElementById('psGridVoltage');
    const l = document.getElementById('psGridLoad');
    if (c) c.value = details?.connectionType || '';
    if (v) v.value = details?.voltage ?? '';
    if (l) l.value = details?.load ?? '';
  } else if (source === 'Generator') {
    document.getElementById('psGeneratorType').value = details?.type || '';
    document.getElementById('psGeneratorCapacity').value = details?.capacity ?? '';
    document.getElementById('psGeneratorLoad').value = details?.load ?? '';
    document.getElementById('psGeneratorAutonomy').value = details?.autonomy ?? '';
    document.getElementById('psGeneratorFuelTank').value = details?.fuelTank ?? '';
  } else if (source === 'Battery') {
    document.getElementById('psBatteryType').value = details?.type || '';
    document.getElementById('psBatteryCapacity').value = details?.capacity ?? '';
  } else if (source === 'Solar') {
    document.getElementById('psSolarType').value = details?.type || '';
    document.getElementById('psSolarCapacity').value = details?.capacity ?? '';
  } else if (source === 'Other') {
    document.getElementById('psOtherType').value = details?.type || '';
    document.getElementById('psOtherCapacity').value = details?.capacity ?? '';
    document.getElementById('psOtherDescription').value = details?.description || '';
  }

  // mark global flag so submit knows which source to update
  currentEditFocus = source;

  // show modal
  if (modal) modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePowerSourceModal() {
  const modal = document.getElementById('powerSourceModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = 'auto';
  // clear errors
  document.querySelectorAll('#powerSourceForm .field-error').forEach(el => el.textContent = '');
  currentEditFocus = null;
}

function validatePowerSourceForm() {
  const f = currentEditFocus;
  if (!f) return false;
  let ok = true;
  // clear previous
  document.querySelectorAll('#powerSourceForm .field-error').forEach(el => el.textContent = '');

  if (f === 'Grid') {
    const v = document.getElementById('psGridVoltage');
    const l = document.getElementById('psGridLoad');
    if (v && (v.value === '' || Number(v.value) <= 0)) {
      document.getElementById('err-psGridVoltage').textContent = 'Voltage must be a positive number';
      ok = false;
    }
    if (l && (l.value === '' || Number(l.value) <= 0)) {
      document.getElementById('err-psGridLoad').textContent = 'Load must be a positive number';
      ok = false;
    }
  } else if (f === 'Generator') {
    const cap = document.getElementById('psGeneratorCapacity');
    if (cap && (cap.value === '' || Number(cap.value) <= 0)) {
      document.getElementById('err-psGeneratorCapacity').textContent = 'Capacity must be a positive number';
      ok = false;
    }
  } else if (f === 'Other') {
    const t = document.getElementById('psOtherType');
    const c = document.getElementById('psOtherCapacity');
    const d = document.getElementById('psOtherDescription');
    const hasType = t && t.value.trim() !== '';
    const hasCapacity = c && c.value !== '' && Number(c.value) > 0;
    const hasDesc = d && d.value.trim() !== '';
    if (!hasType && !hasCapacity && !hasDesc) {
      document.getElementById('err-psOtherType').textContent = 'Provide at least a type, capacity, or description';
      ok = false;
    }
  }
  // other sources can have lighter validation as needed
  return ok;
}

// Handle compact modal submit: provide a reusable processor and attach to both form submit and button click
async function processPowerSourceForm() {
  if (!currentEditFocus) return closePowerSourceModal();
  if (!validatePowerSourceForm()) {
    showNotification('Please fix the highlighted errors before saving', 'error');
    console.debug('Power source validation failed for', currentEditFocus);
    return;
  }

  const siteId = normalizeId(document.getElementById('psSiteId').value);
  const existing = filteredSites.find(s => s.id === siteId);
  if (!existing) {
    showNotification('Site data not found', 'error');
    return;
  }

  // clone existing
  const payload = JSON.parse(JSON.stringify(existing));
  const f = currentEditFocus;
  payload.powerSourceDetails = payload.powerSourceDetails || {};

  if (f === 'Grid') {
    payload.powerSourceDetails.grid = {
      connectionType: document.getElementById('psGridConnectionType').value || undefined,
      voltage: document.getElementById('psGridVoltage').value ? Number(document.getElementById('psGridVoltage').value) : undefined,
      load: document.getElementById('psGridLoad').value ? Number(document.getElementById('psGridLoad').value) : undefined
    };
    if (!payload.powerSources) payload.powerSources = [];
    if (!payload.powerSources.includes('Grid')) payload.powerSources.push('Grid');
  } else if (f === 'Generator') {
    payload.powerSourceDetails.generator = {
      type: document.getElementById('psGeneratorType').value || undefined,
      capacity: document.getElementById('psGeneratorCapacity').value ? Number(document.getElementById('psGeneratorCapacity').value) : undefined,
      load: document.getElementById('psGeneratorLoad').value ? Number(document.getElementById('psGeneratorLoad').value) : undefined,
      autonomy: document.getElementById('psGeneratorAutonomy').value ? Number(document.getElementById('psGeneratorAutonomy').value) : undefined,
      fuelTank: document.getElementById('psGeneratorFuelTank').value ? Number(document.getElementById('psGeneratorFuelTank').value) : undefined
    };
    if (!payload.powerSources) payload.powerSources = [];
    if (!payload.powerSources.includes('Generator')) payload.powerSources.push('Generator');
  } else if (f === 'Battery') {
    payload.powerSourceDetails.battery = {
      type: document.getElementById('psBatteryType').value || undefined,
      capacity: document.getElementById('psBatteryCapacity').value ? Number(document.getElementById('psBatteryCapacity').value) : undefined
    };
    if (!payload.powerSources) payload.powerSources = [];
    if (!payload.powerSources.includes('Battery')) payload.powerSources.push('Battery');
  } else if (f === 'Solar') {
    payload.powerSourceDetails.solar = {
      type: document.getElementById('psSolarType').value || undefined,
      capacity: document.getElementById('psSolarCapacity').value ? Number(document.getElementById('psSolarCapacity').value) : undefined
    };
    if (!payload.powerSources) payload.powerSources = [];
    if (!payload.powerSources.includes('Solar')) payload.powerSources.push('Solar');
  } else if (f === 'Other') {
    payload.powerSourceDetails.other = {
      type: document.getElementById('psOtherType').value || undefined,
      capacity: document.getElementById('psOtherCapacity').value ? Number(document.getElementById('psOtherCapacity').value) : undefined,
      description: document.getElementById('psOtherDescription').value || undefined
    };
    if (!payload.powerSources) payload.powerSources = [];
    if (!payload.powerSources.includes('Other')) payload.powerSources.push('Other');
  }

  try {
    const btn = document.getElementById('psSubmitBtn');
    const btnText = document.getElementById('psSubmitBtnText');
    if (btn && btnText) showLoading(btn, btnText, 'Saving...');

    const res = await updateSite(siteId, payload);
    filteredSites = await fetchSites(true);
    renderSitesPage(currentPage);
    focusOnSite(siteId);
    showNotification('Power source updated');
    closePowerSourceModal();
  } catch (err) {
    console.error(err);
    showNotification('Failed to update power source', 'error');
  } finally {
    const btn = document.getElementById('psSubmitBtn');
    const btnText = document.getElementById('psSubmitBtnText');
    if (btn && btnText) hideLoading(btn, btnText, 'Save');
  }
}

// Attach listeners: form submit and Save button click
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('powerSourceForm');
  if (form) form.addEventListener('submit', function(e) { e.preventDefault(); processPowerSourceForm(); });
  const saveBtn = document.getElementById('psSubmitBtn');
  if (saveBtn) saveBtn.addEventListener('click', function(e) { e.preventDefault(); processPowerSourceForm(); });
});

// Submits the add site form (admin only)
async function submitSiteForm(e) {
  e.preventDefault();
  
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can add sites', 'error');
    return;
  }
  
  const formData = new FormData(siteForm);
  const powerSources = Array.from(document.querySelectorAll('#siteForm input[name="powerSources"]:checked')).map(el => el.value);
  const tags = formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()).filter(tag => tag) : [];
  
  // Validate form inputs
  if (!validateSiteForm(formData, powerSources, 'siteForm')) {
    return;
  }

  const newSite = {
    id: parseInt(formData.get('id')),
    name: formData.get('name'),
    address: formData.get('address'),
    status: formData.get('status'),
    uptime: '0%',
    height: formData.get('height'),
    powerSources: powerSources,
    powerSourceDetails: {},
    capacity: formData.get('capacity'),
    tags: tags,
    location: {
      lat: parseFloat(formData.get('location.lat')),
      lng: parseFloat(formData.get('location.lng'))
    },
    installationDate: formData.get('installationDate') || undefined,
    lastMaintenance: formData.get('lastMaintenance') || undefined,
    technician: {
      name: formData.get('technician.name') || undefined,
      phone: formData.get('technician.phone') || undefined
    },
    notes: formData.get('notes') || undefined
  };

  // Populate powerSourceDetails
  if (powerSources.includes('Grid')) {
    newSite.powerSourceDetails.grid = {
      connectionType: formData.get('powerSourceDetails.grid.connectionType') || undefined,
      voltage: formData.get('powerSourceDetails.grid.voltage') ? Number(formData.get('powerSourceDetails.grid.voltage')) : undefined,
      load: formData.get('powerSourceDetails.grid.load') ? Number(formData.get('powerSourceDetails.grid.load')) : undefined
    };
  }
  if (powerSources.includes('Generator')) {
    newSite.powerSourceDetails.generator = {
      type: formData.get('powerSourceDetails.generator.type') || undefined,
      capacity: formData.get('powerSourceDetails.generator.capacity') ? Number(formData.get('powerSourceDetails.generator.capacity')) : undefined,
      load: formData.get('powerSourceDetails.generator.load') ? Number(formData.get('powerSourceDetails.generator.load')) : undefined,
      autonomy: formData.get('powerSourceDetails.generator.autonomy') ? Number(formData.get('powerSourceDetails.generator.autonomy')) : undefined,
      fuelTank: formData.get('powerSourceDetails.generator.fuelTank') ? Number(formData.get('powerSourceDetails.generator.fuelTank')) : undefined
    };
  }
  if (powerSources.includes('Battery')) {
    newSite.powerSourceDetails.battery = {
      type: formData.get('powerSourceDetails.battery.type') || undefined,
      capacity: formData.get('powerSourceDetails.battery.capacity') ? Number(formData.get('powerSourceDetails.battery.capacity')) : undefined,
      voltage: formData.get('powerSourceDetails.battery.voltage') ? Number(formData.get('powerSourceDetails.battery.voltage')) : undefined,
      depth: formData.get('powerSourceDetails.battery.depth') ? Number(formData.get('powerSourceDetails.battery.depth')) : undefined,
      quantity: formData.get('powerSourceDetails.battery.quantity') ? Number(formData.get('powerSourceDetails.battery.quantity')) : undefined
    };
  }
  if (powerSources.includes('Solar')) {
    newSite.powerSourceDetails.solar = {
      type: formData.get('powerSourceDetails.solar.type') || undefined,
      capacity: formData.get('powerSourceDetails.solar.capacity') ? Number(formData.get('powerSourceDetails.solar.capacity')) : undefined,
      tilt: formData.get('powerSourceDetails.solar.tilt') ? Number(formData.get('powerSourceDetails.solar.tilt')) : undefined,
      inverterSize: formData.get('powerSourceDetails.solar.inverterSize') ? Number(formData.get('powerSourceDetails.solar.inverterSize')) : undefined,
      autonomy: formData.get('powerSourceDetails.solar.autonomy') ? Number(formData.get('powerSourceDetails.solar.autonomy')) : undefined
    };
  }

  try {
    const submitSiteBtn = document.getElementById('submitSiteBtn');
    const submitSiteBtnText = document.getElementById('submitSiteBtnText');
    
    if (submitSiteBtn && submitSiteBtnText) {
      showLoading(submitSiteBtn, submitSiteBtnText, 'Registering...');
    }
    
    const createdSite = await addSite(newSite);
    
    const markerIcon = L.divIcon({
      className: `custom-marker ${createdSite.status}`,
      html: `<div class="tower-icon ${createdSite.status}"><i class="fas fa-tower-cell"></i></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    
    const marker = L.marker([createdSite.location.lat, createdSite.location.lng], {
      icon: markerIcon,
      riseOnHover: true
    }).addTo(map);
    
    marker.bindPopup(createSitePopupContent(createdSite), {
      className: 'custom-popup',
      maxWidth: 300,
      minWidth: 200,
      autoClose: false,
      closeOnClick: false
    });
    
    marker.on('mouseover', () => marker.openPopup());
    marker.on('click', () => focusOnSite(createdSite.id));
    
    markers.set(createdSite.id, marker);
    
    filteredSites = await fetchSites(true);
    renderSitesPage(currentPage);
    focusOnSite(createdSite.id);
    closeModal();
    if (siteForm) siteForm.reset();
    
    showNotification('Site registered successfully!');
  } catch (error) {
    console.error('Error submitting site:', error);
    showNotification('Failed to register site: ' + error.message, 'error');
  } finally {
    const submitSiteBtn = document.getElementById('submitSiteBtn');
    const submitSiteBtnText = document.getElementById('submitSiteBtnText');
    
    if (submitSiteBtn && submitSiteBtnText) {
      hideLoading(submitSiteBtn, submitSiteBtnText, 'Register Site');
    }
  }
}

// Submits the edit site form (admin only)
async function submitEditForm(e) {
  e.preventDefault();
  
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can edit sites', 'error');
    return;
  }
  
  const formData = new FormData(editSiteForm);
  const siteId = normalizeId(formData.get('id'));
  const powerSources = Array.from(document.querySelectorAll('#editSiteForm input[name="powerSources"]:checked')).map(el => el.value);
  const tags = formData.get('tags') ? formData.get('tags').split(',').map(tag => tag.trim()).filter(tag => tag) : [];
  
  // Validate form inputs
  // If in power-only mode, validate only the focused power source inputs
  if (currentEditFocus) {
    if (!validateSiteForm(formData, [currentEditFocus], 'editSiteForm')) return;
  } else {
    if (!validateSiteForm(formData, powerSources, 'editSiteForm')) return;
  }

  const updatedSite = {
    name: formData.get('name'),
    address: formData.get('address'),
    status: formData.get('status'),
    height: formData.get('height'),
    powerSources: powerSources,
    powerSourceDetails: {},
    capacity: formData.get('capacity'),
    tags: tags,
    location: {
      lat: parseFloat(formData.get('location.lat')),
      lng: parseFloat(formData.get('location.lng'))
    },
    installationDate: formData.get('installationDate') || undefined,
    lastMaintenance: formData.get('lastMaintenance') || undefined,
    technician: {
      name: formData.get('technician.name') || undefined,
      phone: formData.get('technician.phone') || undefined
    },
    notes: formData.get('notes') || undefined
  };

  // Populate powerSourceDetails for checked sources only
  if (powerSources.includes('Grid')) {
    updatedSite.powerSourceDetails.grid = {
      connectionType: formData.get('powerSourceDetails.grid.connectionType') || undefined,
      voltage: formData.get('powerSourceDetails.grid.voltage') ? Number(formData.get('powerSourceDetails.grid.voltage')) : undefined,
      load: formData.get('powerSourceDetails.grid.load') ? Number(formData.get('powerSourceDetails.grid.load')) : undefined
    };
  }
  if (powerSources.includes('Generator')) {
    updatedSite.powerSourceDetails.generator = {
      type: formData.get('powerSourceDetails.generator.type') || undefined,
      capacity: formData.get('powerSourceDetails.generator.capacity') ? Number(formData.get('powerSourceDetails.generator.capacity')) : undefined,
      load: formData.get('powerSourceDetails.generator.load') ? Number(formData.get('powerSourceDetails.generator.load')) : undefined,
      autonomy: formData.get('powerSourceDetails.generator.autonomy') ? Number(formData.get('powerSourceDetails.generator.autonomy')) : undefined,
      fuelTank: formData.get('powerSourceDetails.generator.fuelTank') ? Number(formData.get('powerSourceDetails.generator.fuelTank')) : undefined
    };
  }
  if (powerSources.includes('Battery')) {
    updatedSite.powerSourceDetails.battery = {
      type: formData.get('powerSourceDetails.battery.type') || undefined,
      capacity: formData.get('powerSourceDetails.battery.capacity') ? Number(formData.get('powerSourceDetails.battery.capacity')) : undefined,
      voltage: formData.get('powerSourceDetails.battery.voltage') ? Number(formData.get('powerSourceDetails.battery.voltage')) : undefined,
      depth: formData.get('powerSourceDetails.battery.depth') ? Number(formData.get('powerSourceDetails.battery.depth')) : undefined,
      quantity: formData.get('powerSourceDetails.battery.quantity') ? Number(formData.get('powerSourceDetails.battery.quantity')) : undefined
    };
  }
  if (powerSources.includes('Solar')) {
    updatedSite.powerSourceDetails.solar = {
      type: formData.get('powerSourceDetails.solar.type') || undefined,
      capacity: formData.get('powerSourceDetails.solar.capacity') ? Number(formData.get('powerSourceDetails.solar.capacity')) : undefined,
      tilt: formData.get('powerSourceDetails.solar.tilt') ? Number(formData.get('powerSourceDetails.solar.tilt')) : undefined,
      inverterSize: formData.get('powerSourceDetails.solar.inverterSize') ? Number(formData.get('powerSourceDetails.solar.inverterSize')) : undefined,
      autonomy: formData.get('powerSourceDetails.solar.autonomy') ? Number(formData.get('powerSourceDetails.solar.autonomy')) : undefined
    };
  }

  try {
    const updateSiteBtn = document.getElementById('updateSiteBtn');
    const updateSiteBtnText = document.getElementById('updateSiteBtnText');
    
    if (updateSiteBtn && updateSiteBtnText) {
      showLoading(updateSiteBtn, updateSiteBtnText, 'Updating...');
    }
    
    // If currentEditFocus is set, merge only the focused powerSourceDetails into the existing site
    let result;
    if (currentEditFocus) {
      const existing = filteredSites.find(s => s.id === siteId);
      if (!existing) throw new Error('Original site data not found');

      // start with a shallow clone of existing
      const merged = JSON.parse(JSON.stringify(existing));

      // ensure the focused source is present in the powerSources array
      if (!merged.powerSources) merged.powerSources = [];
      if (!merged.powerSources.includes(currentEditFocus)) merged.powerSources.push(currentEditFocus);

      // Build only the focused source details from form
      const f = currentEditFocus;
      const details = {};
      if (f === 'Grid') {
        details.connectionType = formData.get('powerSourceDetails.grid.connectionType') || undefined;
        details.voltage = formData.get('powerSourceDetails.grid.voltage') ? Number(formData.get('powerSourceDetails.grid.voltage')) : undefined;
        details.load = formData.get('powerSourceDetails.grid.load') ? Number(formData.get('powerSourceDetails.grid.load')) : undefined;
        merged.powerSourceDetails = merged.powerSourceDetails || {};
        merged.powerSourceDetails.grid = details;
      } else if (f === 'Generator') {
        merged.powerSourceDetails = merged.powerSourceDetails || {};
        merged.powerSourceDetails.generator = {
          type: formData.get('powerSourceDetails.generator.type') || undefined,
          capacity: formData.get('powerSourceDetails.generator.capacity') ? Number(formData.get('powerSourceDetails.generator.capacity')) : undefined,
          load: formData.get('powerSourceDetails.generator.load') ? Number(formData.get('powerSourceDetails.generator.load')) : undefined,
          autonomy: formData.get('powerSourceDetails.generator.autonomy') ? Number(formData.get('powerSourceDetails.generator.autonomy')) : undefined,
          fuelTank: formData.get('powerSourceDetails.generator.fuelTank') ? Number(formData.get('powerSourceDetails.generator.fuelTank')) : undefined
        };
      } else if (f === 'Battery') {
        merged.powerSourceDetails = merged.powerSourceDetails || {};
        merged.powerSourceDetails.battery = {
          type: formData.get('powerSourceDetails.battery.type') || undefined,
          capacity: formData.get('powerSourceDetails.battery.capacity') ? Number(formData.get('powerSourceDetails.battery.capacity')) : undefined,
          voltage: formData.get('powerSourceDetails.battery.voltage') ? Number(formData.get('powerSourceDetails.battery.voltage')) : undefined,
          depth: formData.get('powerSourceDetails.battery.depth') ? Number(formData.get('powerSourceDetails.battery.depth')) : undefined,
          quantity: formData.get('powerSourceDetails.battery.quantity') ? Number(formData.get('powerSourceDetails.battery.quantity')) : undefined
        };
      } else if (f === 'Solar') {
        merged.powerSourceDetails = merged.powerSourceDetails || {};
        merged.powerSourceDetails.solar = {
          type: formData.get('powerSourceDetails.solar.type') || undefined,
          capacity: formData.get('powerSourceDetails.solar.capacity') ? Number(formData.get('powerSourceDetails.solar.capacity')) : undefined,
          tilt: formData.get('powerSourceDetails.solar.tilt') ? Number(formData.get('powerSourceDetails.solar.tilt')) : undefined,
          inverterSize: formData.get('powerSourceDetails.solar.inverterSize') ? Number(formData.get('powerSourceDetails.solar.inverterSize')) : undefined,
          autonomy: formData.get('powerSourceDetails.solar.autonomy') ? Number(formData.get('powerSourceDetails.solar.autonomy')) : undefined
        };
      } else if (f === 'Other') {
        merged.powerSourceDetails = merged.powerSourceDetails || {};
        merged.powerSourceDetails.other = {
          type: formData.get('powerSourceDetails.other.type') || undefined,
          capacity: formData.get('powerSourceDetails.other.capacity') ? Number(formData.get('powerSourceDetails.other.capacity')) : undefined,
          description: formData.get('powerSourceDetails.other.description') || undefined
        };
      }

      // Send merged object (full site) to API so server receives preserved fields
      result = await updateSite(siteId, merged);
    } else {
      // Preserve certain fields from existing site if the edit form left them blank
      const existingSite = filteredSites.find(s => s.id === siteId);
      if (existingSite) {
        if (!updatedSite.installationDate) updatedSite.installationDate = existingSite.installationDate;
        if (!updatedSite.lastMaintenance) updatedSite.lastMaintenance = existingSite.lastMaintenance;
        if (!updatedSite.location || Number.isNaN(updatedSite.location.lat) || Number.isNaN(updatedSite.location.lng)) {
          updatedSite.location = existingSite.location;
        }
        if (!updatedSite.uptime) updatedSite.uptime = existingSite.uptime;
      }

      // For unchecked power sources, explicitly remove details
      const allPossibleSources = ['Grid', 'Generator', 'Battery', 'Solar', 'Other'];
      allPossibleSources.forEach(src => {
        if (!powerSources.includes(src) && existingSite.powerSourceDetails && existingSite.powerSourceDetails[src.toLowerCase()]) {
          delete updatedSite.powerSourceDetails[src.toLowerCase()];
        }
      });

      result = await updateSite(siteId, updatedSite);
    }
    
    if (markers.has(siteId)) {
      const marker = markers.get(siteId);
      marker.setLatLng([updatedSite.location.lat, updatedSite.location.lng]);
      // Update popup content
      marker.setPopupContent(createSitePopupContent(result));
      // Update marker icon to reflect new status (color/class)
      const newIcon = L.divIcon({
        className: `custom-marker ${result.status}`,
        html: `<div class="tower-icon ${result.status}"><i class="fas fa-tower-cell"></i></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      marker.setIcon(newIcon);
    }
    
    filteredSites = await fetchSites(true);
    renderSitesPage(currentPage);
    focusOnSite(siteId);
    closeEditModal();
    
    showNotification('Site updated successfully!');
  } catch (error) {
    console.error('Error updating site:', error);
    showNotification('Failed to update site: ' + error.message, 'error');
  } finally {
    const updateSiteBtn = document.getElementById('updateSiteBtn');
    const updateSiteBtnText = document.getElementById('updateSiteBtnText');
    
    if (updateSiteBtn && updateSiteBtnText) {
      hideLoading(updateSiteBtn, updateSiteBtnText, 'Update Site');
    }
  }
}

// Confirms and deletes a site (admin only)
async function confirmDeleteSite(siteId) {
  if (!checkAccessControl('admin')) {
    showNotification('Only admins can delete sites', 'error');
    return;
  }
  
  siteId = normalizeId(siteId);
  const site = filteredSites.find(s => s.id === siteId);
  if (!site) return;

  if (confirm(`Are you sure you want to delete "${site.name}" (ID: ${siteId})? This action cannot be undone.`)) {
    try {
      const deleteSiteBtn = document.getElementById('deleteSiteBtn');
      const deleteSiteBtnText = document.getElementById('deleteSiteBtnText');
      
      if (deleteSiteBtn && deleteSiteBtnText) {
        showLoading(deleteSiteBtn, deleteSiteBtnText, 'Deleting...');
      }
      
      const success = await deleteSite(siteId);
      
      if (success) {
        filteredSites = await fetchSites(true);
        
        if (markers.has(siteId)) {
          map.removeLayer(markers.get(siteId));
          markers.delete(siteId);
        }
        
        if (selectedSiteId === siteId) {
          selectedSiteId = null;
          if (detailSiteContent) detailSiteContent.style.display = 'none';
          if (noSiteSelected) noSiteSelected.style.display = 'block';
        }
        
        renderSitesPage(currentPage);
        showNotification('Site deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting site:', error);
      showNotification('Failed to delete site: ' + error.message, 'error');
    } finally {
      const deleteSiteBtn = document.getElementById('deleteSiteBtn');
      const deleteSiteBtnText = document.getElementById('deleteSiteBtnText');
      
      if (deleteSiteBtn && deleteSiteBtnText) {
        hideLoading(deleteSiteBtn, deleteSiteBtnText, 'Delete');
      }
    }
  }
}

// Logs out the current user
function logout() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('username');
  showPage('loginPage');
}

// Event Listeners

// Map controls
document.querySelectorAll('.map-control-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.map-control-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    
    const mapType = this.dataset.mapType;
    if (mapType !== currentMapLayer) {
      try {
        if (baseMaps[currentMapLayer] && map.hasLayer(baseMaps[currentMapLayer])) {
          map.removeLayer(baseMaps[currentMapLayer]);
        }
      } catch (e) { /* ignore */ }
      try {
        baseMaps[mapType].addTo(map);
        currentMapLayer = mapType;
      } catch (e) { console.error('Failed to switch map layer', e); }

      // Force a redraw to avoid visual glitches after switching layers
      setTimeout(() => {
        try { map.invalidateSize(); } catch (e) { /* ignore */ }
      }, 200);
    }
  });
});

// Power source checkbox listeners for both forms
['siteForm', 'editSiteForm'].forEach(formId => {
  document.querySelectorAll(`#${formId} input[name="powerSources"]`).forEach(checkbox => {
    checkbox.addEventListener('change', () => togglePowerSourceDetails(formId));
  });
  document.querySelectorAll(`#${formId} input, #${formId} select`).forEach(input => {
    input.addEventListener('input', () => validateFormInputs(formId));
  });
});

// Other Event Listeners
if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderSitesPage(currentPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredSites.length / sitesPerPage);
    if (currentPage < totalPages) {
      currentPage++;
      renderSitesPage(currentPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (searchBtn) searchBtn.addEventListener('click', searchSite);
if (searchInput) {
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchSite();
  });
}

if (addSiteBtn) {
  addSiteBtn.addEventListener('click', () => {
    if (checkAccessControl('admin')) {
      openModal();
    } else {
      showNotification('Only admins can add sites', 'error');
    }
  });
}

if (exportExcelBtn) {
  exportExcelBtn.addEventListener('click', exportToExcel);
}

const addModalCloseBtn = document.getElementById('addModalClose');
const editModalCloseBtn = document.getElementById('editModalClose');
if (addModalCloseBtn) addModalCloseBtn.addEventListener('click', closeModal);
if (editModalCloseBtn) editModalCloseBtn.addEventListener('click', closeEditModal);

window.addEventListener('click', (e) => {
  if (e.target === addSiteModal) closeModal();
  if (e.target === editSiteModal) closeEditModal();
});

if (loginForm) {
  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = this.username.value;
    const password = this.password.value;
    
    try {
      const loginBtn = document.getElementById('loginBtn');
      const loginBtnText = document.getElementById('loginBtnText');
      
      if (loginBtn && loginBtnText) {
        showLoading(loginBtn, loginBtnText, 'Signing in...');
      }
      
      const { token, user } = await loginUser(username, password);
      authToken = token;
      currentUser = user;
      localStorage.setItem('authToken', token);
      localStorage.setItem('username', username);
      showPage('mainApp');
    } catch (error) {
      showNotification(error.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
      const loginBtn = document.getElementById('loginBtn');
      const loginBtnText = document.getElementById('loginBtnText');
      
      if (loginBtn && loginBtnText) {
        hideLoading(loginBtn, loginBtnText, 'Sign In');
      }
    }
  });
}

if (registerForm) {
  registerForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = this.username.value;
    const password = this.password.value;
    const confirm = this.confirm.value;
    
    if (password !== confirm) {
      showNotification('Passwords do not match', 'error');
      return;
    }
    
    try {
      const registerBtn = document.getElementById('registerBtn');
      const registerBtnText = document.getElementById('registerBtnText');
      
      if (registerBtn && registerBtnText) {
        showLoading(registerBtn, registerBtnText, 'Registering...');
      }
      
      await registerUser(username, password);
      showNotification('Registration successful! Please login.');
      showPage('loginPage');
    } catch (error) {
      showNotification(error.message || 'Registration failed', 'error');
    } finally {
      const registerBtn = document.getElementById('registerBtn');
      const registerBtnText = document.getElementById('registerBtnText');
      
      if (registerBtn && registerBtnText) {
        hideLoading(registerBtn, registerBtnText, 'Register');
      }
    }
  });
}

if (editSiteForm) {
  editSiteForm.addEventListener('submit', submitEditForm);
}

if (siteForm) {
  siteForm.addEventListener('submit', submitSiteForm);
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');
  const username = localStorage.getItem('username');
  
  if (token && username) {
    try {
      const response = await makeApiCall('/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      authToken = token;
      currentUser = response.user;
      showPage('mainApp');
    } catch (e) {
      console.error('Token verification failed:', e);
      localStorage.removeItem('authToken');
      localStorage.removeItem('username');
      showPage('loginPage');
    }
  } else {
    showPage('loginPage');
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (searchInput) searchInput.focus();
  }
  
  if (e.key === 'Escape') {
    if (addSiteModal && addSiteModal.style.display === 'flex') closeModal();
    if (editSiteModal && editSiteModal.style.display === 'flex') closeEditModal();
  }
});