let client;
const dataRows = []; // Store all automation rules for pagination
const itemsPerPage = 10;
const currentPage = 1;



function handleError(message, error) {
  console.error(message, error);
  if (client && client.interface) {
    client.interface.trigger("showNotify", {
      type: "error",
      message: `${message} ${error?.message}`
    });
  }
}

// Initialize client in a single scope
app.initialized()
  .then((_client) => {
    client = _client;
  })
  .catch((error) => {
    handleError("❌ Error initializing app:", error);
  });

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

function fetchAutomations() {
    const domain = document.getElementById("domain").value.trim();
    const api_key = document.getElementById("api_key").value.trim();
    const btn = document.getElementById("turnOffBtn");
    const message = document.getElementById("titleActiveOn");
    const automationList = document.getElementById("automation-list");

    if (!domain || !api_key) {
        client.interface.trigger("showNotify", {
            type: "warning",
            message: "⚠️ Please enter both domain and API key."
        });
        return;
    }

  
    client.db.get("automation_rules")
        .then((data) => {
            if (data && data.domain === domain) {
                message.style.display = "block";

                const storedRules = data.rules;
                let hasInactiveRules = false;

                const rows = [];

                let index = 1;

                storedRules.forEach((rule) => {
                    if (!rule.status) {
                        const row = {
                            number: index++,  
                            name: {
                                text: rule.name,
                                href: `https://${domain}.freshdesk.com/a/admin/automations/${rule.type_name}/${rule.id}/edit`,
                                target: "_blank"
                            },
                            type: rule.type_name,
                            description: rule.description,
                            last_modified: rule.updated_at 
                        };
                        rows.push(row);
                        hasInactiveRules = true;
                    }
                });

                if (hasInactiveRules) {
                    dataRows.length = 0; // Clear array
                    dataRows.push(...rows);
                    setupPagination(automationList);
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
                }
            } else {
                fetchAndStoreActiveRules(domain, api_key);
            }
        })
        .catch((error) => {
            handleError("❌ Error retrieving stored rules:", error);
            fetchAndStoreActiveRules(domain, api_key);
        });
}

function fetchAndStoreActiveRules(domain, api_key) {
    const automationTypes = [1, 3, 4];
    const title = document.getElementById("titleActiveOff");
    const offBtn = document.getElementById("turnOffBtn");
    const automationList = document.getElementById("automation-list");

    offBtn.disabled = true;

    const automationRules = [];
    dataRows.length = 0; // Clear array
    let hasInactiveRules = false;

    let index = 1;
    
    const typeMapping = {
        1: "ticket_creation",
        3: "time_triggers",
        4: "ticket_updates",
    };
    
    Promise.all(
        automationTypes.map((automation_type) =>
            client.request.invokeTemplate("getAutomations", {
                context: { domain, api_key, automation_type }
            })
            .then((response) => {
                const rules = JSON.parse(response.response);
                const processedRules = rules.automation_rules || rules;


                const typeName = typeMapping[automation_type];

                processedRules.forEach((rule) => {
                    if (rule.active === true) {
                        dataRows.push({
                            number: index++,  
                            name: {
                                text: rule.name,
                                href: `https://${domain}.freshdesk.com/a/admin/automations/${typeName}/${rule.id}/edit`,
                                target: "_blank"
                            },
                            type: typeName,
                            description: rule.description,
                            last_modified: rule.updated_at
                        });

                        hasInactiveRules = true;

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
        )
    ).then(() => {
        if (!hasInactiveRules) {
            client.interface.trigger("showNotify", {
                type: "info",
                message: "There are no active automations in this account"
            });
        }

        setupPagination(automationList);
        title.style.display = "block";
        offBtn.disabled = false;

        return client.db.set("automation_rules", { domain, rules: automationRules })
            .catch((error) => {
                handleError("Error saving automation rules to DB:", error);
            });
    })
}

function setupPagination(container) {
    const pagination = document.createElement("fw-pagination");
    pagination.setAttribute("per-page", itemsPerPage);
    pagination.setAttribute("total", dataRows.length);

    pagination.addEventListener("fwChange", (event) => {
        renderTable(event.detail.page, container);
    });

    container.after(pagination);
    renderTable(currentPage, container);
}

function renderTable(page, container) {
    container.innerHTML = "";

    const dataTable = document.createElement("fw-data-table");
    dataTable.columns = createTableColumns();

    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    dataTable.rows = dataRows.slice(start, end);

    container.appendChild(dataTable);
}

function turnOffAll() {
    const domain = document.getElementById("domain").value.trim();
    const buttonText = document.getElementById("turnOffBtn").textContent;

    
    if (buttonText === "Turn On All") {
        client.db.get("automation_rules")
            .then((data) => {
                if (!data || !data.domain || data.domain !== domain) {
                    throw new Error("❌ No stored automation rules found for this domain.");
                }

                const storedRules = data.rules;
               
                const body = { active: true };
                return Promise.all(
                    storedRules.map((rule) =>
                        client.request.invokeTemplate("onAutomations", {
                            context: { domain, automation_type: rule.automation_type, rule_id: rule.id },
                            body: JSON.stringify(body)
                        })
                    )
                );
            })
            .then((responses) => {
                if (responses) {
                    return client.db.delete("automation_rules")
                        .then(() => {
                            client.interface.trigger("showNotify", {
                                type: "success",
                                message: "✅ Automations have been successfully turned on, and the history has been removed."
                            });
                            location.reload();
                        });
                }
            })
            .catch((error) => {
                handleError("❌ Error turning on automation rules:", error);
            });
    } else {
        client.db.get("automation_rules")
            .then((data) => {
                if (!data || !data.domain || data.domain !== domain) {
                    throw new Error("❌ No stored automation rules found for this domain.");
                }

                const storedRules = data.rules;
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
                    return client.db.get("automation_rules")
                        .then((data) => {
                            data.rules.forEach(rule => {
                                rule.status = false;
                            });
                            return client.db.set("automation_rules", {
                                domain: data.domain, 
                                rules: data.rules
                            });
                        })
                        .then(() => client.db.get("automation_rules"))
                        .then((updatedData) => {
                            const csvContent = generateCSV(updatedData.rules, updatedData.domain);
                            downloadCSV(csvContent, "disabled_automation_rules.csv");

                            client.interface.trigger("showNotify", {
                                type: "success",
                                message: "✅ Successfully turned off! Disabled automations are being downloaded for your reference."
                            });
                            setTimeout(() => {
                                location.reload();
                            }, 500);
                        });
                }
            })
            .catch((error) => {
                handleError("❌ Error disabling automation rules:", error);
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
      const typeName = typeMapping[rule.automation_type];
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

