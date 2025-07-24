// Global state and configuration
let appClient;
const automationTableData = [];
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

// Error handling utility
function showNotification(type, message) {
  console.log(`${type.toUpperCase()}: ${message}`);
  if (appClient?.interface) {
    appClient.interface.trigger('showNotify', { type, message });
  }
}

function handleError(message, error) {
  const errorMessage = `${message} ${error?.message || error}`;
  console.error(errorMessage, error);
  showNotification('error', errorMessage);
}

// Initialize app client
async function initializeApp() {
  try {
    appClient = await app.initialized();
  } catch (error) {
    handleError('❌ Error initializing app:', error);
  }
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

// Table and UI utilities
const uiHelpers = {
  createTableRowsFromRules(rules, domain) {
    return rules.map((rule, index) => ({
      number: index + 1,
      name: {
        text: rule.name,
        href: `https://${domain}/a/admin/automations/${rule.type_name}/${rule.id}/edit`,
        target: '_blank'
      },
      type: rule.type_name,
      description: rule.description,
      lastModified: rule.updated_at
    }));
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

  renderTable(page, container) {
    container.innerHTML = '';
    const dataTable = document.createElement('fw-data-table');
    dataTable.columns = createAutomationTableColumns();

    const startIndex = (page - 1) * PAGINATION_CONFIG.itemsPerPage;
    const endIndex = startIndex + PAGINATION_CONFIG.itemsPerPage;
    dataTable.rows = automationTableData.slice(startIndex, endIndex);

    container.appendChild(dataTable);
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

// Main automation management logic
async function fetchAutomations() {
  try {
    await initializeApp();

    const turnOffButton = document.getElementById('turnOffBtn');
    const titleActiveMessage = document.getElementById('titleActiveOn');
    const titleActiveOff = document.getElementById('titleActiveOff');
    const automationListContainer = document.getElementById('automation-list');

    const iparams = await appClient.iparams.get();
    const { domain, api_key: apiKey } = iparams;

    let storedData;
    try {
      storedData = await dataOperations.getStoredRules();
    } catch (error) {
      console.warn('No stored rules found, fetching from API');
    }

    if (storedData?.domain === domain) {
      // Display stored inactive automations
      titleActiveMessage.style.display = 'block';
      const inactiveRules = storedData.rules.filter((rule) => !rule.status);

      if (inactiveRules.length > 0) {
        const tableRows = uiHelpers.createTableRowsFromRules(
          inactiveRules,
          storedData.domain
        );

        automationTableData.length = 0;
        automationTableData.push(...tableRows);

        uiHelpers.setupPaginationAndRenderTable(automationListContainer);
        turnOffButton.innerHTML = 'Turn On All';
        turnOffButton.disabled = false;
      } else {
        titleActiveMessage.style.display = 'none';
        showNotification(
          'info',
          'Automations checked—none disabled for this account. History has also been removed. Please try now.'
        );

        await dataOperations.deleteRules();
        location.reload();
      }
    } else {
      // Fetch and store active automations
      turnOffButton.disabled = true;
      automationTableData.length = 0;

      const automationTypesToFetch = [
        AUTOMATION_TYPES.TICKET_CREATION,
        AUTOMATION_TYPES.TIME_TRIGGERS,
        AUTOMATION_TYPES.TICKET_UPDATES
      ];

      const allAutomationRules = [];
      let rowIndex = 1;

      const automationPromises = automationTypesToFetch.map(
        async (automationType) => {
          const rules = await dataOperations.fetchAutomationsByType(
            domain,
            apiKey,
            automationType
          );
          const typeName = AUTOMATION_TYPE_MAPPING[automationType];

          rules.forEach((rule) => {
            if (rule.active === true) {
              automationTableData.push({
                number: rowIndex++,
                name: {
                  text: rule.name,
                  href: `https://${domain}/a/admin/automations/${typeName}/${rule.id}/edit`,
                  target: '_blank'
                },
                type: typeName,
                description: rule.description,
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
      );

      await Promise.all(automationPromises);

      if (automationTableData.length === 0) {
        showNotification(
          'info',
          'There are no active automations in this account'
        );
      } else {
        await dataOperations.saveRules(domain, allAutomationRules);
      }

      uiHelpers.setupPaginationAndRenderTable(automationListContainer);
      titleActiveOff.style.display = 'block';
      turnOffButton.disabled = false;
    }
  } catch (error) {
    handleError('❌ Error in fetchAutomations:', error);
  }
}

// Toggle automation functionality
async function turnOffAll() {
  try {
    await initializeApp();

    const turnOffButton = document.getElementById('turnOffBtn');
    const isEnabling = turnOffButton.textContent === 'Turn On All';

    const iparams = await appClient.iparams.get();
    const { domain } = iparams;

    const storedData = await dataOperations.getStoredRules();

    if (!storedData?.domain || storedData.domain !== domain) {
      throw new Error('No stored automation rules found for this domain.');
    }

    if (isEnabling) {
      // Enable all automations
      const enablePromises = storedData.rules.map((rule) =>
        dataOperations.updateAutomationStatus(
          domain,
          rule.automation_type,
          rule.id,
          true
        )
      );

      await Promise.all(enablePromises);
      await dataOperations.deleteRules();

      showNotification(
        'success',
        '✅ Automations have been successfully turned on, and the history has been removed.'
      );
      setTimeout(() => location.reload(), 500);
    } else {
      // Disable all automations
      const disablePromises = storedData.rules.map((rule) =>
        dataOperations.updateAutomationStatus(
          domain,
          rule.automation_type,
          rule.id,
          false
        )
      );

      await Promise.all(disablePromises);

      // Update stored rules status and save
      const updatedRules = storedData.rules.map((rule) => ({
        ...rule,
        status: false
      }));
      await dataOperations.saveRules(domain, updatedRules);

      // Generate and download CSV
      uiHelpers.generateCSVAndDownload(
        updatedRules,
        domain,
        'disabled_automation_rules.csv'
      );

      showNotification(
        'success',
        '✅ Successfully turned off! Disabled automations are being downloaded for your reference.'
      );
      setTimeout(() => location.reload(), 500);
    }
  } catch (error) {
    handleError('❌ Error in turnOffAll operation:', error);
  }
}

// Initialize the app when the script loads
initializeApp();
