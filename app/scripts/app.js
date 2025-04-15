const itemsPerPage = 10;

let client;
let state = {
    hasInactiveRules: false,
    dataRows: [],
    currentPage: 1
};

function handleError(message, error) {
    console.error(message, error);
    if (client && client.interface) {
        client.interface.trigger("showNotify", {
            type: "error",
            message: `${message} ${error?.message || ''}`
        });
    }
}

function initializeApp() {
    return app.initialized()
        .then((_client) => {
            client = _client;
            return client;
        })
        .catch((error) => {
            handleError(" Error initializing app:", error);
            throw error;
        });
}

function validateInputs(domain, api_key) {
    if (!domain || !api_key) {
        if (client && client.interface) {
            client.interface.trigger("showNotify", {
                type: "warning",
                message: "⚠️ Please enter both domain and API key."
            });
        }
        return false;
    }
    return true;
}

function resetState() {
    state = {
        hasInactiveRules: false,
        dataRows: [],
        currentPage: 1
    };
}

function createTableColumns() {
    return [
        {
            key: "number",
            text: "No",
            position: 1,
            width: "10%"
        },
        {
            key: "name",
            text: "Automation Name",
            position: 2,
            variant: "anchor",
            width: "35%",  
            truncate: false,  
            wrapText: true
        },
        {
            key: "type",
            text: "Type",
            position: 3,
            width: "15%"
        },
        {
            key: "description",
            text: "Description",
            position: 4,
            width: "25%",
            truncate: false,
            wrapText: true
        },
        {
            key: "last_modified",
            text: "Last Modified",
            position: 5,
            width: "15%"
        }
    ];
}

function createRow(rule, index, domain, typeName) {
    return {
        number: index,
        name: {
            text: rule.name,
            href: `https://${domain}.freshdesk.com/a/admin/automations/${typeName}/${rule.id}/edit`,
            target: "_blank"
        },
        type: typeName,
        description: rule.description || "No description available",
        last_modified: rule.updated_at ? new Date(rule.updated_at).toLocaleDateString() : "N/A"
    };
}

function renderTable(page, list, columns) {
    if (!list) {
        handleError(" List element not found", new Error("List element is required"));
        return;
    }

    list.innerHTML = "";

    const dataTable = document.createElement("fw-data-table");
    dataTable.columns = columns;

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    dataTable.rows = state.dataRows.slice(start, end);

    list.appendChild(dataTable);
}

function setupPagination(list, columns) {
    if (!list) {
        handleError(" List element not found", new Error("List element is required"));
        return;
    }

    const pagination = document.createElement("fw-pagination");
    pagination.setAttribute("per-page", itemsPerPage);
    pagination.setAttribute("total", state.dataRows.length);

    pagination.addEventListener("fwChange", (event) => {
        state.currentPage = event.detail.page;
        renderTable(state.currentPage, list, columns);
    });

    list.after(pagination);
    renderTable(state.currentPage, list, columns);
}

function fetchAutomations() {
    const domain = document.getElementById("domain")?.value?.trim();
    const api_key = document.getElementById("api_key")?.value?.trim();
    const btn = document.getElementById("turnOffBtn");
    const message = document.getElementById("titleActiveOn");
    const list = document.getElementById("automation-list");

    if (!client) {
        return initializeApp()
            .then(() => fetchAutomations())
            .catch((error) => {
                handleError(" Client not initialized properly:", error);
            });
    }

    if (!validateInputs(domain, api_key)) {
        return;
    }

    resetState();

    return client.db.get("automation_rules")
        .then((data) => {
            if (data && data.domain === domain) {
                message.style.display = "block";
                const storedRules = data.rules || [];

                const col = {
                    columns: createTableColumns(),
                    rows: []
                };

                let index = 1;

                storedRules.forEach((rule) => {
                    if (!rule.status) {
                        const row = createRow(rule, index++, domain, rule.type_name);
                        col.rows.push(row);
                        state.hasInactiveRules = true;
                    }
                });

                if (state.hasInactiveRules) {
                    state.dataRows = col.rows;
                    setupPagination(list, col.columns);
                    btn.innerHTML = "Turn On All";
                    btn.disabled = false;
                } else {
                    message.style.display = "none";
                    client.interface.trigger("showNotify", {
                        type: "info",
                        message: "Automations checked—none disabled for this account. History has also been removed. Please try now."
                    });

                    return client.db.delete("automation_rules")
                        .then(() => {
                            location.reload();
                        })
                        .catch((error) => {
                            handleError("Error while deleting automation rules", error);
                        });
                }
            } else {
                return fetchAndStoreActiveRules(domain, api_key, list);
            }
        })
        .catch((error) => {
            handleError("Error retrieving stored rules:", error);
            return fetchAndStoreActiveRules(domain, api_key, list);
        });
}

