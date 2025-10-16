// Global state and configuration
let appClient;
const automationTableData = [];
const selectedAutomations = new Set();
const PAGINATION_CONFIG = {
  itemsPerPage: 10,
  currentPage: 1
};

const AUTOMATION_TYPES = {
  TICKET_CREATION: 1,
  TIME_TRIGGERS: 3,
  TICKET_UPDATES: 4
};

const AUTOMATION_TYPE_MAPPING = {
  [AUTOMATION_TYPES.TICKET_CREATION]: 'ticket_creation',
  [AUTOMATION_TYPES.TIME_TRIGGERS]: 'time_triggers',
  [AUTOMATION_TYPES.TICKET_UPDATES]: 'ticket_updates'
};

// Global error handler
function handleGlobalError(error, context) {
  const errorMessage = context ? `${context}: ${error?.message || error}` : error?.message;
  showNotification('error', errorMessage);
}

// Simple validation functions for easy testing
function isValidString(str) {
  return typeof str === 'string' && str.length > 0;
}

function isPositiveNumber(num) {
  return typeof num === 'number' && num > 0;
}

function hasValidId(rule) {
  return rule && rule.id && rule.id > 0;
}

function isAutomationType(type) {
  return type === 'ticket_creation' || type === 'ticket_updates' || type === 'time_triggers';
}

function shouldShowNotification(type) {
  return type === 'error' || type === 'warning' || type === 'success' || type === 'info';
}

function isRuleActive(rule) {
  return rule && rule.active === true;
}

function hasDescription(rule) {
  return rule && rule.description && rule.description.trim().length > 0;
}

// Notification utility
function showNotification(type, message) {
  if (isValidString(message) && shouldShowNotification(type)) {
    appClient?.interface?.trigger('showNotify', { type, message });
  }
}

// Initialize app client
async function initializeApp() {
  appClient = await app.initialized();
}

// Table configuration
function createAutomationTableColumns() {
  return [
    {
      key: 'number',
      text: 'No',
      position: 1,
      width: '10%'
    },
    {
      key: 'name',
      text: 'Automation Name',
      position: 2,
      variant: 'anchor',
      width: '35%',
      truncate: false,
      wrapText: true
    },
    {
      key: 'type',
      text: 'Type',
      position: 3,
      width: '15%'
    },
    {
      key: 'description',
      text: 'Description',
      position: 4,
      width: '25%',
      truncate: false,
      wrapText: true
    },
    {
      key: 'lastModified',
      text: 'Last Modified',
      position: 5,
      width: '15%'
    }
  ];
}

// Centralized data operations
const dataOperations = {
  async getStoredRules() {
    return await appClient.db.get('automation_rules');
  },

  async saveRules(domain, rules) {
    return await appClient.db.set('automation_rules', { domain, rules });
  },

  async deleteRules() {
    return await appClient.db.delete('automation_rules');
  },

  async fetchAutomationsByType(domain, apiKey, automationType) {
    const response = await appClient.request.invokeTemplate('getAutomations', {
      context: { domain, api_key: apiKey, automation_type: automationType }
    });
    const rules = JSON.parse(response.response);
    return rules.automation_rules || rules;
  },

  async updateAutomationStatus(domain, automationType, ruleId, isActive) {
    const templateName = isActive ? 'onAutomations' : 'offAutomations';
    const body = { active: isActive };

    return await appClient.request.invokeTemplate(templateName, {
      context: { domain, automation_type: automationType, rule_id: ruleId },
      body: JSON.stringify(body)
    });
  }
};

