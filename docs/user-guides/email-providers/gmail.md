# Connecting Gmail (Personal Accounts)

This guide explains how to connect a personal Gmail account (@gmail.com) to Open Archiver for email archiving.

::: info Google Workspace vs Personal Gmail
This guide is for **personal Gmail accounts**. If you're archiving emails from a Google Workspace organization, see [Google Workspace](./google-workspace.md) instead, which uses service account authentication for organization-wide access.
:::

## Overview

Open Archiver uses OAuth 2.0 to securely connect to your Gmail account. The connection process involves:

1. Setting up a Google Cloud project with OAuth credentials
2. Configuring Open Archiver with your OAuth client ID and secret
3. Authorizing the connection through Google's sign-in flow

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com/)
- Open Archiver deployed and running

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name (e.g., "Open Archiver") and click **Create**
4. Make sure your new project is selected

## Step 2: Enable the Gmail API

1. In the Google Cloud Console, go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click on **Gmail API** and then click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** as the user type (unless you have a Google Workspace organization)
3. Click **Create**
4. Fill in the required fields:
   - **App name**: Open Archiver (or your preferred name)
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **Save and Continue**

### Add Required Scopes

1. Click **Add or Remove Scopes**
2. Add the following scopes:
   - `https://www.googleapis.com/auth/gmail.readonly` - View your email messages and settings
   - `https://www.googleapis.com/auth/userinfo.email` - See your primary Google Account email address
   - `https://www.googleapis.com/auth/userinfo.profile` - See your personal info
3. Click **Update** and then **Save and Continue**

### Add Test Users

While your app is in "Testing" status (not published), you need to add test users:

1. Click **Add Users**
2. Enter the Gmail address(es) you want to connect to Open Archiver
3. Click **Add** and then **Save and Continue**

::: tip Publishing Your App
You can keep your app in "Testing" mode for personal use with up to 100 test users. If you need to connect more accounts, you'll need to publish the app and go through Google's verification process.
:::

## Step 4: Create OAuth Client Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application** as the application type
4. Enter a name (e.g., "Open Archiver Web Client")
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:4000/api/v1/auth/gmail/callback
   ```
6. Click **Create**
7. Copy the **Client ID** and **Client Secret** - you'll need these for Open Archiver

::: warning Important
The redirect URI uses `localhost` even though your server may be running elsewhere. This is intentional - the authorization flow uses a manual code exchange that doesn't require the redirect to actually reach your server.
:::

## Step 5: Configure Open Archiver

Add the following environment variables to your Open Archiver deployment:

```bash
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

If using Docker Compose, add these to your `.env` file and restart the containers:

```bash
docker compose down
docker compose up -d
```

## Step 6: Connect Your Gmail Account

1. Log in to Open Archiver
2. Go to **Dashboard** → **Ingestions**
3. Click **Add Source**
4. Select **Gmail** as the provider
5. Enter a name for this ingestion source
6. Click **Create**

A dialog will appear with authorization instructions:

### Authorization Steps

1. **Click "Sign in with Google"** - This opens Google's authorization page in a new tab

2. **Authorize the application** - Sign in with your Gmail account and grant the requested permissions

3. **Copy the authorization code** - After authorizing, you'll be redirected to a page that won't load (this is expected). Look at your browser's address bar - it will show a URL like:
   ```
   http://localhost:4000/api/v1/auth/gmail/callback?code=4/0AQSTgQGx...&scope=...
   ```
   Copy the value after `code=` and before `&scope=`

4. **Paste the code** - Return to Open Archiver and paste the code into the input field

5. **Click "Connect Account"** - Open Archiver will exchange the code for access tokens and begin archiving

## Troubleshooting

### "No refresh token received"

This error occurs when Google doesn't provide a refresh token. To fix this:

1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
2. Find "Open Archiver" (or your app name) and click **Remove Access**
3. Try connecting again in Open Archiver

### "Invalid or expired code"

Authorization codes expire quickly. Make sure to:
- Complete the authorization process without delays
- Copy the entire code value (it can be quite long)
- Paste it immediately into Open Archiver

### "Access blocked: App not verified"

If you see this warning:
1. Click **Advanced** → **Go to [App Name] (unsafe)**
2. Continue with the authorization

This warning appears for apps in "Testing" mode that haven't been verified by Google.

## What Gets Archived

Once connected, Open Archiver will:

1. Perform an initial import of all emails in your Gmail account
2. Continue syncing new emails as they arrive
3. Index email content and attachments for full-text search

The connection uses read-only access - Open Archiver cannot modify or delete your emails.

## Revoking Access

To disconnect your Gmail account:

1. In Open Archiver, delete the ingestion source
2. Optionally, revoke access at [Google Account Permissions](https://myaccount.google.com/permissions)
