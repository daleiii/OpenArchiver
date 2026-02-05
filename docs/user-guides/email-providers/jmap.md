# Connecting to a JMAP Server

This guide will walk you through connecting a JMAP-enabled email account as an ingestion source. JMAP (JSON Meta Application Protocol) is a modern, efficient alternative to IMAP that is supported by providers like Fastmail, Stalwart, Cyrus IMAP, and others.

## What is JMAP?

JMAP (RFC 8620/8621) is a modern email protocol designed as a replacement for IMAP. It uses JSON over HTTP, making it simpler to implement and more efficient for synchronization. Key benefits include:

- **Efficient sync**: Uses state strings for incremental synchronization
- **Batched requests**: Multiple operations in a single HTTP request
- **JSON-based**: Easy to debug and work with

## Supported Providers

JMAP is supported by several email providers and servers:

- **Fastmail** - Full JMAP support with API tokens
- **Stalwart Mail Server** - Open-source mail server with JMAP
- **Cyrus IMAP** - Enterprise mail server with JMAP support
- **Apache James** - Java-based mail server with JMAP

## Step-by-Step Guide

1. **Navigate to Ingestion Sources:**
   From the main dashboard, go to the **Ingestions** page.

2. **Create a New Source:**
   Click the **"Create New"** button to open the ingestion source configuration dialog.

3. **Fill in the Configuration Details:**
    - **Name:** Give your ingestion source a descriptive name, such as "Fastmail Account".

    - **Provider:** From the dropdown menu, select **"JMAP (Fastmail, etc.)"**.

    - **JMAP Session URL:** Enter the JMAP session endpoint URL for your provider.

    - **Authentication Method:** Choose between Basic Auth or Bearer Token.

    - **Credentials:** Enter your username/password or API token depending on the auth method.

4. **Save Changes:**
   Once you have filled in all the details, click the **"Save changes"** button.

## Provider-Specific Setup

### Fastmail

Fastmail provides full JMAP API access. Here's how to set it up:

1. **Get your API Token:**
    - Log in to Fastmail and go to **Settings > Privacy & Security > API tokens**
    - Create a new API token with at least "Read" access to mail
    - Copy the generated token

2. **Configure Open Archiver:**
    - **JMAP Session URL:** `https://api.fastmail.com/jmap/session`
    - **Authentication Method:** Bearer Token (API Key)
    - **API Token:** Paste the token you generated

### Stalwart Mail Server

For self-hosted Stalwart servers:

1. **Find your JMAP endpoint:**
    - Typically at `https://your-server.com/jmap/session`
    - Or use the base URL and Open Archiver will try `.well-known/jmap` discovery

2. **Configure Open Archiver:**
    - **JMAP Session URL:** `https://your-server.com/jmap/session`
    - **Authentication Method:** Basic Auth (Username/Password)
    - **Username:** Your email address
    - **Password:** Your account password

### Cyrus IMAP

For Cyrus IMAP servers with JMAP enabled:

1. **Verify JMAP is enabled:**
    - Check with your server administrator that JMAP is enabled
    - Get the JMAP endpoint URL (often `https://your-server.com/jmap`)

2. **Configure Open Archiver:**
    - **JMAP Session URL:** Your server's JMAP endpoint
    - **Authentication Method:** Basic Auth (Username/Password)
    - **Username:** Your email address
    - **Password:** Your account password

## Finding Your JMAP Session URL

If you're not sure of your JMAP session URL:

1. **Try well-known discovery:** Most JMAP servers support `/.well-known/jmap` autodiscovery. Enter your server's base URL and Open Archiver will attempt discovery.

2. **Check your provider's documentation:** Look for JMAP or API documentation from your email provider.

3. **Common patterns:**
    - Fastmail: `https://api.fastmail.com/jmap/session`
    - Self-hosted: `https://mail.yourdomain.com/jmap/session`

## What Happens Next?

After you save the connection, the system will attempt to connect to the JMAP server. The status of the ingestion source will update to reflect its current state:

- **Importing:** The system is performing the initial import of all emails. This may take a while depending on the size of your mailbox.
- **Active:** The initial import is complete, and the system will now periodically check for and archive new emails using JMAP's efficient state-based sync.
- **Paused:** The connection is valid, but the system will not check for new emails until you resume it.
- **Error:** The system was unable to connect using the provided credentials. Please double-check your Session URL, authentication method, and credentials.

You can view, edit, pause, or manually sync any of your ingestion sources from the main table on the **Ingestions** page.

## Troubleshooting

### "No JMAP account with mail capability found"

This error means the JMAP server responded but doesn't have email capabilities enabled for your account. Contact your server administrator.

### Authentication Errors

- **For bearer tokens:** Ensure the token is valid and has sufficient permissions
- **For basic auth:** Verify your username (usually full email address) and password

### Connection Timeout

- Verify the JMAP session URL is correct
- Check that the server is accessible from where Open Archiver is running
- Some servers may require VPN or specific network access