// Selection and filtering utilities
const selectionHelpers = {
  updateSelectionInfo() {
    const selectionInfo = document.getElementById('selectionInfo');
    const visibleCount = selectionHelpers.getVisibleAutomations().length;
    const selectedCount = selectedAutomations.size;
    selectionInfo.textContent = `Selected: ${selectedCount} of ${visibleCount}`;
  },

  isAutomationVisible(automation) {
    // Check if we're in disabled mode (showing only disabled automations)
    const titleActiveOn = document.getElementById('titleActiveOn');
    const isDisabledMode = titleActiveOn.style.display === 'block';
    
    if (isDisabledMode) {
      return true; // When showing disabled automations, show all of them regardless of filters
    }
    
    // Validate automation type
    if (!isAutomationType(automation.type)) {
      return false;
    }
    
    // When showing active automations, apply filters
    const filterMap = {
      'ticket_creation': document.getElementById('filterTicketCreation').checked,
      'ticket_updates': document.getElementById('filterTicketUpdate').checked,
      'time_triggers': document.getElementById('filterHourly').checked
    };
    
    return filterMap[automation.type] !== false;
  },

  getVisibleAutomations() {
    return automationTableData.filter(automation => this.isAutomationVisible(automation));
  },


  setupFilterListeners() {
    const filterCheckboxes = ['filterTicketCreation', 'filterTicketUpdate', 'filterHourly'];

    filterCheckboxes.forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('fwChange', () => {
          PAGINATION_CONFIG.currentPage = 1;
          
          // Auto-select all visible automations when filters change
          const visibleAutomations = this.getVisibleAutomations();
          selectedAutomations.clear();
          visibleAutomations.forEach(automation => selectedAutomations.add(automation.id.toString()));
          
          uiHelpers.renderTable(PAGINATION_CONFIG.currentPage, document.getElementById('automation-list'));
          this.updateSelectionInfo();
        });
      }
    });
  },

  updateButtonStates(isDisabledMode) {
    const disableBtn = document.getElementById('disableSelectedBtn');
    const enableBtn = document.getElementById('enableSelectedBtn');
    const filterCheckboxes = [
      document.getElementById('filterTicketCreation'),
      document.getElementById('filterTicketUpdate'),
      document.getElementById('filterHourly')
    ];

    // Set button states based on mode
    if (disableBtn) disableBtn.disabled = isDisabledMode;
    if (enableBtn) enableBtn.disabled = !isDisabledMode;
    
    // Set filter checkbox states based on mode
    filterCheckboxes.forEach(checkbox => {
      if (checkbox) checkbox.disabled = isDisabledMode;
    });
  }
};

