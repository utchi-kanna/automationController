let verified = false;
let savedConfigs = {};

$(document).ready(function () {
  $('#verifyBtn').click(async function () {
    const domain = $('#domain').val().trim();
    const apiKey = $('#api_key').val().trim();

    $('#domain_error').text('');
    $('#api_key_error').text('');
    $('#verifyStatus').text('').css('color', 'black');

    if (!domain || !/^[a-zA-Z0-9-]+\.freshdesk\.com$/.test(domain)) {
      $('#domain_error').text('Enter a valid Freshdesk domain.');
      return;
    }

    if (!apiKey) {
      $('#api_key_error').text('API key cannot be empty.');
      return;
    }

    $('#verifyStatus').text('Verifying...');

    try {
      const response = await fetch(`https://${domain}/api/v2/agents/me`, {
        method: "GET",
        headers: {
          Authorization: "Basic " + btoa(`${apiKey}:X`),
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        $('#verifyStatus').text('✅ Verified! You can now install.').css('color', 'green');
        verified = true;
        savedConfigs = { domain, api_key: apiKey };
      } else {
        $('#verifyStatus').text('❌ Invalid credentials.').css('color', 'red');
        verified = false;
      }
    } catch (error) {
      $('#verifyStatus').text('❌ Network or domain error.').css('color', 'red');
      verified = false;
    }
  });
});

// Called by FDK on load to prefill config values
function getConfigs(configs) {
  if (configs.domain) $('#domain').val(configs.domain);
  if (configs.api_key) $('#api_key').val(configs.api_key);
  savedConfigs = configs || {};
}

// Called by FDK before install — return true/false
function validate() {
  if (verified) return true;
  $('#verifyStatus').text('❌ Please verify your credentials before installing.').css('color', 'red');
  return false;
}

// Called by FDK to save config values after validation
function postConfigs() {
  return {
    domain: $('#domain').val().trim(),
    api_key: $('#api_key').val().trim()
  };
}
