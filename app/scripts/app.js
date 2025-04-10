let client;

function handleError(message, error) {
  console.error(message, error); 
}

app.initialized()
  .then((_client) => {
    client = _client;
  })
  .catch((error) => {
    handleError("❌ Error initializing app:", error);
  });

function fetchAutomations() {
    const domain = document.getElementById("domain").value.trim();
    const api_key = document.getElementById("api_key").value.trim();
    const btn = document.getElementById("turnOffBtn");
    const message = document.getElementById("titleActiveOn");
    const list = document.getElementById("automation-list");

    let dataRows = []; // Store all automation rules for pagination
    const itemsPerPage = 10;
    let currentPage = 1;

    if (!domain || !api_key) {
        client.interface.trigger("showNotify", {
            type: "warning",
            message: "⚠️ Please enter both domain and API key."
        });
        return;
    }

    if (!client) {
        handleError("❌ Client not initialized properly.");
        return;
    }

    client.db.get("automation_rules")
        .then((data) => {

            if (data && data.domain === domain) {
                message.style.display = "block";

                const storedRules = data.rules || [];
                let hasInactiveRules = false;

                // Define table columns
                const col = {
                    columns: [
                        {
                            key: "number",
                            text: "#",
                            position: 1,
                            width: "10%"
                        },
                        {
                            key: "name",
                            text: "Automations",
                            position: 2,
                            variant: "anchor",
                            width: "70%",          // A reasonable width
                            wrapText: true,        // Allow wrapping
                            truncate: false,       // Avoid ellipsis
                            resizable: true    
                        }
                    ],
                    rows: []
                };

                let index = 1;

                storedRules.forEach((rule) => {
                    if (!rule.status) {
                        const row = {
                            number: index++,  
                            name: {
                                text: rule.name,
                                href: `https://${domain}.freshdesk.com/a/admin/automations/${rule.type_name}/${rule.id}/edit`,
                                target: "_blank"
                            }
                        };
                        col.rows.push(row);
                        hasInactiveRules = true;
                    }
                });

                if (hasInactiveRules) {
                    dataRows = col.rows; //  Store the rows for pagination
                    setupPagination();   //  Initiate pagination
                    btn.innerHTML = "Turn On All";
                    btn.disabled = false;
                } else {
                    message.style.display = "none";
                    client.interface.trigger("showNotify", {
                        type: "info",
                        message: "Automations checked & none disabled for this account. History has also been removed. Please try now."
                    });

                    client.db.delete("automation_rules")
                    .then(() => {
                        location.reload();
                    })
                    .catch((error) => {
                      handleError("❌ Error while deleting automation rules", error);
                    })

                    btn.disabled = true;
                }
            } else {
                fetchAndStoreActiveRules(domain, api_key);
            }
        })
        .catch((error) => {
            handleError("❌ Error retrieving stored rules:", error);
            fetchAndStoreActiveRules(domain, api_key);
        });

  // Function to Render Data Table with Pagination
  function renderTable(page) {
      list.innerHTML = ""; // Clear previous content

      const dataTable = document.createElement("fw-data-table");
      dataTable.columns = [
        {
          key: "number",
          text: "#",
          position: 1,
          width: "10%"
        },
        {
          key: "name",
          text: "Automation Rule Name",
          position: 2,
          variant: "anchor",
          width: "70%",          // A reasonable width
          wrapText: true,        // Allow wrapping
          truncate: false,       // Avoid ellipsis
          resizable: true        // Optional: allow column resize
        }
      ];

      // Calculate the items to show for the current page
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      dataTable.rows = dataRows.slice(start, end);


      list.appendChild(dataTable);
  }

  // Function to Setup Pagination
  function setupPagination() {
      const pagination = document.createElement("fw-pagination");
      pagination.setAttribute("per-page", itemsPerPage);
      pagination.setAttribute("total", dataRows.length);

      pagination.addEventListener("fwChange", (event) => {
          currentPage = event.detail.page;
          renderTable(currentPage);
      });

      list.after(pagination); // Add pagination below the table

      renderTable(currentPage); // Initial Render
  }
}

