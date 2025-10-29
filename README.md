<div align="center">
  <img src="logo.svg" alt="logo" width="150">
</div>

# Google Sheets Large Data Request to API

This Google Apps Script project is designed to reliably import large datasets from a paginated API into Google Sheets. It is built to handle common challenges such as API pagination, authentication, rate limiting, and Google Apps Script's execution time limits.

## Overview

The script automates the process of fetching data from an API, processing it, and updating a Google Sheet with the new data. It is designed to be run on a schedule (e.g., daily) to keep the sheet synchronized with the source API.

The project is structured to be modular and configurable, allowing for easy adaptation to different APIs and data structures.

## Key Features

*   **Paginated API Fetching:** Iterates through pages of API results, fetching data in chunks.
*   **Resumable Execution:** Saves its progress (the last fetched page) to automatically resume from where it left off in the next run. This is essential for handling large datasets that would otherwise exceed Google Apps Script's execution time limits.
*   **OAuth 2.0 Authentication:** Manages access tokens, including automatic refreshing of expired tokens. It supports both `refresh_token` and `client_credentials` grant types.
*   **Configuration-Driven:** Reports are defined by configuration objects, making it easy to add new reports or modify existing ones without changing the core logic.
*   **Upsert Functionality:** Intelligently updates existing rows in the Google Sheet (based on a unique key) and appends new rows, preventing duplicate entries.
*   **Automated Auditing:** Logs the details of each run (e.g., success/failure, number of records processed, execution time) to a dedicated audit sheet for easy monitoring.
*   **Email Notifications:** Sends summary emails upon completion of a run, with details about the outcome.
*   **Error Handling & Retries:** Implements a retry mechanism with exponential backoff for handling transient API errors.
*   **Testing Framework:** Includes a suite of tests to ensure the reliability of the script's functionality.

## How It Works

1.  **Scheduled Trigger:** A time-based trigger in Google Apps Script initiates the process by calling a designated function (e.g., `runUsersReport`).
2.  **Configuration Loading:** The script loads the configuration for the specified report, which includes the API endpoint, request parameters, target sheet name, and unique key for identifying records.
3.  **Authentication:** It retrieves a valid access token, refreshing it if necessary using a stored refresh token or client credentials.
4.  **State Restoration:** The script checks for a saved state from the previous run to determine which page of data to start fetching from.
5.  **Pagination Loop:** It fetches data from the API one page at a time. The loop continues until it has retrieved all pages, or it approaches the Google Apps Script execution time limit.
6.  **Data Processing:** The fetched data (assumed to be in JSON format) is parsed and transformed into a flat structure suitable for a spreadsheet.
7.  **Upsert to Google Sheet:** The processed records are then "upserted" into the target sheet. Existing rows are updated in place, and new records are appended.
8.  **State Saving:** Upon completion of the loop, the script saves the number of the last successfully fetched page.
9.  **Logging and Notification:** An audit entry is created to log the outcome of the run, and a notification email is sent to designated recipients.

## Project Structure

The project is organized into several `.gs` files, each responsible for a specific aspect of the functionality:

*   `main.gs`: Main entry points for running and setting up reports.
*   `reportRunner.gs`: The core engine for running a report based on a configuration.
*   `config.gs`: Contains the configuration objects for different reports (e.g., `CONFIG`, `CONFIG_TX`).
*   `configHelper.gs`: Provides helper functions to simplify the creation of configuration objects.
*   `fetch.gs`: Handles the low-level details of making API requests, including authentication and retries.
*   `sheet.gs`: Provides functions for interacting with Google Sheets (e.g., creating sheets, upserting data).
*   `auth.gs`: Manages OAuth 2.0 authentication and token handling.
*   `state.gs`: Manages saving and retrieving the script's execution state.
*   `audit.gs`: Handles the creation of audit logs.
*   `notifications.gs`: Manages sending of email notifications.
*   `transactions.gs`: Contains logic specific to the "transactions" report.
*   `utils.gs`: A collection of utility functions used throughout the project.
*   `tests.gs`: Contains the test suite for the project.
*   `debug.gs`: Includes helper functions for debugging.
*   `raw.gs`: Contains functionality for saving raw API responses to Google Drive.

## Current Status

The project is well-developed and includes most of the core features required for reliable data importing. The code is modular and extensible.

### To-Do / Areas for Improvement

*   **CSV Parsing:** The current implementation is primarily designed for JSON responses. While the structure allows for it, the CSV parsing logic is not yet implemented.
*   **Raw Payload Saving:** The functionality to save raw API responses to Google Drive is present but is currently disabled in the configurations.
*   **Enhanced Documentation:** While the code is reasonably clear, more detailed inline documentation and setup instructions would be beneficial.

## Setup

To use this project, you will need to:

1.  **Create a new Google Apps Script project** and copy these files into it.
2.  **Configure Script Properties:** In the Google Apps Script editor, go to **Project Settings > Script Properties** and add the necessary properties for authentication, such as:
    *   `DAXKO_TOKEN_URL`
    *   `DAXKO_CLIENT_ID`
    *   `DAXKO_CLIENT_SECRET` or `DAXKO_REFRESH_TOKEN`
    *   `DAXKO_SCOPE` (if using `client_credentials`)
    *   `DIGEST_TO`: A comma-separated list of email addresses for notifications.
3.  **Customize `config.gs`:** Modify the configuration objects in `config.gs` to match the API you are working with. You will need to set the `apiUrl`, `outputFields`, `sheetName`, `uniqueKey`, etc.
4.  **Bootstrap Authentication:** Run the `BootstrapDaxkoTokens` function once to perform the initial authentication and store the tokens.
5.  **Set up Triggers:** Run the `setupAll` function to create the time-based triggers that will run the reports automatically.
