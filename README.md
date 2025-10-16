# Automation Controller

A Freshdesk Marketplace app for managing automation rules with selective control capabilities.

## Features

### Bulk Operations
- **Turn Off All**: Disable all automation rules at once
- **Turn On All**: Enable all previously disabled automation rules

### Selective Management
- **Filter by Type**: Selectively view and manage automation rules by type:
  - Ticket Creation Rules
  - Ticket Update Rules (Observers)
  - Hourly Rules (Time Triggers)
- **Individual Selection**: Use checkboxes to select specific automation rules
- **Bulk Actions**: 
  - Select All Visible: Select all automation rules currently visible after filtering
  - Deselect All: Clear all selections
  - Disable Selected: Disable only the selected automation rules
  - Enable Selected: Enable only the selected automation rules

### Additional Features
- **Pagination**: Navigate through large lists of automation rules
- **CSV Export**: Automatically download CSV files containing disabled automation rules
- **Real-time Updates**: Selection counter shows current selection status
- **Visual Feedback**: Success/error notifications for all operations

## Usage

1. **Fetch Automations**: Click to load all automation rules from your Freshdesk account
2. **Filter Rules**: Use the checkboxes to filter automation rules by type
3. **Select Rules**: Use individual checkboxes or "Select All Visible" to choose automation rules
4. **Perform Actions**: Use the action buttons to enable/disable selected rules
5. **Download Reports**: CSV files are automatically generated for disabled automation rules

## Technical Details

- Built with Freshworks App SDK (FDK v2)
- Uses Crayons UI components
- Integrates with Freshdesk REST API
- Supports all automation types: Ticket Creation, Ticket Updates, and Time Triggers
- Maintains state using Freshworks App Storage
- Provides comprehensive error handling and user feedback

## Installation

1. Clone this repository
2. Install dependencies: `npm install`
3. Run the app: `fdk run`
4. Configure your Freshdesk domain and API key in the app settings