// Table and UI utilities
const uiHelpers = {
  createTableRowsFromRules(rules, domain) {
    return rules.map((rule, index) => {
      const typeKey = rule.type_name 
      const safeDescription = hasDescription(rule) ? rule.description.trim() : 'No description available';
      const safeUpdatedAt = rule.updated_at.toString();
      
      return {
        id: rule.id,
        number: index + 1,
        name: {
          text: rule.name,
          href: `https://${domain}/a/admin/automations/${typeKey}/${rule.id}/edit`,
          target: '_blank'
        },
        type: typeKey,
        description: safeDescription,
        lastModified: safeUpdatedAt,
        isValid: hasValidId(rule),
        isActive: isRuleActive(rule)
      };
    });
  },

  setupPaginationAndRenderTable(container) {
    const existingPagination = container.nextElementSibling;
    if (existingPagination?.tagName === 'FW-PAGINATION') {
      existingPagination.remove();
    }

    const pagination = document.createElement('fw-pagination');
    pagination.setAttribute('per-page', PAGINATION_CONFIG.itemsPerPage);
    pagination.setAttribute('total', automationTableData.length);

    pagination.addEventListener('fwChange', (event) => {
      this.renderTable(event.detail.page, container);
    });

    container.after(pagination);
    this.renderTable(PAGINATION_CONFIG.currentPage, container);
  },

  updatePagination(container) {
    const existingPagination = container.nextElementSibling;
    if (existingPagination?.tagName === 'FW-PAGINATION') {
      const visibleCount = selectionHelpers.getVisibleAutomations().length;
      existingPagination.setAttribute('total', visibleCount);
    }
  },

  renderTable(page, container) {
    container.innerHTML = '';
    const dataTable = document.createElement('fw-data-table');
    dataTable.columns = createAutomationTableColumns();

    // Filter visible automations
    const visibleAutomations = selectionHelpers.getVisibleAutomations();
    
    const startIndex = (page - 1) * PAGINATION_CONFIG.itemsPerPage;
    const endIndex = startIndex + PAGINATION_CONFIG.itemsPerPage;
    dataTable.rows = visibleAutomations.slice(startIndex, endIndex);

    container.appendChild(dataTable);

    // Update pagination to reflect filtered count
    this.updatePagination(container);

    selectionHelpers.updateSelectionInfo();
  },

  generateCSVAndDownload(rules, domain, filename) {
    const headers = ['Automation Name', 'Automation Type', 'Automation Link'];
    const csvRows = rules.map((rule) => {
      const typeName = AUTOMATION_TYPE_MAPPING[rule.automation_type];
      const editLink = `https://${domain}/a/admin/automations/${typeName}/${rule.id}/edit`;
      return `"${rule.name}","${typeName}","${editLink}"`;
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const downloadLink = document.createElement('a');

    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.setAttribute('download', filename);

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadLink.href);
  }
};

// Helper functions for fetchAutomations
function setupUIForDisabledMode(inactiveRules, domain, container, controls) {
  const tableRows = uiHelpers.createTableRowsFromRules(inactiveRules, domain);
  automationTableData.length = 0;
  automationTableData.push(...tableRows);

  uiHelpers.setupPaginationAndRenderTable(container);
  controls.classList.remove('disabled-state');
  selectionHelpers.setupFilterListeners();
  selectionHelpers.updateButtonStates(true);
  
  selectedAutomations.clear();
  inactiveRules.forEach(rule => selectedAutomations.add(rule.id.toString()));
  selectionHelpers.updateSelectionInfo();
}

async function fetchAndProcessActiveAutomations(domain, apiKey) {
  const automationTypesToFetch = [
    AUTOMATION_TYPES.TICKET_CREATION,
    AUTOMATION_TYPES.TIME_TRIGGERS,
    AUTOMATION_TYPES.TICKET_UPDATES
  ];

  const allAutomationRules = [];
  let rowIndex = 1;

  const automationPromises = automationTypesToFetch.map(async (automationType) => {
    const rules = await dataOperations.fetchAutomationsByType(domain, apiKey, automationType);
    const typeName = AUTOMATION_TYPE_MAPPING[automationType];

    if (rules && Array.isArray(rules)) {
      rules.forEach((rule) => {
        if (rule.active === true) {
          automationTableData.push({
            id: rule.id,
            number: rowIndex++,
            name: {
              text: rule.name,
              href: `https://${domain}/a/admin/automations/${typeName}/${rule.id}/edit`,
              target: '_blank'
            },
            type: typeName,
            description: rule.description || 'No description available',
            lastModified: rule.updated_at
          });

          allAutomationRules.push({
            id: rule.id,
            name: rule.name,
            automation_type: automationType,
            status: rule.active,
            type_name: typeName,
            description: rule.description,
            updated_at: rule.updated_at
          });
        }
      });
    }
  });

  await Promise.all(automationPromises);
  return allAutomationRules;
}

// Main automation management logic
async function fetchAutomations() {
  await initializeApp();
  const titleActiveMessage = document.getElementById('titleActiveOn');
  const titleActiveOff = document.getElementById('titleActiveOff');
  const automationListContainer = document.getElementById('automation-list');
  const selectionControls = document.getElementById('selection-controls');

  const iparams = await appClient.iparams.get();
  const { domain, api_key: apiKey } = iparams;

  let storedData;
  try {
    storedData = await dataOperations.getStoredRules();
  } catch (error) {
    // No stored rules found, will fetch from API
  }

  if (storedData?.domain === domain) {
    titleActiveMessage.style.display = 'block';
    titleActiveOff.style.display = 'none';
    const inactiveRules = storedData.rules.filter((rule) => !rule.status);

    if (inactiveRules.length > 0) {
      setupUIForDisabledMode(inactiveRules, storedData.domain, automationListContainer, selectionControls);
    } else {
      titleActiveMessage.style.display = 'none';
      showNotification('info', 'Automations checked—none disabled for this account. History has also been removed. Please try now.');
      await dataOperations.deleteRules();
      location.reload();
    }
  } else {
    automationTableData.length = 0;
    const allAutomationRules = await fetchAndProcessActiveAutomations(domain, apiKey);

    if (automationTableData.length === 0) {
      showNotification('warning', 'No active automations found in this account. Please check your Freshdesk account for automation rules.');
      return;
    }
    
    await dataOperations.saveRules(domain, allAutomationRules);

    uiHelpers.setupPaginationAndRenderTable(automationListContainer);
    selectionControls.classList.remove('disabled-state');
    selectionHelpers.setupFilterListeners();
    titleActiveOff.style.display = 'block';
    titleActiveMessage.style.display = 'none';
    
    selectedAutomations.clear();
    automationTableData.forEach(automation => selectedAutomations.add(automation.id.toString()));
    selectionHelpers.updateButtonStates(false);
    selectionHelpers.updateSelectionInfo();
  }
}





// Common bulk operation logic
async function performBulkOperation(isEnable, emptyMessage, successMessage) {
  if (selectedAutomations.size === 0) {
    showNotification('warning', emptyMessage);
    return;
  }

  await initializeApp();
  const iparams = await appClient.iparams.get();
  const { domain } = iparams;

  const storedData = await dataOperations.getStoredRules();
  if (!storedData?.domain || storedData.domain !== domain) {
    throw new Error('No stored automation rules found for this domain.');
  }

  const selectedRules = storedData.rules.filter(rule => 
    selectedAutomations.has(rule.id.toString())
  );

  const operationPromises = selectedRules.map((rule) =>
    dataOperations.updateAutomationStatus(domain, rule.automation_type, rule.id, isEnable)
  );

  await Promise.all(operationPromises);

  const updatedRules = storedData.rules.map((rule) => ({
    ...rule,
    status: (selectedAutomations.has(rule.id.toString()) ? isEnable : rule.status)
  }));
  await dataOperations.saveRules(domain, updatedRules);

  if (!isEnable) {
    const disabledRules = selectedRules.map(rule => ({ ...rule, status: false }));
    uiHelpers.generateCSVAndDownload(disabledRules, domain, 'disabled_selected_automation_rules.csv');
  }

  showNotification('success', successMessage);
  selectedAutomations.clear();
  
  if (isEnable) {
    const remainingDisabled = updatedRules.filter(rule => !rule.status);
    if (remainingDisabled.length === 0) {
      await dataOperations.deleteRules();
      setTimeout(() => location.reload(), 500);
      return;
    }
  }
  
  setTimeout(() => fetchAutomations(), 500);
}

// Bulk operations
async function disableSelected() {
  await performBulkOperation(
    false,
    'No active automations found to disable.',
    'Successfully disabled automation(s). Disabled automations are being downloaded for your reference.'
  );
}

async function enableSelected() {
  await performBulkOperation(
    true,
    'Please select at least one automation to enable.',
    'Successfully enabled automation(s)!'
  );
}



// Global error handler wrapper
function withErrorHandling(fn, context) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleGlobalError(error, context);
    }
  };
}

// Wrapped functions with error handling
const fetchAutomationsWithErrorHandling = withErrorHandling(fetchAutomations, 'Fetch automations');
const disableSelectedWithErrorHandling = withErrorHandling(disableSelected, 'Disable selected automations');
const enableSelectedWithErrorHandling = withErrorHandling(enableSelected, 'Enable selected automations');

// Initialize the app when the script loads
initializeApp().catch(error => handleGlobalError(error, 'App initialization failed'));

// Initialize the UI in disabled state
document.addEventListener('DOMContentLoaded', function() {
  const selectionControls = document.getElementById('selection-controls');
  selectionControls?.classList.add('disabled-state');
});