function fetchAndStoreActiveRules(domain, api_key, list) {
    const automationTypes = [1, 3, 4];
    const title = document.getElementById("titleActiveOff");
    const offBtn = document.getElementById("turnOffBtn");

    if (!client) {
        return initializeApp()
            .then(() => fetchAndStoreActiveRules(domain, api_key, list))
            .catch((error) => {
                handleError("Client not initialized properly:", error);
            });
    }

    offBtn.disabled = true;
    resetState();

    const automationRules = [];
    const col = {
        columns: createTableColumns()
    };
    
    let index = 1;
    
    const typeMapping = {
        1: "ticket_creation",
        3: "time_triggers",
        4: "ticket_updates",
    };
    
    return Promise.all(
        automationTypes.map((automation_type) =>
            client.request.invokeTemplate("getAutomations", {
                context: { domain, api_key, automation_type }
            })
            .then((response) => {
                let rules;
                try {
                    rules = JSON.parse(response.response);
                } catch (error) {
                    handleError(" Error parsing JSON:", error);
                    return;
                }

                if (rules.automation_rules) {
                    rules = rules.automation_rules;
                }

                if (!rules || !rules.length) return;

                const typeName = typeMapping[automation_type] || "unknown";

                rules.forEach((rule) => {
                    if (rule.active === true) {
                        const row = createRow(rule, index++, domain, typeName);
                        state.dataRows.push(row);
                        state.hasInactiveRules = true;

                        automationRules.push({
                            id: rule.id,
                            name: rule.name,
                            automation_type,
                            status: rule.active,
                            type_name: typeName,
                            description: rule.description,
                            updated_at: rule.updated_at
                        });
                    }
                });
            })
            .catch((error) => {
                handleError(" Error fetching automation rules:", error);
            })
        )
    )
    .then(() => {
        if (!state.hasInactiveRules) {
            client.interface.trigger("showNotify", {
                type: "info",
                message: "There are no active automations in this account"
            });
            return;
        }

        setupPagination(list, col.columns);
        title.style.display = "block";
        offBtn.disabled = false;

        return client.db.set("automation_rules", { domain, rules: automationRules })
            .catch((error) => {
                handleError("Error saving automation rules to DB:", error);
            });
    })
    .catch((error) => {
        handleError("Something went wrong", error);
    });
}

function turnOffAll() {
  const domain = document.getElementById("domain").value.trim();
  const buttonText = document.getElementById("turnOffBtn").textContent;
  

  if (!client?.db) {
    handleError(" Client database API is not available.");
    return;
  }
  
  if (buttonText === "Turn On All") {
    client.db
    .get("automation_rules")
    .then((data) => {
      if (!data || !data.domain || data.domain !== domain) {
        throw new Error("No stored automation rules found for this domain.");
      }

      const storedRules = data.rules || [];
    
      const body = { active: true };
      return Promise.all(
        storedRules.map((rule) =>
          client.request.invokeTemplate("onAutomations", {
            context: { domain, automation_type: rule.automation_type, rule_id: rule.id },
            body: JSON.stringify(body)
          })
        )
      );
    }).then((responses) => {
      if (responses) {
        client.db.delete("automation_rules");
        client.interface.trigger("showNotify", {
          type: "success",
          message: "✅ Automations have been successfully turned on, and the history has been removed."
      });
      location.reload();
      }
    })
    .catch((error) => {
      handleError(" Error turning on automation rules:", error);
    });
  }else{
    // Turn off section

  client.db
    .get("automation_rules")
    .then((data) => {
      if (!data || !data.domain || data.domain !== domain) {
        throw new Error(" No stored automation rules found for this domain.");
      }

      const storedRules = data.rules || [];
      const body = { active: false };
      return Promise.all(
        storedRules.map((rule) =>
          client.request.invokeTemplate("offAutomations", {
            context: { domain, automation_type: rule.automation_type, rule_id: rule.id },
            body: JSON.stringify(body)
          })
        )
      );
    })
    .then((responses) => {
      if (responses) {
        client.db.get("automation_rules")
          .then((data) => {
            if (!data) {
              return;
            }
            data.rules.forEach(rule => {
              rule.status = false;
            });
            return client.db.set("automation_rules", {
              domain: data.domain, 
              rules: data.rules
              
            });
            
          }).then(() => client.db.get("automation_rules"))
          .then((updatedData) => {
              

              const csvContent = generateCSV(updatedData.rules, updatedData.domain);
              

              downloadCSV(csvContent, "disabled_automation_rules.csv");

          })
          .catch((error) => handleError(" Error updating entity:", error));
  
      client.interface.trigger("showNotify", {
        type: "success",
        message: "✅ Successfully turned off! Disabled automations are being downloaded for your reference."
    });
    setTimeout(() => {
      location.reload();
  }, 500);
      }
    })
    .catch((error) => {
      handleError(" Error disabling automation rules:", error);
    });
  }

}

// Function to generate CSV from automation rules
function generateCSV(rules, domain) {
  const headers = ["Automation Name", "Automation Type", "Automation Link"];
  const typeMapping = {
      1: "ticket_creation",
      3: "time_triggers",
      4: "ticket_updates",
  };

  const rows = rules.map(rule => {
      const typeName = typeMapping[rule.automation_type] || "unknown";
      const editLink = `https://${domain}.freshdesk.com/a/admin/automations/${typeName}/${rule.id}/edit`;
      return `"${rule.name}","${typeName}","${editLink}"`; // Wrap in quotes for CSV formatting
  });

  return [headers.join(","), ...rows].join("\n"); // Combine headers and rows
}

// Function to trigger CSV file download
function downloadCSV(csvContent, filename) {
  
  const blob = new Blob([csvContent], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
}

// Initialize the app when the script loads
initializeApp().catch((error) => {
    handleError(" Failed to initialize app:", error);
});