function fetchAndStoreActiveRules(domain, api_key) {
  const automationTypes = [1, 3, 4];
  const title = document.getElementById("titleActiveOff");
  const offBtn = document.getElementById("turnOffBtn");
  const list = document.getElementById("automation-list");

  offBtn.disabled = true;

  const automationRules = [];
  const dataRows = []; // Store all automation rules for pagination
  let hasInactiveRules = false;
  const itemsPerPage = 10; // Define globally
  let currentPage = 1;

  const col = {
      columns: [
          {
              key: "number",
              text: "#",
              position: 1,
              width: "10%"
          },
          {
              key: "name",
              text: "Automations",
              position: 2,
              variant: "anchor",
              width: "70%",          // A reasonable width
              wrapText: true,        // Allow wrapping
              truncate: false,       // Avoid ellipsis
              resizable: true 
          }
      ]
  };
  
  let index = 1;
  
  const typeMapping = {
      1: "ticket_creation",
      3: "time_triggers",
      4: "ticket_updates",
  };
  
  // Process all automation types in parallel and accumulate data
  Promise.all(
      automationTypes.map((automation_type) =>
          client.request.invokeTemplate("getAutomations", {
              context: { domain, api_key, automation_type }
          })
          .then((response) => {

              let rules;
              try {
                  rules = JSON.parse(response.response);
              } catch (error) {
                  handleError("❌ Error parsing JSON:", error);
                  return;
              }

              if (rules.automation_rules) {
                  rules = rules.automation_rules;
              }

              if (!rules.length) return;

              const typeName = typeMapping[automation_type] || "unknown";

              rules.forEach((rule) => {
                  if (rule.active === true) {
                      dataRows.push({
                          number: index++,  
                          name: {
                              text: rule.name,
                              href: `https://${domain}.freshdesk.com/a/admin/automations/${typeName}/${rule.id}/edit`,
                              target: "_blank"
                          }
                      });

                      hasInactiveRules = true;

                      automationRules.push({
                          id: rule.id,
                          name: rule.name,
                          automation_type,
                          status: rule.active,
                          type_name: typeName,
                      });
                  }
              });
          })
          .catch((error) => {
              handleError("❌ Error fetching automation rules:", error);
          })
      )
  ).then(() => {
    if (!hasInactiveRules) {
      client.interface.trigger("showNotify", {
          type: "info",
          message: "There are no active automations in this account"
      });
      return; 
  }

      setupPagination(); // Initiate pagination
      title.style.display = "block";
      offBtn.disabled = false;

      return client.db.set("automation_rules", { domain, rules: automationRules })
      .catch((error) => {
        handleError("Error saving automation rules to DB:", error);
        client.interface.trigger("showNotify", {
          type: "error",
          message: "Something went wrong while saving automation rules."
        });
      });
  })
  .catch((error) => {
    handleError("Something went wrong", error)
  })

  // Function to Render Data Table with Pagination
  function renderTable(page) {
      list.innerHTML = ""; // Clear previous content

      const dataTable = document.createElement("fw-data-table");
      dataTable.columns = col.columns;

      // Calculate the items to show for the current page
      const start = (page - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      dataTable.rows = dataRows.slice(start, end);

      // dataTable.setAttribute("is-selectable", "true");
      // dataTable.setAttribute("is-all-selectable", "true");
      dataTable.setAttribute("id", "data_table");

      list.appendChild(dataTable);
  }

  // Function to Setup Pagination
  function setupPagination() {
      const pagination = document.createElement("fw-pagination");
      pagination.setAttribute("per-page", itemsPerPage);
      pagination.setAttribute("total", dataRows.length);

      pagination.addEventListener("fwChange", (event) => {
          currentPage = event.detail.page;
          renderTable(currentPage);
      });

      list.after(pagination);

      renderTable(currentPage); // Initial Render
  }
}

function turnOffAll() {
  const domain = document.getElementById("domain").value.trim();
  const buttonText = document.getElementById("turnOffBtn").textContent;
  // const dataTable = document.getElementById("data_table");

  if (!client?.db) {
    handleError("❌ Client database API is not available.");
    return;
  }
  
  if (buttonText === "Turn On All") {
    client.db
    .get("automation_rules")
    .then((data) => {
      if (!data || !data.domain || data.domain !== domain) {
        throw new Error("❌ No stored automation rules found for this domain.");
      }

      const storedRules = data.rules || [];
      if (storedRules.length === 0) {
        console.warn("⚠️ No automation rules found to disable.");
        return;
      }
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
    

    
  }else{
    // Turn off section

  client.db
    .get("automation_rules")
    .then((data) => {
      if (!data || !data.domain || data.domain !== domain) {
        throw new Error("❌ No stored automation rules found for this domain.");
      }

      const storedRules = data.rules || [];
      if (storedRules.length === 0) {
        console.warn("⚠️ No automation rules found to disable.");
        return;
      }
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
              if (!updatedData || !updatedData.rules.length) {
                  handleError("❌ No automation rules found for CSV.");
                  return;
              }
              

              const csvContent = generateCSV(updatedData.rules, updatedData.domain);
              

              downloadCSV(csvContent, "disabled_automation_rules.csv");

          })
          .catch((error) => handleError("❌ Error updating entity:", error));
  
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

